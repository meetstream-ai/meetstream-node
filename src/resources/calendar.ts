import type { HttpClient, RequestOptions } from '../client.js';

/** `google` or `outlook`. `microsoft` is accepted as an alias for `outlook`. */
export type CalendarProvider = 'google' | 'outlook' | 'microsoft';

export class Calendar {
  constructor(private readonly http: HttpClient) {}

  /**
   * The calendars on every connected Google and Outlook account. Filter with
   * `provider`, and with `account_id` (the account's email, needs `provider`).
   */
  list(
    params: { provider?: 'google' | 'outlook'; account_id?: string } = {},
    opts: RequestOptions = {},
  ): Promise<unknown> {
    return this.http.get('/calendar/calendars', { ...opts, query: { ...params } });
  }

  /** Connected calendar accounts with the status of each. Tokens are never returned. Paginated with `cursor`. */
  listConnections(params: { limit?: number; cursor?: string } = {}, opts: RequestOptions = {}): Promise<unknown> {
    return this.http.get('/calendar/connections', { ...opts, query: { ...params } });
  }

  /** One connected account, by provider and email address. */
  getConnection(provider: CalendarProvider, accountId: string, opts: RequestOptions = {}): Promise<unknown> {
    return this.http.get(
      `/calendar/connections/${encodeURIComponent(provider)}/${encodeURIComponent(accountId)}`,
      opts,
    );
  }

  /**
   * Disconnect one account. By default its synced events and the bots
   * scheduled from them are deleted too; pass `purge_events: false` to keep them.
   */
  deleteConnection(
    provider: CalendarProvider,
    accountId: string,
    params: { purge_events?: boolean } = {},
    opts: RequestOptions = {},
  ): Promise<unknown> {
    return this.http.delete(
      `/calendar/connections/${encodeURIComponent(provider)}/${encodeURIComponent(accountId)}`,
      { ...opts, query: { ...params } },
    );
  }

  /** Connect a Google calendar with OAuth credentials. */
  connectGoogle(
    params: { google_client_id: string; google_client_secret: string; google_refresh_token: string; [k: string]: unknown },
    opts: RequestOptions = {},
  ): Promise<unknown> {
    return this.http.post('/calendar/create_calendar', params, opts);
  }

  /** Connect an Outlook / Microsoft calendar. */
  connectOutlook(params: Record<string, unknown>, opts: RequestOptions = {}): Promise<unknown> {
    return this.http.post('/calendar/create_outlook_calendar', params, opts);
  }

  /**
   * Disconnect calendar accounts. By default their synced events and the bots
   * scheduled from them are deleted too; pass `purge_events: false` to keep
   * them. With several accounts connected, pass `provider` and `account_id`.
   */
  disconnect(
    params: { provider?: CalendarProvider | 'all'; account_id?: string; purge_events?: boolean; [k: string]: unknown } = {},
    opts: RequestOptions = {},
  ): Promise<unknown> {
    return this.http.delete('/calendar/disconnect', { ...opts, query: { ...params } });
  }

  /** Fetch and sync events. */
  events(opts: RequestOptions & { query?: Record<string, unknown> } = {}): Promise<unknown> {
    return this.http.get('/calendar/events', opts);
  }

  /**
   * Put a bot on a calendar event. The body takes the same bot fields as
   * `bots.create()`, including `zoom.use_own_app`. 409 when the occurrence is
   * already scheduled.
   */
  scheduleEvent(eventId: string, body: Record<string, unknown> = {}, opts: RequestOptions = {}): Promise<unknown> {
    return this.http.post(`/calendar/schedule/${encodeURIComponent(eventId)}`, body, opts);
  }

  unscheduleEvent(eventId: string, opts: RequestOptions = {}): Promise<unknown> {
    return this.http.delete(`/calendar/schedule/${encodeURIComponent(eventId)}`, opts);
  }

  listScheduledBots(opts: RequestOptions & { query?: Record<string, unknown> } = {}): Promise<unknown> {
    return this.http.get('/calendar/scheduled_bots', opts);
  }

  /**
   * Update a scheduled bot. The time field is `scheduled_join_time`, not `join_at`.
   * `bot_image_url: null` (or `""`) removes the bot's picture.
   */
  rescheduleBot(
    botId: string,
    params: { scheduled_join_time: string; [k: string]: unknown },
    opts: RequestOptions = {},
  ): Promise<unknown> {
    return this.http.patch(`/calendar/scheduled_bots/${encodeURIComponent(botId)}`, params, opts);
  }

  deleteScheduledBot(botId: string, opts: RequestOptions = {}): Promise<unknown> {
    return this.http.delete(`/calendar/scheduled_bots/${encodeURIComponent(botId)}`, opts);
  }

  /** Auto-join every synced meeting. */
  enableAutoSchedule(body: Record<string, unknown> = {}, opts: RequestOptions = {}): Promise<unknown> {
    return this.http.post('/calendar/auto-schedule/enable', body, opts);
  }

  disableAutoSchedule(body: Record<string, unknown> = {}, opts: RequestOptions = {}): Promise<unknown> {
    return this.http.post('/calendar/auto-schedule/disable', body, opts);
  }

  autoScheduleSettings(opts: RequestOptions = {}): Promise<unknown> {
    return this.http.get('/calendar/auto-schedule/settings', opts);
  }

  /**
   * @deprecated The MeetStream API has no `/calendar/toggle-recurrence` route,
   * so this call fails. Kept so existing code still compiles.
   */
  toggleRecurrence(body: Record<string, unknown> = {}, opts: RequestOptions = {}): Promise<unknown> {
    return this.http.post('/calendar/toggle-recurrence', body, opts);
  }
}
