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
  list(opts: RequestOptions = {}): Promise<unknown> {
    return this.http.get('/google-logins', opts);
  }
  update(loginId: string, params: Record<string, unknown>, opts: RequestOptions = {}): Promise<unknown> {
    return this.http.patch(`/google-logins/${encodeURIComponent(loginId)}`, params, opts);
  }
  delete(loginId: string, opts: RequestOptions = {}): Promise<unknown> {
    return this.http.delete(`/google-logins/${encodeURIComponent(loginId)}`, opts);
  }
}

/** Zoom OAuth, so bots can join on an end user's behalf. */
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
