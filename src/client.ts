import { ConnectionError, MeetStreamError, TimeoutError, errorForStatus } from './errors.js';

export interface ClientOptions {
  /**
   * Your MeetStream API key. Falls back to `process.env.MEETSTREAM_API_KEY`.
   * Create one at https://app.meetstream.ai/api-key
   */
  apiKey?: string;
  /** Override the API base. Defaults to `MEETSTREAM_API_URL` or the production API. */
  baseUrl?: string;
  /** Per-request timeout in milliseconds. Default 60000. */
  timeout?: number;
  /** Retries for transient failures (429, 5xx, network). Default 2. */
  maxRetries?: number;
  /** Extra headers sent on every request. */
  defaultHeaders?: Record<string, string>;
  /** Swap in a custom fetch (testing, proxies, instrumentation). */
  fetch?: typeof globalThis.fetch;
}

export interface RequestOptions {
  /**
   * Idempotency key. Retrying `createBot` with the same key returns the
   * original bot instead of creating a second one.
   *
   * Generate the UUID **once, outside** your retry loop and persist it with the
   * job. A fresh UUID per attempt defeats the whole mechanism.
   */
  idempotencyKey?: string;
  /** Per-call timeout override, in milliseconds. */
  timeout?: number;
  /** Per-call retry override. */
  maxRetries?: number;
  /** Extra headers for this call only. */
  headers?: Record<string, string>;
  /** Abort signal for this call. */
  signal?: AbortSignal;
}

export const DEFAULT_BASE_URL = 'https://api.meetstream.ai/api/v1';

const RETRYABLE = new Set([408, 429, 500, 502, 503, 504]);

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Extract the API's `message` field, falling back to something useful. */
function messageFrom(body: unknown, status: number): string {
  if (body && typeof body === 'object') {
    const b = body as Record<string, unknown>;
    for (const key of ['message', 'detail', 'error']) {
      const v = b[key];
      if (typeof v === 'string' && v) return v;
    }
  }
  if (typeof body === 'string' && body.trim()) return body.trim().slice(0, 500);
  return `MeetStream API returned HTTP ${status}`;
}

/**
 * Low-level HTTP transport. Handles auth, retries, timeouts and the two
 * MeetStream status codes that are not failures.
 *
 * Note the auth scheme: the REST API uses `Authorization: Token <key>`. The MCP
 * server at mcp.meetstream.ai uses `Bearer` instead. They are not
 * interchangeable, and sending the wrong one returns 401.
 */
export class HttpClient {
  readonly baseUrl: string;
  readonly timeout: number;
  readonly maxRetries: number;

  private readonly apiKey: string;
  private readonly defaultHeaders: Record<string, string>;
  private readonly fetchImpl: typeof globalThis.fetch;

  constructor(options: ClientOptions = {}) {
    const apiKey = options.apiKey ?? process.env['MEETSTREAM_API_KEY'];
    if (!apiKey) {
      throw new MeetStreamError(
        'Missing MeetStream API key. Pass { apiKey } or set MEETSTREAM_API_KEY. ' +
          'Create a key at https://app.meetstream.ai/api-key',
      );
    }
    this.apiKey = apiKey;
    this.baseUrl = (options.baseUrl ?? process.env['MEETSTREAM_API_URL'] ?? DEFAULT_BASE_URL).replace(/\/+$/, '');
    this.timeout = options.timeout ?? 60_000;
    this.maxRetries = options.maxRetries ?? 2;
    this.defaultHeaders = options.defaultHeaders ?? {};

    const f = options.fetch ?? globalThis.fetch;
    if (!f) {
      throw new MeetStreamError('No global fetch available. Use Node 18.17+ or pass a fetch implementation.');
    }
    this.fetchImpl = f;
  }

