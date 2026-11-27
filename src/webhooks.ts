import { createHmac, timingSafeEqual } from 'node:crypto';
import type {
  CustomFunctionCall,
  FailureReason,
  LiveTranscriptPayload,
  StopReason,
  WebhookPayload,
} from './types.js';

/**
 * Constant-time comparison of two signature strings.
 *
 * `timingSafeEqual` throws when the buffers differ in length, so length is
 * checked first and a mismatch simply means "not equal".
 */
function safeEqual(a: string, b: string): boolean {
  const bufA = Buffer.from(a, 'utf8');
  const bufB = Buffer.from(b, 'utf8');
  if (bufA.length !== bufB.length) return false;
  return timingSafeEqual(bufA, bufB);
}

/** Options for {@link verifyWebhookSignature} and {@link parseWebhook}. */
export interface VerifyWebhookOptions {
  /**
   * The `X-MeetStream-Timestamp` header: an ISO 8601 UTC string, for example
   * `2026-11-19T14:30:00Z`. The HMAC does not cover this header, so it is
   * only cross-checked: when present, it must match the signed body's
   * `timestamp`, or the delivery is rejected.
   */
  timestamp?: string | null;
  /**
   * Reject the delivery when the signed body's `timestamp` field is missing,
   * cannot be parsed, or is more than this many seconds away from now. The
   * window is checked against the body (which the HMAC covers), never against
   * the header alone. Off when not set.
   */
  toleranceSeconds?: number;
  /** The current time, for tests. Default `Date.now()`. */
  now?: Date | number;
}

function parseIsoMillis(value: unknown): number | null {
  if (typeof value !== 'string' || value.trim() === '') return null;
  const ms = Date.parse(value.trim());
  return Number.isNaN(ms) ? null : ms;
}

/**
 * Replay check after the signature verified. Reads `timestamp` from the signed
 * body; the unsigned header must agree with it when it is sent.
 */
function signedTimestampWithinTolerance(body: string, options: VerifyWebhookOptions): boolean {
  let signed: unknown;
  try {
    signed = (JSON.parse(body) as { timestamp?: unknown } | null)?.timestamp;
  } catch {
    return false;
  }
  const sent = parseIsoMillis(signed);
  if (sent === null) return false;
  if (options.timestamp !== undefined && options.timestamp !== null) {
    const header = parseIsoMillis(options.timestamp);
    if (header === null || header !== sent) return false;
  }
  const { now } = options;
  const current = now === undefined ? Date.now() : typeof now === 'number' ? now : now.getTime();
  return Math.abs(current - sent) <= (options.toleranceSeconds as number) * 1000;
}

/**
 * Verify a MeetStream webhook signature.
 *
 * Only **workspace webhook endpoints** are signed (`X-MeetStream-Signature`,
 * `X-MeetStream-Timestamp`). Per-bot `callback_url` deliveries and live
 * transcript POSTs are never signed: protect those with a secret token in the
 * URL instead (see the README).
 *
 * Pass the **raw request body**, exactly as received. Re-serializing a parsed
 * object changes key order and whitespace and the signature will never match.
 *
 * In Express, that means `express.raw({ type: 'application/json' })` on the
 * webhook route, not `express.json()`.
 *
 * @param payload   raw request body
 * @param signature the `X-MeetStream-Signature` header
 * @param secret    your webhook signing secret
 * @param options   optional replay window: set `toleranceSeconds`, and pass
 *                  the `X-MeetStream-Timestamp` header as `timestamp`. The
 *                  window uses the signed body's `timestamp` field; the
 *                  header must match it when sent.
 */
export function verifyWebhookSignature(
  payload: string | Buffer,
  signature: string,
  secret: string,
  options: VerifyWebhookOptions = {},
): boolean {
  if (!signature || !secret) return false;
  const body = typeof payload === 'string' ? payload : payload.toString('utf8');
  const expected = createHmac('sha256', secret).update(body, 'utf8').digest('hex');

  // Accept both a bare hex digest and a "sha256=" prefixed form.
  const candidate = signature.startsWith('sha256=') ? signature.slice(7) : signature;
  if (!safeEqual(expected, candidate.trim())) return false;

  if (options.toleranceSeconds !== undefined) {
    return signedTimestampWithinTolerance(body, options);
  }
  return true;
}

/**
 * Verify and parse in one step. Throws when the signature does not match (or,
 * with `options.toleranceSeconds`, when the timestamp is outside the window),
 * so a forged payload can never reach your handler.
 */
