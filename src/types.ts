/**
 * Types for the MeetStream API.
 *
 * Field names mirror the wire format exactly, so what you write here is what
 * the API receives. The most common porting mistake is `meeting_url`; the
 * MeetStream field is `meeting_link`.
 */

/* ------------------------------------------------------------------ bots */

/** Post-call providers produce a transcript after the meeting ends. */
export type PostCallTranscriptionProvider =
  | 'deepgram' | 'assemblyai' | 'sarvam' | 'jigsawstack' | 'meetstream';

/**
 * Streaming providers deliver transcripts live and produce **no** post-call
 * transcript. A bot using one of these ends at `audio.processed`, never emits
 * `bot.done`, and a post-call transcript fetch returns 202 forever.
 */
export type StreamingTranscriptionProvider =
  | 'deepgram_streaming' | 'assemblyai_streaming' | 'jigsawstack_streaming'
  | 'meetstream_streaming' | 'meeting_captions';

export type TranscriptionProvider = PostCallTranscriptionProvider | StreamingTranscriptionProvider;

/** Exactly one provider key goes under `transcript.provider`. */
export interface TranscriptProviderConfig {
  deepgram?: { model?: string; language?: string; diarize?: boolean; [k: string]: unknown };
  assemblyai?: { speech_models?: string[]; language_code?: string; [k: string]: unknown };
  sarvam?: Record<string, unknown>;
  jigsawstack?: Record<string, unknown>;
  meetstream?: Record<string, unknown>;
  deepgram_streaming?: Record<string, unknown>;
  assemblyai_streaming?: Record<string, unknown>;
  jigsawstack_streaming?: Record<string, unknown>;
  meetstream_streaming?: Record<string, unknown>;
  meeting_captions?: Record<string, unknown>;
  [k: string]: unknown;
}

export interface RecordingConfig {
  transcript?: { provider?: TranscriptProviderConfig };
  /** `timed` retention deletes media after `hours`. Set this for anything containing customer conversations. */
  retention?: { type?: 'timed' | string; hours?: number; [k: string]: unknown };
  [k: string]: unknown;
}

export interface AutomaticLeaveConfig {
  /** How long to wait for admission before giving up. */
  waiting_room_timeout?: number;
  /** Leave once the humans have gone. */
  everyone_left_timeout?: number;
  /** Leave after this much silence. */
  voice_inactivity_timeout?: number;
  /** **Minimum 600 seconds.** Below that the API returns HTTP 400. */
  in_call_recording_timeout?: number;
  /** Zoom only. Accepted range 60-300. */
  recording_permission_denied_timeout?: number;
  [k: string]: unknown;
}

/**
 * Google Meet signed-in join options (`CreateBotParams.google_meet`).
 * Register the domain and accounts first with `meetstream.googleLogins`.
 */
export interface GoogleMeetSignInOptions {
  /** `true` to join as a signed-in Workspace user. */
  login_required?: boolean;
  /** Required when `login_required` is true. A domain registered via `googleLogins.createDomain`. */
  google_login_domain?: string;
  /** Pin one account in the domain. Optional. */
  sign_in_email?: string;
  /**
   * With `sign_in_email`: `true` (the default) fails if that account is busy or
   * unhealthy; `false` falls back to any available account in the domain.
   */
  strict_email?: boolean;
  [k: string]: unknown;
}

/**
 * Microsoft Teams signed-in join options (`CreateBotParams.teams`).
 * Register the domain and accounts first with `meetstream.teamsLogins`.
 *
 * - One concurrent bot per Teams account; register N accounts for N concurrent bots.
 * - `bot_name` and `bot_image_url` are not applied on a signed-in Teams join:
 *   the bot uses the Microsoft account's own display name and picture.
 * - Microsoft 365 work or school Teams only (not teams.live.com).
 * - A malformed `teams` block is dropped silently and the bot joins as a guest.
 */
