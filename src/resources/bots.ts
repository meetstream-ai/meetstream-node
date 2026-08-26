import type { HttpClient, RequestOptions } from '../client.js';
import { NotReadyError } from '../errors.js';
import type { Bot, CreateBotParams } from '../types.js';

export interface WaitOptions extends RequestOptions {
  /** How long to keep polling, in milliseconds. Default 600000 (10 minutes). */
  timeoutMs?: number;
  /** Delay between polls, in milliseconds. Default 5000. */
  intervalMs?: number;
}

export class Bots {
  constructor(private readonly http: HttpClient) {}

  /**
   * Send a bot into a meeting.
   *
   * Pass `idempotencyKey` and a retry returns the original bot (HTTP 507)
   * rather than creating a duplicate. Generate that UUID once, outside your
   * retry loop.
   */
  create(params: CreateBotParams, opts: RequestOptions = {}): Promise<Bot> {
    return this.http.post<Bot>('/bots/create_bot', params, opts);
  }

  list(opts: RequestOptions & { query?: Record<string, unknown> } = {}): Promise<unknown> {
    return this.http.get('/bots', opts);
  }

  status(botId: string, opts: RequestOptions = {}): Promise<unknown> {
    return this.http.get(`/bots/${encodeURIComponent(botId)}/status`, opts);
  }

  /** Full record, including `transcript_id`. */
  detail(botId: string, opts: RequestOptions = {}): Promise<unknown> {
    return this.http.get(`/bots/${encodeURIComponent(botId)}/detail`, opts);
  }

  /** AI-generated summary of the meeting. */
  summary(botId: string, opts: RequestOptions = {}): Promise<unknown> {
    return this.http.get(`/bots/${encodeURIComponent(botId)}/summary`, opts);
  }

  /**
   * Make the bot leave the meeting. The recording and transcript are **kept**.
   *
   * This really is a GET on the MeetStream API, not a POST or DELETE.
   */
  remove(botId: string, opts: RequestOptions = {}): Promise<unknown> {
    return this.http.get(`/bots/${encodeURIComponent(botId)}/remove_bot`, opts);
  }

  /**
   * Permanently erase a bot's audio, video and transcripts. Fires a
   * `data_deletion` webhook. Irreversible - confirm with the user first.
   */
  deleteData(botId: string, opts: RequestOptions = {}): Promise<unknown> {
    return this.http.delete(`/bots/${encodeURIComponent(botId)}/delete`, opts);
  }

  /* -------------------------------------------------------------- media */

  /** Ready after the `audio.processed` webhook. Returns 202 (`NotReadyError`) before that. */
  audio(botId: string, opts: RequestOptions = {}): Promise<unknown> {
    return this.http.get(`/bots/${encodeURIComponent(botId)}/get_audio`, opts);
  }

  /** Ready after the `video.processed` webhook. Requires `video_required: true` at creation. */
  video(botId: string, opts: RequestOptions = {}): Promise<unknown> {
    return this.http.get(`/bots/${encodeURIComponent(botId)}/get_video`, opts);
  }

  /** One track per participant. Requires `audio_separate_streams: true` at creation. */
  audioStreams(botId: string, opts: RequestOptions = {}): Promise<unknown> {
    return this.http.get(`/bots/${encodeURIComponent(botId)}/get_audio_streams`, opts);
  }

  /** Requires `video_separate_streams: true` at creation. */
  recordingStreams(botId: string, opts: RequestOptions = {}): Promise<unknown> {
    return this.http.get(`/bots/${encodeURIComponent(botId)}/get_recording_streams`, opts);
  }

  screenshots(botId: string, opts: RequestOptions = {}): Promise<unknown> {
    return this.http.get(`/bots/${encodeURIComponent(botId)}/get_screenshots`, opts);
  }

  /* --------------------------------------------------------------- data */

  participants(botId: string, opts: RequestOptions = {}): Promise<unknown> {
    return this.http.get(`/bots/${encodeURIComponent(botId)}/get_participants`, opts);
  }

  chats(botId: string, opts: RequestOptions = {}): Promise<unknown> {
    return this.http.get(`/bots/${encodeURIComponent(botId)}/get_chats`, opts);
  }

  speakerTimeline(botId: string, opts: RequestOptions = {}): Promise<unknown> {
    return this.http.get(`/bots/${encodeURIComponent(botId)}/get_speaker_timeline`, opts);
  }

  /* -------------------------------------------------------- interaction */

  sendMessage(botId: string, message: string, opts: RequestOptions = {}): Promise<unknown> {
    return this.http.post(`/bots/${encodeURIComponent(botId)}/send_message`, { message }, opts);
  }

  /** `imgUrl` must be a publicly reachable URL, not base64. */
  sendImage(
    botId: string,
    params: { img_url: string; display_duration?: number },
    opts: RequestOptions = {},
  ): Promise<unknown> {
    return this.http.post(`/bots/${encodeURIComponent(botId)}/send_image`, params, opts);
  }

  /** Stop recording without leaving. Useful for privacy windows. */
  pauseRecording(botId: string, opts: RequestOptions = {}): Promise<unknown> {
    return this.http.post(`/bots/${encodeURIComponent(botId)}/pause_recording`, {}, opts);
  }

  resumeRecording(botId: string, opts: RequestOptions = {}): Promise<unknown> {
    return this.http.post(`/bots/${encodeURIComponent(botId)}/resume_recording`, {}, opts);
  }

  /* ------------------------------------------------------------ helpers */

  /**
   * Poll a 202-returning endpoint until it is ready.
   *
   * Always bounded. A bot that used a streaming-only transcription provider
   * returns 202 forever, so an unbounded wait would never return.
   */
  private async poll<T>(fn: () => Promise<T>, opts: WaitOptions): Promise<T> {
    const timeoutMs = opts.timeoutMs ?? 600_000;
    const intervalMs = opts.intervalMs ?? 5_000;
    const deadline = Date.now() + timeoutMs;

    for (;;) {
      try {
        return await fn();
      } catch (e) {
        if (!(e instanceof NotReadyError)) throw e;
        if (Date.now() + intervalMs > deadline) {
          throw new NotReadyError(
            `Still not ready after ${Math.round(timeoutMs / 1000)}s. If this bot used a streaming-only ` +
              'transcription provider there is no post-call artifact and this will never become ready.',
            { status: 202 },
          );
        }
        await new Promise((r) => setTimeout(r, intervalMs));
      }
    }
  }

  /** Wait for processed audio, bounded. */
  waitForAudio(botId: string, opts: WaitOptions = {}): Promise<unknown> {
    return this.poll(() => this.audio(botId, opts), opts);
  }

  /** Wait for processed video, bounded. */
  waitForVideo(botId: string, opts: WaitOptions = {}): Promise<unknown> {
    return this.poll(() => this.video(botId, opts), opts);
  }
}
