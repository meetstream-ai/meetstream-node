import type { HttpClient, RequestOptions } from '../client.js';

export class Calendar {
  constructor(private readonly http: HttpClient) {}

  /** Connected calendars. */
  list(opts: RequestOptions = {}): Promise<unknown> {
    return this.http.get('/calendar', opts);
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

  disconnect(params: Record<string, unknown> = {}, opts: RequestOptions = {}): Promise<unknown> {
    return this.http.post('/calendar/disconnect', params, opts);
  }

  /** Fetch and sync events. */
  events(opts: RequestOptions & { query?: Record<string, unknown> } = {}): Promise<unknown> {
    return this.http.get('/calendar/events', opts);
  }

  /** Put a bot on a calendar event. */
  scheduleEvent(eventId: string, body: Record<string, unknown> = {}, opts: RequestOptions = {}): Promise<unknown> {
    return this.http.post(`/calendar/schedule/${encodeURIComponent(eventId)}`, body, opts);
  }

  unscheduleEvent(eventId: string, opts: RequestOptions = {}): Promise<unknown> {
    return this.http.delete(`/calendar/schedule/${encodeURIComponent(eventId)}`, opts);
  }

  listScheduledBots(opts: RequestOptions & { query?: Record<string, unknown> } = {}): Promise<unknown> {
    return this.http.get('/calendar/scheduled_bots', opts);
  }

  /** Move a scheduled bot. The body field is `scheduled_join_time`, not `join_at`. */
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

  toggleRecurrence(body: Record<string, unknown> = {}, opts: RequestOptions = {}): Promise<unknown> {
    return this.http.post('/calendar/toggle-recurrence', body, opts);
  }
}