export interface TeamsSignInOptions {
  /** `true` to join as a signed-in Microsoft 365 user. */
  login_required?: boolean;
  /** Required when `login_required` is true. A domain registered via `teamsLogins.createDomain`. */
  teams_login_domain?: string;
  /** Pin one account in the domain. Optional. */
  sign_in_email?: string;
  /**
   * With `sign_in_email`: `true` (the default) fails with 409 if that account
   * is busy or deactivated; `false` falls back to any available account in the domain.
   */
  strict_email?: boolean;
  [k: string]: unknown;
}

export interface CreateBotParams {
  /** The join URL. Note: `meeting_link`, not `meeting_url`. */
  meeting_link: string;
  bot_name?: string;
  /** Defaults to `true` in the REST API. Set `false` for transcript-only bots. */
  video_required?: boolean;
  audio_separate_streams?: boolean;
  video_separate_streams?: boolean;
  /** Schedule for later, ISO 8601. */
  join_at?: string;
  /** Per-bot webhook. There is no global webhook endpoint on the API. */
  callback_url?: string;
  /** Values must be strings. */
  custom_attributes?: Record<string, string>;
  /** One bot per key: a second create with the same key is rejected with 409. */
  deduplication_key?: string;
  /**
   * Attach a MIA voice agent. Pass **only** this - adding
   * `socket_connection_url` or `live_audio_required` alongside it is the usual
   * cause of a silent agent, since MeetStream hosts the MIA bridge itself.
   */
  agent_config_id?: string;
  recording_config?: RecordingConfig;
  /** Requires a `*_streaming` transcription provider, otherwise the API returns 400. */
  live_transcription_required?: { webhook_url: string; [k: string]: unknown };
  /** Bring-your-own-bridge only. Not for MIA. */
  socket_connection_url?: { websocket_url: string; [k: string]: unknown };
  /** Bring-your-own-bridge only. Not for MIA. */
  live_audio_required?: { websocket_url: string; [k: string]: unknown };
  live_video_required?: { websocket_url: string; [k: string]: unknown };
  automatic_leave?: AutomaticLeaveConfig;
  /** Google signed-in join. See {@link GoogleMeetSignInOptions}. */
  google_meet?: GoogleMeetSignInOptions;
  /** Microsoft Teams signed-in join. See {@link TeamsSignInOptions}. */
  teams?: TeamsSignInOptions;
  /**
   * Authenticated Zoom joins. Each URL is an HTTPS endpoint on your server that
   * returns a fresh token when MeetStream calls it: `zak_url` to join as a
   * signed-in user, `obf_url` to join On Behalf Of a user already in the meeting.
   * The older `use_zoom_obf` flag and `zoom_oauth_connection_user_id` are rejected.
   */
  zoom?: { zak_url?: string; obf_url?: string; [k: string]: unknown };
  [k: string]: unknown;
}

export interface Bot {
  bot_id: string;
  /** Null when the provider is `meeting_captions`. */
  transcript_id?: string | null;
  meeting_url?: string;
  status?: string;
  [k: string]: unknown;
}

/**
 * Bot status as reported on webhooks and `/status`. Casing is not consistent
 * for failures (`FAILED`, `ERROR`, `Failed`), so prefer `bot_event` on terminals.
 */
export type BotStatus =
  | 'Joining' | 'InWaitingRoom' | 'InMeeting' | 'Recording' | 'Leaving'
  | 'Stopped' | 'NotAllowed' | 'Denied' | 'Error' | 'FAILED' | 'ERROR' | 'Failed' | 'Done'
  | (string & {});

/** The specific reason on a terminal `bot.stopped` delivery. */
export type StopReason =
  | 'bot.stopped' | 'bot.kicked' | 'bot.notallowed' | 'bot.denied' | 'bot.failed'
  | (string & {});

/* ----------------------------------------------------------- transcripts */

export interface TranscriptSegment {
  speaker?: string;
  /** The text field is called `transcript`, not `text`. */
  transcript?: string;
  start_time?: number;
  end_time?: number;
  [k: string]: unknown;
}

/* ------------------------------------------------------------------- mia */

export interface MiaModelConfig {
  provider?: string;
  model?: string;
  system_prompt?: string;
  /** What the agent says on joining. Set it, and disclose that it is an AI. */
  first_message?: string;
  temperature?: number;
  [k: string]: unknown;
}

