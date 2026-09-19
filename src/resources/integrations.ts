import type { HttpClient, RequestOptions } from '../client.js';

/**
 * Google signed-in bots.
 *
 * A signed-in bot authenticates as a real Workspace user before joining, which
 * is the fix for a Google Meet bot getting stuck in the lobby as an unverified
 * guest.
 *
 * Capacity rule of thumb: logins = peak concurrent Google Meet sessions / 20.
 * MeetStream distributes bots across them round-robin.
 */
export class GoogleLogins {
  constructor(private readonly http: HttpClient) {}

  createDomain(params: Record<string, unknown>, opts: RequestOptions = {}): Promise<unknown> {
    return this.http.post('/google-login-domains', params, opts);
  }
  listDomains(opts: RequestOptions = {}): Promise<unknown> {
    return this.http.get('/google-login-domains', opts);
  }
  getDomain(domain: string, opts: RequestOptions = {}): Promise<unknown> {
    return this.http.get(`/google-login-domains/${encodeURIComponent(domain)}`, opts);
  }
  updateDomain(domain: string, params: Record<string, unknown>, opts: RequestOptions = {}): Promise<unknown> {
    return this.http.patch(`/google-login-domains/${encodeURIComponent(domain)}`, params, opts);
  }
  deleteDomain(domain: string, opts: RequestOptions = {}): Promise<unknown> {
    return this.http.delete(`/google-login-domains/${encodeURIComponent(domain)}`, opts);
  }

  create(params: Record<string, unknown>, opts: RequestOptions = {}): Promise<unknown> {
    return this.http.post('/google-logins', params, opts);
  }
  /**
   * List Google logins. Pass a domain to filter to one registered domain:
   * `list('acme.com')`. Calling `list()` or `list(opts)` still works.
   */
  list(domainOrOpts?: string | RequestOptions, opts: RequestOptions = {}): Promise<unknown> {
    if (typeof domainOrOpts === 'string') {
      return this.http.get('/google-logins', { ...opts, query: { domain: domainOrOpts } });
    }
    return this.http.get('/google-logins', domainOrOpts ?? opts);
  }
  update(loginId: string, params: Record<string, unknown>, opts: RequestOptions = {}): Promise<unknown> {
    return this.http.patch(`/google-logins/${encodeURIComponent(loginId)}`, params, opts);
  }
  delete(loginId: string, opts: RequestOptions = {}): Promise<unknown> {
    return this.http.delete(`/google-logins/${encodeURIComponent(loginId)}`, opts);
  }
}

/**
 * Microsoft Teams signed-in bots.
 *
 * A signed-in Teams bot joins as a real Microsoft 365 work or school account
 * (not teams.live.com) instead of an anonymous guest. Register a login domain,
 * add accounts under it, then create bots with
 * `teams: { login_required: true, teams_login_domain }`.
 *
 * - One concurrent bot per Teams account. Register N accounts for N concurrent
 *   bots; when every account is busy, create returns 429.
 * - `bot_name` and `bot_image_url` are not applied on a signed-in Teams join:
 *   the bot shows the Microsoft account's own display name and picture.
 * - Passwords are write-only. They are never returned by any endpoint. Read
 *   them from an env var or secret store, never hardcode or log them.
 * - `login_mode` currently supports `"always"` only for Teams.
 *
 * Guide: https://docs.meetstream.ai/guides/app-integrations/teams-signed-in-bots
 */
export class TeamsLogins {
  constructor(private readonly http: HttpClient) {}

  /** Register a login domain. Body: `{ domain, name?, login_mode?: "always" }`. */
  createDomain(params: Record<string, unknown>, opts: RequestOptions = {}): Promise<unknown> {
    return this.http.post('/teams-login-domains', params, opts);
  }
  /** Returns `{ domains: [...] }` with login counts per domain. */
  listDomains(opts: RequestOptions = {}): Promise<unknown> {
    return this.http.get('/teams-login-domains', opts);
  }
  /** One domain, including its logins (no passwords). */
  getDomain(domain: string, opts: RequestOptions = {}): Promise<unknown> {
    return this.http.get(`/teams-login-domains/${encodeURIComponent(domain)}`, opts);
  }
  /** Body: `{ name?, login_mode? }`. */
  updateDomain(domain: string, params: Record<string, unknown>, opts: RequestOptions = {}): Promise<unknown> {
    return this.http.patch(`/teams-login-domains/${encodeURIComponent(domain)}`, params, opts);
  }
  /** Deletes the domain and every login under it. */
  deleteDomain(domain: string, opts: RequestOptions = {}): Promise<unknown> {
    return this.http.delete(`/teams-login-domains/${encodeURIComponent(domain)}`, opts);
  }

