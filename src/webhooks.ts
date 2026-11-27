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
  /** The `X-MeetStream-Timestamp` header: an ISO 8601 UTC string, for example `2026-11-19T14:30:00Z`. */
  timestamp?: string | null;
  /**
   * Reject the delivery when `timestamp` is missing, cannot be parsed, or is
   * more than this many seconds away from now. Off when not set.
   */
  toleranceSeconds?: number;
  /** The current time, for tests. Default `Date.now()`. */
  now?: Date | number;
}

/**
 * True when `timestamp` (ISO 8601) is within `toleranceSeconds` of `now`.
 * False when it is missing or cannot be parsed.
 */
function timestampWithinTolerance(
  timestamp: string | null | undefined,
  toleranceSeconds: number,
  now: Date | number | undefined,
): boolean {
  if (!timestamp) return false;
  const sent = Date.parse(timestamp.trim());
  if (Number.isNaN(sent)) return false;
  const current = now === undefined ? Date.now() : typeof now === 'number' ? now : now.getTime();
  return Math.abs(current - sent) <= toleranceSeconds * 1000;
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
 * @param options   optional replay window: pass the `X-MeetStream-Timestamp`
 *                  header as `timestamp` and set `toleranceSeconds`
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
    return timestampWithinTolerance(options.timestamp, options.toleranceSeconds, options.now);
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
  /** The function name. `null` for a `payload_args_only` body, which carries no name. */
  name: string | null;
  /** From the `X-Bot-ID` header, else `bot.bot_id` in the body. */
  botId: string | null;
  /** From the `X-Agent-ID` header, else `bot.agent_id` in the body. */
  agentId: string | null;
  args: Record<string, unknown>;
  /** The `bot` block of the envelope, when the body has one. */
  bot?: CustomFunctionCall['bot'];
}

/**
 * Read a MIA custom function call in your tool endpoint.
 *
 * Handles both body shapes: the default envelope
 * `{name, bot: {bot_id, dynamic_vars, agent_id?, speaker?}, args}` and the
 * `payload_args_only` body (only the arguments). The shape is detected from
 * the body; pass `{ payloadArgsOnly: true }` to force the args-only reading
 * when your arguments themselves have `name` and `args` keys.
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

  const isEnvelope =
    !options.payloadArgsOnly &&
    typeof obj.name === 'string' &&
    isPlainObject(obj.bot) &&
    (obj.args === undefined || isPlainObject(obj.args));

  if (!isEnvelope) {
    return { name: null, botId: headerBotId, agentId: headerAgentId, args: obj };
  }
  const bot = obj.bot as CustomFunctionCall['bot'];
  return {
    name: obj.name as string,
    botId: headerBotId ?? (typeof bot.bot_id === 'string' ? bot.bot_id : null),
    agentId: headerAgentId ?? (typeof bot.agent_id === 'string' ? bot.agent_id : null),
    args: (obj.args as Record<string, unknown> | undefined) ?? {},
    bot,
  };
}
