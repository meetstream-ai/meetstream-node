/**
 * Error types raised by the MeetStream SDK.
 *
 * Every MeetStream error response carries a `message` field; it is surfaced as
 * `error.message` and the raw body is kept on `error.body`.
 */

export class MeetStreamError extends Error {
  /** HTTP status, when the failure came from the API rather than the network. */
  readonly status?: number;
  /** Parsed response body, when there was one. */
  readonly body?: unknown;
  /** Request id from the response headers, useful when contacting support. */
  readonly requestId?: string;

  constructor(message: string, opts: { status?: number; body?: unknown; requestId?: string } = {}) {
    super(message);
    this.name = new.target.name;
    this.status = opts.status;
    this.body = opts.body;
    this.requestId = opts.requestId;
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

/** 409 - deduplication conflict: same `deduplication_key`, different meeting. */
export class ConflictError extends MeetStreamError {}

/** 429 - rate limited. `retryAfter` is in seconds when the API supplied it. */
export class RateLimitError extends MeetStreamError {
  readonly retryAfter?: number;
  constructor(message: string, opts: { status?: number; body?: unknown; requestId?: string; retryAfter?: number } = {}) {
    super(message, opts);
    this.retryAfter = opts.retryAfter;
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
  opts: { body?: unknown; requestId?: string; retryAfter?: number } = {},
): MeetStreamError {
  const base = { status, body: opts.body, requestId: opts.requestId };
  switch (status) {
    case 202: return new NotReadyError(message, base);
    case 400: return new BadRequestError(message, base);
    case 401: return new AuthenticationError(message, base);
    case 403: return new PermissionError(message, base);
    case 404: return new NotFoundError(message, base);
    case 409: return new ConflictError(message, base);
    case 429: return new RateLimitError(message, { ...base, retryAfter: opts.retryAfter });
    default:
      if (status >= 500) return new ServerError(message, base);
      return new MeetStreamError(message, base);
  }
}