export interface MiaTranscriberConfig {
  provider?: string;
  model?: string;
  language?: string;
  /**
   * Product names, people's names and jargon. This one field fixes most
   * "it mishears our company name" complaints.
   */
  boostwords?: string[];
  [k: string]: unknown;
}

export interface MiaAgentConfig {
  response_modality?: string;
  /** Tools the agent can call mid-conversation. */
  tools?: unknown[];
  /** MCP servers the agent can reach. This is what turns a talking bot into one that does work. */
  mcp_servers?: unknown[];
  enable_interruptions?: boolean;
  interruption_mode?: string;
  false_interruption_timeout?: number;
  vad_threshold?: number;
  vad_eagerness?: string;
  user_away_timeout?: number;
  [k: string]: unknown;
}

export interface CreateMiaParams {
  agent_name: string;
  /** `pipeline` gives you per-layer control and wake words; `realtime` is lowest latency. */
  mode?: 'pipeline' | 'realtime' | (string & {});
  model?: MiaModelConfig;
  /** Pipeline mode only. In realtime mode the voice lives inside `model`. */
  voice?: { provider?: string; voice_id?: string; speed?: number; [k: string]: unknown };
  /** Pipeline mode only. */
  transcriber?: MiaTranscriberConfig;
  agent?: MiaAgentConfig;
  audio?: { sample_rate?: number; num_channels?: number; [k: string]: unknown };
  /** Pipeline mode only. */
  wake_word?: { enabled?: boolean; words?: string[]; timeout?: number; [k: string]: unknown };
  /** Gives the agent a visual avatar in the meeting video. Confirmed working. */
  Avatar?: { provider?: string; enabled?: boolean; avatar_id?: string; [k: string]: unknown };
  [k: string]: unknown;
}

/* -------------------------------------------------------------- webhooks */

/**
 * Lifecycle, in order:
 *
 * `bot.joining` -> `bot.in_waiting_room` -> `bot.inmeeting` -> `bot.recording`
 * -> `bot.leaving` -> **`bot.stopped`** (terminal) -> `manifest.completed`
 * -> `audio.processed` -> `transcription.processed` | `transcription.failed`
 * -> `video.processed` -> **`bot.done`** (final) -> `data_deletion`
 *
 * Every ending arrives once as `event: "bot.stopped"`; `bot_event` gives the
 * reason (`bot.stopped`, `bot.kicked`, `bot.notallowed`, `bot.denied`,
 * `bot.failed`). Not admitted, denied and failed carry `status_code: 500`.
 * `bot.error` is non-terminal - the bot keeps running. Streaming-only providers
 * never emit `transcription.processed`, but `bot.done` still fires.
 */
export type WebhookEvent =
  | 'bot.scheduled' | 'bot.joining' | 'bot.in_waiting_room' | 'bot.inmeeting' | 'bot.recording'
  | 'bot.leaving' | 'bot.stopped' | 'bot.error' | 'bot.uploading' | 'bot.done'
  | 'manifest.completed' | 'audio.processed' | 'video.processed'
  | 'transcription.processed' | 'transcription.failed' | 'bot.transcriptionready'
  | 'audio.skipped' | 'manifest.skipped' | 'transcription.skipped'
  | 'participant_events.join' | 'participant_events.leave'
  | 'data_deletion'
  | (string & {});

/**
 * The webhook envelope. The event name is always under `event`; most deliveries
 * also carry `bot_event`, which equals `event` except on terminals, where
 * `event` is `bot.stopped` and `bot_event` gives the reason.
 */
export interface WebhookPayload {
  event: WebhookEvent;
  /** Equals `event`, except on terminals where it is the {@link StopReason}. */
  bot_event?: WebhookEvent | StopReason;
  bot_id?: string;
  bot_status?: BotStatus;
  message?: string;
  /** 500 on `transcription.failed` and on failing terminals (not admitted, denied, failed). */
  status_code?: number;
  custom_attributes?: Record<string, string>;
  /** ISO 8601. Present on every event. */
  timestamp?: string;
  [k: string]: unknown;
}
