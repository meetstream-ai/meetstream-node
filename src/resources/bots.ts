import type { HttpClient, RequestOptions } from '../client.js';
import { NotReadyError } from '../errors.js';
import type {
  Bot,
  BotCommand,
  CreateBotParams,
  HandCommandResponse,
  ListScreenshotsParams,
  Screenshot,
  ScreenshotsPage,
  SendCommandParams,
  SendCommandResponse,
  SpeakerTimeline,
  SpeakerTimelineDownload,
  StopStatus,
  UpdateLiveMiaParams,
  UpdateLiveMiaResponse,
} from '../types.js';

/**
 * True when `get_speaker_timeline` returned a download link instead of the
 * timeline (large meetings). Fetch `speaker_timeline_url` to get the timeline.
 */
export function isSpeakerTimelineDownload(body: unknown): body is SpeakerTimelineDownload {
  return !!body && typeof body === 'object' && !Array.isArray(body)
    && typeof (body as Record<string, unknown>)['speaker_timeline_url'] === 'string';
}

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

  /** Full record: configuration, status, status timeline and artifact availability. Same response as `detail()`. */
  get(botId: string, opts: RequestOptions = {}): Promise<unknown> {
    return this.http.get(`/bots/${encodeURIComponent(botId)}`, opts);
  }

  /** Full record, including `transcript_id`. */
  detail(botId: string, opts: RequestOptions = {}): Promise<unknown> {
    return this.http.get(`/bots/${encodeURIComponent(botId)}/detail`, opts);
  }

  /**
   * @deprecated The MeetStream REST API has no meeting summary endpoint, so
   * this call returns 404. Fetch the transcript and summarize it yourself.
   * Kept so existing code still compiles.
   */
  summary(botId: string, opts: RequestOptions = {}): Promise<unknown> {
    return this.http.get(`/bots/${encodeURIComponent(botId)}/summary`, opts);
  }

  /**
   * Make the bot leave the meeting. The recording and transcript are **kept**.
   *
   * This really is a GET on the MeetStream API, not a POST or DELETE.
   */
  remove(botId: string, opts: RequestOptions = {}): Promise<StopStatus> {
    return this.http.get(`/bots/${encodeURIComponent(botId)}/remove_bot`, opts);
  }

  /**
   * Progress of a stop request, without stopping the bot again: requested,
   * acknowledged, stopped, force-stopped or failed.
   */
  stopStatus(botId: string, opts: RequestOptions = {}): Promise<StopStatus> {
    return this.http.get(`/bots/${encodeURIComponent(botId)}/stop_status`, opts);
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

  /**
   * Screenshots captured for a bot, newest first, each with a one-hour
   * download URL. Page with `continuation_token` (and `meta`) from the
   * previous page. Capture one with `sendCommand({ command: 'screenshot' })`.
   */
  screenshots(botId: string, params: ListScreenshotsParams = {}, opts: RequestOptions = {}): Promise<ScreenshotsPage> {
    return this.http.get(`/bots/${encodeURIComponent(botId)}/screenshots`, {
      ...opts,
      query: { ...(params as Record<string, unknown>) },
    });
  }

  /** One screenshot by id, with a fresh one-hour download URL. */
  screenshot(botId: string, screenshotId: string, opts: RequestOptions = {}): Promise<Screenshot> {
    return this.http.get(
      `/bots/${encodeURIComponent(botId)}/screenshots/${encodeURIComponent(screenshotId)}`,
      opts,
    );
  }

  /* --------------------------------------------------------------- data */

  participants(botId: string, opts: RequestOptions = {}): Promise<unknown> {
    return this.http.get(`/bots/${encodeURIComponent(botId)}/get_participants`, opts);
  }

  chats(botId: string, opts: RequestOptions = {}): Promise<unknown> {
    return this.http.get(`/bots/${encodeURIComponent(botId)}/get_chats`, opts);
  }

  /**
   * Who spoke and when. Available after the bot leaves (404 until then).
   *
   * Large timelines (about 5 MB or more) come back as a
   * {@link SpeakerTimelineDownload} instead of the timeline itself: check with
   * {@link isSpeakerTimelineDownload} and fetch `speaker_timeline_url`
   * (valid for 1 hour, no API key needed).
   */
  speakerTimeline(botId: string, opts: RequestOptions = {}): Promise<SpeakerTimeline> {
    return this.http.get(`/bots/${encodeURIComponent(botId)}/get_speaker_timeline`, opts);
  }

  /* -------------------------------------------------------- interaction */

  /**
   * Post a chat message (1-2000 characters) as the bot. Pass an object to
   * attach `metadata`: `sendMessage(botId, { message, metadata })`.
   */
  sendMessage(
    botId: string,
    message: string | { message: string; metadata?: Record<string, unknown> },
    opts: RequestOptions = {},
  ): Promise<unknown> {
    const body = typeof message === 'string' ? { message } : message;
    return this.http.post(`/bots/${encodeURIComponent(botId)}/send_message`, body, opts);
  }

  /**
   * Show an image as the bot's video feed for `display_duration` seconds
   * (up to 300). Send either `img_url` (a public HTTPS URL; animated GIFs work)
   * or `img` (base64, up to 5 MiB). If both are sent, `img_url` is used.
   */
  sendImage(
    botId: string,
    params:
      | { img_url: string; img?: string; display_duration?: number; metadata?: Record<string, unknown> }
      | { img: string; img_url?: undefined; display_duration?: number; metadata?: Record<string, unknown> },
    opts: RequestOptions = {},
  ): Promise<unknown> {
    return this.http.post(`/bots/${encodeURIComponent(botId)}/send_image`, params, opts);
  }

  /**
   * Send a live-bot command. The response type follows the command:
   * `raise_hand` / `lower_hand` resolve to a {@link HandCommandResponse} with
   * `hand_raised`, `screenshot` to a download URL, and so on.
   *
   * The bot must be in the meeting (`ConflictError` otherwise). Commands share
   * a per-bot rate limit (`RateLimitError`, with `retryAfter`). A command the
   * platform does not support returns `BadRequestError`; read `error.code`.
   */
  sendCommand<P extends SendCommandParams>(
    botId: string,
    params: P,
    opts: RequestOptions = {},
  ): Promise<SendCommandResponse<P['command'] & BotCommand>> {
    return this.http.post(`/bots/${encodeURIComponent(botId)}/send_command`, params, opts);
  }

  /**
   * Raise the bot's own hand. Google Meet, Zoom and Teams. Safe to repeat:
   * `hand_raised` is the state the bot saw after acting.
   */
  raiseHand(botId: string, opts: RequestOptions = {}): Promise<HandCommandResponse> {
    return this.sendCommand(botId, { command: 'raise_hand' }, opts);
  }

  /** Lower the bot's own hand. Google Meet, Zoom and Teams. Safe to repeat. */
  lowerHand(botId: string, opts: RequestOptions = {}): Promise<HandCommandResponse> {
    return this.sendCommand(botId, { command: 'lower_hand' }, opts);
  }

  /**
   * Update a running MIA agent: prompt variables, system prompt or wake words.
   * Saved agent configs are not changed. With `wait_for_ack: true` the
   * response carries the agent's own result (`applied`, `partially_applied`
   * or `failed`) instead of `accepted`.
   */
  updateMia(botId: string, params: UpdateLiveMiaParams, opts: RequestOptions = {}): Promise<UpdateLiveMiaResponse> {
    return this.http.post(`/bots/${encodeURIComponent(botId)}/update_mia`, params, opts);
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