export function parseWebhook(
  payload: string | Buffer,
  signature: string,
  secret: string,
  options: VerifyWebhookOptions = {},
): WebhookPayload {
  if (!verifyWebhookSignature(payload, signature, secret, options)) {
    throw new Error('Webhook signature verification failed');
  }
  const body = typeof payload === 'string' ? payload : payload.toString('utf8');
  return JSON.parse(body) as WebhookPayload;
}

/**
 * True when this event ends the bot's time in the meeting.
 *
 * Every ending arrives once as `event: "bot.stopped"`, whatever the reason;
 * {@link stopReason} tells you why. Post-call processing continues afterwards
 * and `bot.done` is the final event. `bot.error` is deliberately not terminal:
 * the bot keeps running.
 */
export function isTerminal(event: WebhookPayload): boolean {
  return event.event === 'bot.stopped';
}

/**
 * The specific reason a bot stopped: `bot.stopped`, `bot.kicked`,
 * `bot.notallowed`, `bot.denied` or `bot.failed`.
 *
 * Reads `bot_event`, and falls back to `bot_status` for payloads without it.
 * `bot_status` alone cannot tell a kick from a clean exit (both are `Stopped`).
 */
export function stopReason(event: WebhookPayload): StopReason {
  if (typeof event.bot_event === 'string' && event.bot_event !== '') return event.bot_event;
  switch (String(event.bot_status ?? '').toLowerCase()) {
    case 'notallowed': return 'bot.notallowed';
    case 'denied': return 'bot.denied';
    case 'error':
    case 'failed': return 'bot.failed';
    default: return 'bot.stopped';
  }
}

/** What a `failure_reason` on `bot.failed` means. Unknown reasons fall through to the generic text. */
const FAILURE_REASONS: Record<string, string> = {
  invalid_meeting_link: 'The meeting link is invalid or the meeting was not found. Check the link.',
  meeting_restricted:
    "Meeting access is restricted: the organizer's settings do not let guests ask to join. Use a signed-in bot from an allowed domain, or ask the host to relax access.",
  meeting_not_started: 'The meeting had not started. Start it first, or schedule the bot with join_at.',
  meeting_ended: 'The meeting had already ended.',
  sign_in_required: 'The meeting does not accept anonymous guests. Use a signed-in bot.',
  google_sign_in_failed: 'The signed-in bot could not complete Google sign-in. Check the login and domain settings.',
  cant_join_call: 'The platform refused the guest join. Use a signed-in bot, or confirm the meeting allows external guests.',
};

/**
 * Human-readable explanation of why a bot stopped, from the terminal event.
 * On `bot.failed` it reads `failure_reason` when the platform sent one.
 */
export function describeStop(event: WebhookPayload): string {
  const reason = stopReason(event);
  const failure: FailureReason | undefined = event.failure_reason;
  if (reason === 'bot.failed' && typeof failure === 'string' && FAILURE_REASONS[failure]) {
    return FAILURE_REASONS[failure];
  }
  switch (reason) {
    case 'bot.stopped': return 'The bot left normally.';
    case 'bot.kicked': return 'A participant removed the bot from the meeting.';
    case 'bot.notallowed': return 'The bot sat in the waiting room until it timed out. Nobody admitted it.';
    case 'bot.denied': return 'A host actively refused the bot. This is a human decision; do not auto-retry.';
    case 'bot.failed': return 'The bot session crashed. Create a fresh bot.';
    default: return event.message ?? `Bot stopped (${String(event.bot_event ?? event.bot_status ?? 'unknown')}).`;
  }
}

/**
 * Realtime participant events for a raised or lowered hand. Opt-in per bot:
 * list them in `recording_config.realtime_endpoints[].events`. They are never
 * sent to workspace webhooks.
 */
export const PARTICIPANT_HAND_EVENTS = ['participant_events.raise_hand', 'participant_events.lower_hand'] as const;

/**
 * `"raise_hand"` or `"lower_hand"` for a participant hand event, else `null`.
 *
 * Only changes are reported, never the bot's own hand. A participant who
 * leaves with a hand up gets no `lower_hand`, so clear their state on
 * `participant_events.leave` too.
 */
export function handEvent(event: { event?: unknown }): 'raise_hand' | 'lower_hand' | null {
  const name = event?.event;
  if (name === 'participant_events.raise_hand') return 'raise_hand';
  if (name === 'participant_events.lower_hand') return 'lower_hand';
  return null;
}

/* ------------------------------------------------------ live transcripts */

