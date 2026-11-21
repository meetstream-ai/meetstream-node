import type { HttpClient, RequestOptions } from '../client.js';

/**
 * Zoom Meeting Direct Connect: record a Zoom meeting with no bot in it.
 *
 * Zoom streams the meeting to MeetStream through your own Zoom app (Zoom's
 * Realtime Media Streams). A session is a normal bot with
 * `platform: "ZoomRTMS"`, so every `bots.*` and `transcripts.*` read works
 * with its `bot_id`. Sessions are receive-only: commands, chat, images, raise
 * hand and voice agents answer 400.
 *
 * Docs: https://docs.meetstream.ai/guides/app-integrations/zoom-meeting-direct-connect
 */
export class MeetingDirectConnect {
  constructor(private readonly http: HttpClient) {}

  /**
   * Start a session from Zoom's `meeting.rtms_started` webhook. `params`
   * needs `zoom_rtms` (`meeting_uuid`, `rtms_stream_id`, `server_urls` and
   * your `signature`). Your Zoom client secret stays on your server.
   */
  create(params: Record<string, unknown>, opts: RequestOptions = {}): Promise<unknown> {
    return this.http.post('/meeting_direct_connect', params, opts);
  }

  get(botId: string, opts: RequestOptions = {}): Promise<unknown> {
    return this.http.get(`/meeting_direct_connect/${encodeURIComponent(botId)}`, opts);
  }

  /** Stop recording the session. Post-call processing then runs as usual. */
  leave(botId: string, opts: RequestOptions = {}): Promise<unknown> {
    return this.http.post(`/meeting_direct_connect/${encodeURIComponent(botId)}/leave`, {}, opts);
  }
}
