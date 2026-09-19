import { createHmac, timingSafeEqual } from 'node:crypto';
import type { StopReason, WebhookPayload } from './types.js';

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

/**
 * Verify a MeetStream webhook signature.
 *
 * Pass the **raw request body**, exactly as received. Re-serializing a parsed
 * object changes key order and whitespace and the signature will never match.
 *
 * In Express, that means `express.raw({ type: 'application/json' })` on the
 * webhook route, not `express.json()`.
 *
 * @param payload   raw request body
 * @param signature the signature header sent with the request
 * @param secret    your webhook signing secret
 */
export function verifyWebhookSignature(
  payload: string | Buffer,
  signature: string,
  secret: string,
): boolean {
  if (!signature || !secret) return false;
  const body = typeof payload === 'string' ? payload : payload.toString('utf8');
  const expected = createHmac('sha256', secret).update(body, 'utf8').digest('hex');

  // Accept both a bare hex digest and a "sha256=" prefixed form.
  const candidate = signature.startsWith('sha256=') ? signature.slice(7) : signature;
  return safeEqual(expected, candidate.trim());
}

/**
 * Verify and parse in one step. Throws when the signature does not match, so a
 * forged payload can never reach your handler.
 */
export function parseWebhook(
  payload: string | Buffer,
  signature: string,
  secret: string,
): WebhookPayload {
  if (!verifyWebhookSignature(payload, signature, secret)) {
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

/**
 * Human-readable explanation of why a bot stopped, from the terminal event.
 */
export function describeStop(event: WebhookPayload): string {
  switch (stopReason(event)) {
    case 'bot.stopped': return 'The bot left normally.';
    case 'bot.kicked': return 'A participant removed the bot from the meeting.';
    case 'bot.notallowed': return 'The bot sat in the waiting room until it timed out. Nobody admitted it.';
    case 'bot.denied': return 'A host actively refused the bot. This is a human decision; do not auto-retry.';
    case 'bot.failed': return 'The bot session crashed. Create a fresh bot.';
    default: return event.message ?? `Bot stopped (${String(event.bot_event ?? event.bot_status ?? 'unknown')}).`;
  }
}