/**
 * True when a live transcript POST is final text you can keep.
 *
 * - `sentence` mode: always true (only finals are sent).
 * - `word_level` mode: always true (every word is final).
 * - `raw` mode (the default when `transcription_mode` is absent): true when
 *   `is_final === true` or `end_of_turn === true`; false for interim results.
 */
export function isFinalSegment(payload: Pick<LiveTranscriptPayload, 'transcription_mode' | 'is_final' | 'end_of_turn'>): boolean {
  const mode = payload?.transcription_mode ?? 'raw';
  if (mode === 'sentence' || mode === 'word_level') return true;
  return payload?.is_final === true || payload?.end_of_turn === true;
}

/* ----------------------------------------------------- custom functions */

/** Header on every MIA custom function call: the bot that made the call. */
export const BOT_ID_HEADER = 'X-Bot-ID';
/** Header on a MIA custom function call when the agent config is known. */
export const AGENT_ID_HEADER = 'X-Agent-ID';

/** Headers as a fetch `Headers`, or a Node / Express style object. */
export type HeaderSource =
  | { get(name: string): string | null }
  | Record<string, string | string[] | undefined>;

function readHeader(headers: HeaderSource | undefined, name: string): string | undefined {
  if (!headers) return undefined;
  if (typeof (headers as { get?: unknown }).get === 'function') {
    return (headers as { get(name: string): string | null }).get(name) ?? undefined;
  }
  const wanted = name.toLowerCase();
  for (const [key, value] of Object.entries(headers as Record<string, string | string[] | undefined>)) {
    if (key.toLowerCase() === wanted) return Array.isArray(value) ? value[0] : value;
  }
  return undefined;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** What {@link parseCustomFunctionCall} returns. */
export interface ParsedCustomFunctionCall {
  /** The function name. `null` in args-only mode (the body carries no name). */
  name: string | null;
  /** From the `X-Bot-ID` header; in envelope mode only, `bot.bot_id` when the header is missing. */
  botId: string | null;
  /** From the `X-Agent-ID` header; in envelope mode only, `bot.agent_id` when the header is missing. */
  agentId: string | null;
  args: Record<string, unknown>;
  /** The envelope's `bot` block. Absent in args-only mode. */
  bot?: CustomFunctionCall['bot'];
}

/**
 * Read a MIA custom function call in your tool endpoint.
 *
 * You state the body shape; it is never guessed from the content:
 * - envelope (default): `{name, bot: {bot_id, dynamic_vars, agent_id?, speaker?}, args}`.
 * - `{ payloadArgsOnly: true }`, for a function configured with
 *   `payload_args_only`: the whole body is `args`; `name` is `null` and `bot`
 *   is absent. Arguments come from the model, so they are never read as an
 *   envelope, even when they look like one.
 *
 * `botId` comes from the `X-Bot-ID` header first, and from `bot.bot_id` only
 * when the header is missing and the mode is envelope.
 *
 * **Every field, `X-Bot-ID` included, is unauthenticated** unless your
 * endpoint checks its own secret: put a token in the function's `headers` and
 * compare it before you trust the call.
 *
 * @param body    the request body: raw string or Buffer, or parsed JSON
 * @param headers the request headers
 */
export function parseCustomFunctionCall(
  body: string | Buffer | Record<string, unknown>,
  headers?: HeaderSource,
  options: { payloadArgsOnly?: boolean } = {},
): ParsedCustomFunctionCall {
  const parsed: unknown =
    typeof body === 'string' ? JSON.parse(body || '{}')
    : Buffer.isBuffer(body) ? JSON.parse(body.toString('utf8') || '{}')
    : body;
  const obj = isPlainObject(parsed) ? parsed : {};
  const headerBotId = readHeader(headers, BOT_ID_HEADER) || null;
  const headerAgentId = readHeader(headers, AGENT_ID_HEADER) || null;

  if (options.payloadArgsOnly) {
    return { name: null, botId: headerBotId, agentId: headerAgentId, args: obj };
  }
  const bot = isPlainObject(obj.bot) ? (obj.bot as CustomFunctionCall['bot']) : undefined;
  const result: ParsedCustomFunctionCall = {
    name: typeof obj.name === 'string' ? obj.name : null,
    botId: headerBotId ?? (typeof bot?.bot_id === 'string' ? bot.bot_id : null),
    agentId: headerAgentId ?? (typeof bot?.agent_id === 'string' ? bot.agent_id : null),
    args: isPlainObject(obj.args) ? obj.args : {},
  };
  if (bot) result.bot = bot;
  return result;
}