  /**
   * Issue a request.
   *
   * Two MeetStream status codes are deliberately not errors here:
   * - **507** is an idempotent replay. Your retry matched an existing bot, so
   *   the body is returned as a success.
   * - **202** means "not ready yet". It throws `NotReadyError`, which the
   *   `waitFor*` helpers catch and retry against a cap.
   */
  async request<T>(
    method: string,
    path: string,
    opts: RequestOptions & { query?: Record<string, unknown>; body?: unknown } = {},
  ): Promise<T> {
    const url = new URL(this.baseUrl + (path.startsWith('/') ? path : `/${path}`));
    for (const [k, v] of Object.entries(opts.query ?? {})) {
      if (v !== undefined && v !== null) url.searchParams.set(k, String(v));
    }

    const headers: Record<string, string> = {
      Authorization: `Token ${this.apiKey}`,
      Accept: 'application/json',
      'User-Agent': '@meetstream/sdk',
      ...this.defaultHeaders,
      ...opts.headers,
    };
    if (opts.idempotencyKey) headers['Idempotency-Key'] = opts.idempotencyKey;
    if (opts.body !== undefined) headers['Content-Type'] = 'application/json';

    const maxRetries = opts.maxRetries ?? this.maxRetries;
    const timeout = opts.timeout ?? this.timeout;
    let lastError: MeetStreamError | undefined;

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), timeout);
      const onAbort = () => controller.abort();
      opts.signal?.addEventListener('abort', onAbort);

      try {
        const res = await this.fetchImpl(url, {
          method,
          headers,
          body: opts.body === undefined ? undefined : JSON.stringify(opts.body),
          signal: controller.signal,
        });

        const raw = await res.text();
        let parsed: unknown = undefined;
        if (raw) { try { parsed = JSON.parse(raw); } catch { parsed = raw; } }

        // 202 sits inside the 2xx range, so it must be caught *before* the
        // res.ok check or "not ready yet" would silently look like success.
        // 507 is the mirror case: outside 2xx, but an idempotent replay and
        // therefore a success.
        if (res.status !== 202 && (res.ok || res.status === 507)) return parsed as T;

        const requestId = res.headers.get('x-request-id') ?? undefined;
        const retryAfterHeader = res.headers.get('retry-after');
        const retryAfter = retryAfterHeader ? Number(retryAfterHeader) : undefined;

        const err = errorForStatus(res.status, messageFrom(parsed, res.status), {
          body: parsed,
          requestId,
          retryAfter: Number.isFinite(retryAfter) ? retryAfter : undefined,
        });

        // 202 is "not ready" - never retried at the transport layer, because the
        // caller decides the polling cadence via the waitFor* helpers.
        if (!RETRYABLE.has(res.status) || attempt === maxRetries) throw err;
        lastError = err;
        await sleep(retryAfter && Number.isFinite(retryAfter) ? retryAfter * 1000 : 2 ** attempt * 500 + Math.random() * 250);
        continue;
      } catch (e) {
        if (e instanceof MeetStreamError) {
          if (!lastError || e !== lastError) throw e;
          continue;
        }
        const aborted = (e as Error)?.name === 'AbortError';
        const wrapped = aborted
          ? new TimeoutError(`Request timed out after ${timeout}ms: ${method} ${path}`)
          : new ConnectionError(`Could not reach the MeetStream API: ${(e as Error)?.message ?? e}`);
        if (attempt === maxRetries || (aborted && opts.signal?.aborted)) throw wrapped;
        lastError = wrapped;
        await sleep(2 ** attempt * 500 + Math.random() * 250);
      } finally {
        clearTimeout(timer);
        opts.signal?.removeEventListener('abort', onAbort);
      }
    }

    throw lastError ?? new MeetStreamError('Request failed');
  }

  get<T>(path: string, opts: RequestOptions & { query?: Record<string, unknown> } = {}): Promise<T> {
    return this.request<T>('GET', path, opts);
  }
  post<T>(path: string, body?: unknown, opts: RequestOptions & { query?: Record<string, unknown> } = {}): Promise<T> {
    return this.request<T>('POST', path, { ...opts, body });
  }
  put<T>(path: string, body?: unknown, opts: RequestOptions & { query?: Record<string, unknown> } = {}): Promise<T> {
    return this.request<T>('PUT', path, { ...opts, body });
  }
  patch<T>(path: string, body?: unknown, opts: RequestOptions & { query?: Record<string, unknown> } = {}): Promise<T> {
    return this.request<T>('PATCH', path, { ...opts, body });
  }
  delete<T>(path: string, opts: RequestOptions & { query?: Record<string, unknown>; body?: unknown } = {}): Promise<T> {
    return this.request<T>('DELETE', path, opts);
  }
}
