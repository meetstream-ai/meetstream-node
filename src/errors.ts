/**
 * Error types raised by the MeetStream SDK.
 *
 * MeetStream error responses carry a `message` field (older responses use
 * `error`, or a bare JSON string). It is surfaced as `error.message` and the
 * raw body is kept on `error.body`.
 */

export interface ErrorOptions {
  status?: number;
  body?: unknown;
  requestId?: string;
  retryAfter?: number;
  code?: string;
}

export class MeetStreamError extends Error {
  /** HTTP status, when the failure came from the API rather than the network. */
  readonly status?: number;
  /** Parsed response body, when there was one. */
  readonly body?: unknown;
  /** Request id from the response headers, useful when contacting support. */
  readonly requestId?: string;
  /**
   * Seconds to wait before retrying, from the `Retry-After` header (or the
   * body's `retry_after`) when the API sent one. Set on 429 and on the 409 a
   * create returns while an earlier request with the same key is still saving.
   */
  readonly retryAfter?: number;
  /**
   * Machine-readable error code when the API sent one, for example
   * `rate_limit_exceeded` or `unsupported_on_whatsapp`.
   */
  readonly code?: string;

  constructor(message: string, opts: ErrorOptions = {}) {
    super(message);
    this.name = new.target.name;
    this.status = opts.status;
    this.body = opts.body;
    this.requestId = opts.requestId;
    this.retryAfter = opts.retryAfter;
    this.code = opts.code;
  }
}

/** The request never reached the API, or the connection failed mid-flight. */
export class ConnectionError extends MeetStreamError {}

/** The request exceeded the configured timeout. */
export class TimeoutError extends MeetStreamError {}

/** 400 - the request was malformed. Read `message`; do not retry unchanged. */
export class BadRequestError extends MeetStreamError {}

/** 401 - no API key was sent. The header is missing entirely. */
export class AuthenticationError extends MeetStreamError {}

/** 403 - a key was sent but rejected: wrong, revoked, or truncated. */
export class PermissionError extends MeetStreamError {}

/** 404 - unknown bot id, transcript id, or route. */
export class NotFoundError extends MeetStreamError {}

/**
 * 409 - the request conflicts with current state: same `deduplication_key`
 * for a different meeting, a live-bot command sent to a bot that is not in the
 * meeting, or an occurrence that is already scheduled.
 *
 * When `retryAfter` is set, an earlier create with the same `Idempotency-Key`
 * or `deduplication_key` is still saving. Retry with the same key; the client
 * does this for you within `maxRetries`.
 */
export class ConflictError extends MeetStreamError {}

/**
 * 429 - rate limited. `retryAfter` is in seconds when the API supplied it.
 *
 * Pay-as-you-go accounts are limited on bot creates; the body then also says
 * which window was hit (`limit`, `window`). Live-bot commands share a per-bot
 * limit.
 */
export class RateLimitError extends MeetStreamError {
  /** The limit that was hit, when the API reported it. */
  readonly limit?: number;
  /** The window the limit applies to, when the API reported it. */
  readonly window?: 'minute' | 'hour' | (string & {});

  constructor(message: string, opts: ErrorOptions = {}) {
    super(message, opts);
    const b = opts.body && typeof opts.body === 'object' ? (opts.body as Record<string, unknown>) : {};
    if (typeof b['limit'] === 'number') this.limit = b['limit'];
    if (typeof b['window'] === 'string') this.window = b['window'];
  }
}

/** 5xx - transient server error. Safe to retry with backoff. */
export class ServerError extends MeetStreamError {}

/**
 * The resource exists but is not ready yet (HTTP 202).
 *
 * This is **not** a failure. It is normal for transcripts and per-participant
 * streams while a bot is still in the meeting or media is still processing.
 *
 * One trap: a bot that used a streaming-only transcription provider returns 202
 * *forever*, because no post-call transcript will ever exist. Always cap your
 * polling. The `waitFor*` helpers do this for you.
 */
export class NotReadyError extends MeetStreamError {}

/** Map an HTTP status onto the right error class. */
export function errorForStatus(
  status: number,
  message: string,
  opts: Omit<ErrorOptions, 'status'> = {},
): MeetStreamError {
  const base = { ...opts, status };
  switch (status) {
    case 202: return new NotReadyError(message, base);
    case 400: return new BadRequestError(message, base);
    case 401: return new AuthenticationError(message, base);
    case 403: return new PermissionError(message, base);
    case 404: return new NotFoundError(message, base);
    case 409: return new ConflictError(message, base);
    case 429: return new RateLimitError(message, base);
    default:
      if (status >= 500) return new ServerError(message, base);
      return new MeetStreamError(message, base);
  }
}