  /**
   * Add a Microsoft account under a registered domain.
   * Body: `{ domain, email, password, is_active? }`. The password is write-only.
   */
  create(params: Record<string, unknown>, opts: RequestOptions = {}): Promise<unknown> {
    return this.http.post('/teams-logins', params, opts);
  }
  /** List the logins under one domain. The domain is required by the API. */
  list(domain: string, opts: RequestOptions = {}): Promise<unknown> {
    return this.http.get('/teams-logins', { ...opts, query: { domain } });
  }
  get(loginId: string, opts: RequestOptions = {}): Promise<unknown> {
    return this.http.get(`/teams-logins/${encodeURIComponent(loginId)}`, opts);
  }
  /**
   * Body: `{ password?, is_active? }`. Setting a new password also reactivates
   * a deactivated account.
   */
  update(loginId: string, params: Record<string, unknown>, opts: RequestOptions = {}): Promise<unknown> {
    return this.http.patch(`/teams-logins/${encodeURIComponent(loginId)}`, params, opts);
  }
  delete(loginId: string, opts: RequestOptions = {}): Promise<unknown> {
    return this.http.delete(`/teams-logins/${encodeURIComponent(loginId)}`, opts);
  }
}

/** Zoom OAuth, so bots can join on an end user's behalf. */
/**
 * @deprecated These `/zoom/oauth/*` endpoints were removed from the MeetStream
 * API reference. For authenticated Zoom joins, pass `zoom: { zak_url }` or
 * `zoom: { obf_url }` to `bots.create` instead. Kept for backwards compatibility.
 */
export class Zoom {
  constructor(private readonly http: HttpClient) {}

  authorizeUrl(opts: RequestOptions & { query?: Record<string, unknown> } = {}): Promise<unknown> {
    return this.http.get('/zoom/oauth/authorize-url', opts);
  }
  createConnection(params: Record<string, unknown>, opts: RequestOptions = {}): Promise<unknown> {
    return this.http.post('/zoom/oauth/connections', params, opts);
  }
  listConnections(opts: RequestOptions = {}): Promise<unknown> {
    return this.http.get('/zoom/oauth/connections', opts);
  }
  getConnection(zoomUserId: string, opts: RequestOptions = {}): Promise<unknown> {
    return this.http.get(`/zoom/oauth/connections/${encodeURIComponent(zoomUserId)}`, opts);
  }
  deleteConnection(zoomUserId: string, opts: RequestOptions = {}): Promise<unknown> {
    return this.http.delete(`/zoom/oauth/connections/${encodeURIComponent(zoomUserId)}`, opts);
  }
}

/**
 * Bring-your-own-bucket storage.
 *
 * Two things to know before enabling this. It stores cloud credentials on your
 * MeetStream account, so use a dedicated IAM user scoped to one bucket, never a
 * root key. And with `access_mode: "write_only"`, MeetStream writes to your
 * bucket but its own fetch endpoints return 403 for that media - you read it
 * from your bucket, not from the API.
 *
 * Objects land under `{prefix}/{bot_id}_<file>`.
 */
export class Storage {
  constructor(private readonly http: HttpClient) {}

  set(params: Record<string, unknown>, opts: RequestOptions = {}): Promise<unknown> {
    return this.http.put('/admin/configs', params, { ...opts, query: { config_type: 'storage' } });
  }
  get(opts: RequestOptions = {}): Promise<unknown> {
    return this.http.get('/admin/configs', opts);
  }
  delete(keyName = 'aws', opts: RequestOptions = {}): Promise<unknown> {
    return this.http.delete('/admin/configs', { ...opts, query: { key_name: keyName } });
  }
}
