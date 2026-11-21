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
  | 'deepgram' | 'assemblyai' | 'sarvam' | 'jigsawstack' | 'meetstream' | 'smallest';

/**
 * Streaming providers deliver transcripts live and produce **no** post-call
 * transcript. A bot using one of these ends at `audio.processed`, never emits
 * `bot.done`, and a post-call transcript fetch returns 202 forever.
 */
export type StreamingTranscriptionProvider =
  | 'deepgram_streaming' | 'assemblyai_streaming' | 'jigsawstack_streaming'
  | 'meetstream_streaming' | 'smallest_streaming' | 'meeting_captions';

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
  /**
   * Smallest AI, post-call. Uses the Smallest key saved in the dashboard
   * (voice integrations); without one the API returns 400.
   * `diarize` applies to `pulse` only. `pulse-pro` is English only.
   */
  smallest?: SmallestTranscriptionConfig;
  /** Smallest AI, live. Pair with `live_transcription_required.webhook_url`. `pulse-2` is English only. */
  smallest_streaming?: SmallestStreamingTranscriptionConfig;
  [k: string]: unknown;
}

/** `recording_config.transcript.provider.smallest`. */
export interface SmallestTranscriptionConfig {
  /** Default `pulse`. */
  model?: 'pulse' | 'pulse-pro';
  /** Language code. Default `en`. */
  language?: string;
  /** Speaker labels. `pulse` only. Default true. */
  diarize?: boolean;
  /** Words to boost, as one string or a list. */
  keywords?: string | string[];
  redact_pii?: boolean;
  redact_pci?: boolean;
  emotion_detection?: boolean;
  gender_detection?: boolean;
  [k: string]: unknown;
}

/** `recording_config.transcript.provider.smallest_streaming`. */
export interface SmallestStreamingTranscriptionConfig {
  /** Default `pulse`. */
  model?: 'pulse' | 'pulse-2';
  /** Language code. Default `en`. */
  language?: string;
  [k: string]: unknown;
}

/**
 * Layout of the mixed video recording.
 *
 * - `speaker_view` follows the active speaker; `grid_view` is a composited
 *   mosaic of everyone. Google Meet, Teams and Zoom.
 * - `speaker_view_default` and `grid_view_default` record the layout the
 *   meeting itself shows. Google Meet and Teams only; Zoom returns 400.
 */
export type VideoLayout = 'speaker_view' | 'grid_view' | 'speaker_view_default' | 'grid_view_default';

/**
 * Events a `recording_config.realtime_endpoints` entry can subscribe to.
 * Participant hand events are delivered only to endpoints that list them.
 */
export type RealtimeEvent =
  | 'participant_events.join' | 'participant_events.leave' | 'participant_events.chat_message'
  | 'participant_events.raise_hand' | 'participant_events.lower_hand'
  | (string & {});

/** One `recording_config.realtime_endpoints` entry. */
export interface RealtimeEndpoint {
  /** Delivery type, for example `webhook`. */
  type?: string;
  url: string;
  events?: RealtimeEvent[];
  [k: string]: unknown;
}

export interface RecordingConfig {
  transcript?: { provider?: TranscriptProviderConfig };
  /**
   * Layout of the mixed video recording. Send `speaker_view` unless the user asked for
   * grid or gallery view: the REST API defaults to `grid_view` when this is omitted.
   * Ignored unless `video_required` is true. See {@link VideoLayout} for platform support.
   */
  video_layout?: VideoLayout;
  /** Default `standard`. */
  video_quality?: 'standard' | 'hd';
  /** `timed` retention deletes media after `hours`. Set this for anything containing customer conversations. */
  retention?: { type?: 'timed' | string; hours?: number; [k: string]: unknown };
  /** Endpoints that receive live events (participants, chat, hands) during the call. */
  realtime_endpoints?: RealtimeEndpoint[];
  [k: string]: unknown;
}

export interface AutomaticLeaveConfig {
  /** How long to wait for admission before giving up. */
  waiting_room_timeout?: number;
  /** Leave once the humans have gone. */
  everyone_left_timeout?: number;
  /** Leave after this much silence. */
  voice_inactivity_timeout?: number;
  /** Leave an empty meeting after this long if nobody else joins. */
  no_one_joined_timeout?: number;
  /** **Minimum 600 seconds.** Below that the API returns HTTP 400. */
  in_call_recording_timeout?: number;
  /**
   * Zoom only. Seconds to wait after the host denies recording permission.
   * Accepted range 60-600, default 600.
   */
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

/**
 * Zoom join options (`CreateBotParams.zoom`).
 *
 * With no `zoom` block (or `use_own_app` omitted or null), the bot uses your
 * connected Zoom app when you have one, and otherwise joins with no setup.
 */
export interface ZoomJoinOptions {
  /**
   * `true` requires your own Zoom app (saved credentials or a connected Zoom
   * app); without one the API returns 400. `false` joins with no setup and
   * cannot be combined with `zak_url` or `obf_url`. Not echoed in bot details.
   */
  use_own_app?: boolean | null;
  /** HTTPS endpoint on your server that returns a fresh ZAK, to join as a signed-in user. Needs your own Zoom app. */
  zak_url?: string;
  /** HTTPS endpoint on your server that returns a fresh OBF token, to join On Behalf Of a user already in the meeting. Needs your own Zoom app. */
  obf_url?: string;
  [k: string]: unknown;
}

export interface CreateBotParams {
  /** The join URL. Note: `meeting_link`, not `meeting_url`. */
  meeting_link: string;
  bot_name?: string;
  /** HTTPS URL to a PNG, JPEG, GIF or WebP image for the bot's picture. Any other value returns 400. */
  bot_image_url?: string;
  /** A chat message the bot posts after it joins. */
  bot_message?: string;
  /**
   * Record video as well as audio. The REST API defaults this to `false`. Send
   * it explicitly anyway, and leave it `false` unless the user asked for video:
   * transcripts, summaries, diarization and speaker timelines all work from
   * audio alone. When you set it to `true`, pair it with
   * `recording_config.video_layout: 'speaker_view'`.
   */
  video_required?: boolean;
  /**
   * Record the mixed meeting audio. Default `true`. A bot with both
   * `audio_required` and `video_required` false and no live job returns 400.
   */
  audio_required?: boolean;
  /** Also produce an MP3 of the mixed audio. Requires `audio_required`. */
  audio_mixed_mp3?: boolean;
  /** Also produce MP3s of each per-participant audio segment. Requires `audio_separate_streams`. */
  audio_separate_mp3?: boolean;
  audio_separate_streams?: boolean;
  /**
   * One video file per participant. Opt-in only: leave unset unless it was asked for.
   * On Google Meet and Teams it needs `video_required: true`, otherwise 400.
   */
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
  /** Values for the template variables in the MIA agent's prompt, for this bot only. */
  agent_config_params?: Record<string, string | number | boolean>;
  /**
   * A saved storage destination (managed in the dashboard): 1-80 letters,
   * numbers, underscores or hyphens. Omit it to use the workspace default.
   */
  storage_id?: string;
  /** One-shot audio clip the bot plays shortly after it is admitted. */
  initial_audio?: { url: string; wait_seconds?: number; [k: string]: unknown };
  recording_config?: RecordingConfig;
  /** Requires a `*_streaming` transcription provider, otherwise the API returns 400. */
  live_transcription_required?: { webhook_url: string; [k: string]: unknown };
  /** Bring-your-own-bridge only. Not for MIA. */
  socket_connection_url?: { websocket_url: string; [k: string]: unknown };
  /** Bring-your-own-bridge only. Not for MIA. */
  live_audio_required?: { websocket_url: string; [k: string]: unknown };
  live_video_required?: { websocket_url: string; [k: string]: unknown };
  /**
   * Publish your own video (and optional audio) through the bot's camera and
   * microphone over WebRTC. The bot connects out to your signaling WebSocket.
   * Google Meet accepts ws:// or wss://; Teams and Zoom need a public wss://.
   * On Zoom it cannot be combined with `agent_config_id`.
   */
  bot_camera_stream?: { websocket_url?: string; [k: string]: unknown };
  automatic_leave?: AutomaticLeaveConfig;
  /** Google signed-in join. See {@link GoogleMeetSignInOptions}. */
  google_meet?: GoogleMeetSignInOptions;
  /** Microsoft Teams signed-in join. See {@link TeamsSignInOptions}. */
  teams?: TeamsSignInOptions;
  /**
   * Zoom join options: `use_own_app` picks your own Zoom app or a no-setup
   * join, and `zak_url` / `obf_url` give authenticated joins. Each URL is an
   * HTTPS endpoint on your server that returns a fresh token when MeetStream
   * calls it. The older `use_zoom_obf` flag and `zoom_oauth_connection_user_id`
   * are rejected. See {@link ZoomJoinOptions}.
   */
  zoom?: ZoomJoinOptions;
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
 * Not a closed list: handle unknown values gracefully.
 */
export type BotStatus =
  | 'Scheduled' | 'Joining' | 'InWaitingRoom' | 'InMeeting' | 'Recording'
  | 'RecordingPermissionAllowed' | 'RecordingPermissionDenied' | 'Leaving'
  | 'Stopped' | 'Kicked' | 'NotAllowed' | 'Denied' | 'Error' | 'FAILED' | 'ERROR' | 'Failed'
  | 'Cancelled' | 'MediaProcessing' | 'Done' | 'MediaExpired'
  | (string & {});

/**
 * `ErrorReason` from `bots.detail()`: a stable PascalCase code for join
 * failures and meeting endings. Zoom codes start with `Zoom`. Not a closed list.
 */
export type BotErrorReason =
  | 'InvalidMeetingLink' | 'MeetingRestricted' | 'MeetingNotStarted' | 'MeetingEnded'
  | 'SignInRequired' | 'GoogleSignInFailed' | 'CantJoinCall'
  | 'EveryoneLeft' | 'MeetingEndedByHost'
  | 'ScheduledDispatchExhausted' | 'ScheduledDispatchRejected' | 'StorageValidationFailed'
  | 'InsufficientCredits' | 'JoinTimeout'
  | (string & {});

/** `failure_reason` on a Google Meet or Teams `bot.failed` webhook. Not a closed list. */
export type FailureReason =
  | 'invalid_meeting_link' | 'meeting_restricted' | 'meeting_not_started' | 'meeting_ended'
  | 'sign_in_required' | 'google_sign_in_failed' | 'cant_join_call'
  | (string & {});

/** The specific reason on a terminal `bot.stopped` delivery. */
export type StopReason =
  | 'bot.stopped' | 'bot.kicked' | 'bot.notallowed' | 'bot.denied' | 'bot.failed'
  | (string & {});

/** State of a stop request, from `bots.stopStatus()` and `bots.remove()`. */
export interface StopStatus {
  bot_id?: string;
  status?:
    | 'not_requested' | 'stop_requested' | 'acknowledged' | 'graceful_exit_in_progress'
    | 'stopped' | 'force_stopped' | 'failed' | 'cancelled'
    | (string & {});
  /** The bot's own lifecycle status, or `Unknown`. */
  bot_status?: BotStatus;
  control_request_id?: string;
  /** Unix epoch seconds. */
  requested_at?: number;
  acknowledged_at?: number;
  completed_at?: number;
  reason?: string;
  [k: string]: unknown;
}

/* ------------------------------------------------------ speaker timeline */

/**
 * Returned by `get_speaker_timeline` instead of the timeline when it is too
 * large to send inline (about 5 MB or more). Download `speaker_timeline_url`
 * (no API key needed, valid for 1 hour) to get the full timeline, in the same
 * format as an inline response. Treat the URL like the meeting data itself.
 */
export interface SpeakerTimelineDownload {
  bot_id: string;
  speaker_timeline_url: string;
  size_bytes: number;
  /** Always `false`: the file at the URL is the complete timeline. */
  truncated: boolean;
}

/** The timeline JSON itself. Its shape depends on the meeting platform. */
export type SpeakerTimelineInline = Record<string, unknown> | unknown[];

/** `get_speaker_timeline` returns the timeline inline, or a download link for large ones. */
export type SpeakerTimeline = SpeakerTimelineInline | SpeakerTimelineDownload;

/* ------------------------------------------------------------ screenshots */

export interface Screenshot {
  /** `YYYYMMDDTHHMMSSsssZ_<uuid4>` */
  id: string;
  recorded_at?: string;
  /** Pre-signed download URL, valid for 1 hour. */
  url?: string;
  filename?: string;
  size_bytes?: number | null;
  /** The metadata sent with the screenshot command, if any. */
  meta?: Record<string, unknown> | null;
  [k: string]: unknown;
}

export interface ListScreenshotsParams {
  /** Page size, up to 100. Default 25. */
  limit?: number;
  /** ISO 8601. Only screenshots recorded at or after this time. */
  recorded_at_after?: string;
  /** ISO 8601. Only screenshots recorded before this time. */
  recorded_at_before?: string;
  /** `next_continuation_token` or `prev_continuation_token` from a previous page. */
  continuation_token?: string;
  /** `prev` with a `prev_continuation_token` to page backwards. */
  action?: 'prev';
  /** The `meta` value from the previous page, sent back with the continuation token. */
  meta?: string;
}

export interface ScreenshotsPage {
  bot_id?: string;
  /** Newest first. */
  screenshots: Screenshot[];
  next_continuation_token?: string | null;
  prev_continuation_token?: string | null;
  meta?: string;
  [k: string]: unknown;
}

/* --------------------------------------------------------- bot commands */

/**
 * Live-bot commands for `bots.sendCommand()`. The bot must be in the meeting
 * (409 otherwise). Commands share a per-bot rate limit (429 with `retryAfter`).
 * Zoom RTMS sessions are receive-only and return 400 for every command.
 */
export type SendCommandParams =
  /** Raise the bot's own hand. Google Meet, Zoom and Teams. Safe to repeat. */
  | { command: 'raise_hand' }
  /** Lower the bot's own hand. Google Meet, Zoom and Teams. Safe to repeat. */
  | { command: 'lower_hand' }
  /** Post a chat message (1-2000 characters). */
  | { command: 'sendmsg'; message: string; metadata?: Record<string, unknown> }
  /** Post an agent or user chat line, marked final or partial. */
  | { command: 'sendchat'; message: string; role: 'assistant' | 'user'; is_final: boolean }
  /** Show a base64 image as the bot's video for `display_duration` seconds. */
  | { command: 'sendimg'; img: string; display_duration?: number; metadata?: Record<string, unknown> }
  /** Show an image from an HTTPS URL as the bot's video for `display_duration` seconds. */
  | { command: 'sendimg_url'; img_url: string; display_duration?: number; metadata?: Record<string, unknown> }
  /** Stop a MIA agent's current speech. */
  | { command: 'interrupt' }
  /** Capture the current meeting view. The response carries a 1-hour download URL. */
  | { command: 'screenshot'; metadata?: Record<string, unknown> }
  /** Update a running MIA agent. See {@link UpdateLiveMiaParams}. */
  | ({ command: 'update_mia' } & UpdateLiveMiaParams)
  | { command: 'pause_recording' }
  | { command: 'resume_recording' };

export type BotCommand = SendCommandParams['command'];

/** Every accepted command returns at least this. */
export interface CommandResponse<C extends string = BotCommand> {
  status: 'accepted' | (string & {});
  bot_id: string;
  command: C;
  [k: string]: unknown;
}

/** `raise_hand` / `lower_hand`. */
export interface HandCommandResponse extends CommandResponse<'raise_hand' | 'lower_hand'> {
  /**
   * The hand state the bot read back from the meeting after it acted, not an
   * echo of the request. Present when the bot reported it.
   */
  hand_raised?: boolean;
}

/** `screenshot`. */
export interface ScreenshotCommandResponse extends CommandResponse<'screenshot'> {
  id?: string;
  filename?: string;
  recorded_at?: string;
  /** Pre-signed download URL, valid for 1 hour. */
  url?: string;
}

/** `sendmsg` / `sendchat`. */
export interface ChatCommandResponse extends CommandResponse<'sendmsg' | 'sendchat'> {
  request_id?: string;
}

/** `pause_recording` / `resume_recording`. */
export interface RecordingCommandResponse extends CommandResponse<'pause_recording' | 'resume_recording'> {
  recording_paused?: boolean;
}

/** `update_mia`, from `bots.updateMia()` or `sendCommand({ command: 'update_mia' })`. */
export interface UpdateLiveMiaResponse extends Omit<CommandResponse<'update_mia'>, 'status'> {
  /**
   * `accepted` when the update was handed to the bot. With `wait_for_ack: true`
   * it is the agent's own result: `applied`, `partially_applied` or `failed`
   * (or `accepted` when the agent did not answer in time).
   */
  status: 'accepted' | 'applied' | 'partially_applied' | 'failed' | (string & {});
  /** With `wait_for_ack`: the fields the agent applied. */
  applied?: unknown;
  /** With `wait_for_ack`: what the agent could not apply. */
  errors?: unknown;
  /** With `wait_for_ack`: true when the agent did not answer in time. */
  ack_timeout?: boolean;
}

/** The response type `sendCommand` resolves to for a given command. */
export type SendCommandResponse<C extends BotCommand = BotCommand> =
  C extends 'raise_hand' | 'lower_hand' ? HandCommandResponse
  : C extends 'screenshot' ? ScreenshotCommandResponse
  : C extends 'sendmsg' | 'sendchat' ? ChatCommandResponse
  : C extends 'pause_recording' | 'resume_recording' ? RecordingCommandResponse
  : C extends 'update_mia' ? UpdateLiveMiaResponse
  : CommandResponse<C>;

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

/**
 * Who supplies the provider key for a pipeline section (`transcriber`,
 * `model`, `voice`).
 *
 * - `"meetstream"`: MeetStream's inbuilt keys. Send no `api_key`. Pipeline
 *   mode only. Inbuilt keys cover OpenAI (LLM, speech and voice models) and
 *   Deepgram (speech-to-text) today. The per-hour price of the model you pick
 *   is added to the agent price; the dashboard agent editor shows the rate.
 *   While inbuilt keys are not on for your account, the API answers 400
 *   `MeetStream-managed keys are not available for <section>. Use your own key.`
 *   (see {@link isInbuiltKeysUnavailable}). Use your own key then.
 * - `"user"` (or omitted): your own provider key, saved in the dashboard
 *   integrations. The provider bills you for model usage.
 *
 * Docs: https://docs.meetstream.ai/guides/mia/pricing-and-keys
 */
export type KeySource = 'meetstream' | 'user';

/**
 * LLM provider for `model.provider`. `anthropic` (Claude) is pipeline mode
 * only and uses the Anthropic key saved in your model integrations.
 * `local_agent` makes your own agent (Claude Code, Codex, Hermes and others,
 * through the MeetStream Agent Kit) the brain of the voice agent.
 */
export type MiaLlmProvider = 'openai' | 'anthropic' | 'xai' | 'google' | 'local_agent' | (string & {});

/** Access level of a local agent. `readonly` is the default. */
export type LocalAgentAccess = 'readonly' | 'confirm' | 'full';

/**
 * `model.local_agent`, with `model.provider: "local_agent"` (pipeline mode
 * only). Your agent runs on your own computer, on your own subscription, and
 * MeetStream charges no model tokens for its replies. `transcriber` and
 * `voice` are still required.
 *
 * Meeting speech and chat reach an agent that can use your computer, so treat
 * them as untrusted input: keep the lowest access level that does the job,
 * keep the activation code on, and keep the computer, the agent and the
 * bridge running for the whole call.
 *
 * Needs the local agent feature on for your account. Run
 * `mia.checkLocalAgent()` before the call.
 *
 * Docs: https://docs.meetstream.ai/guides/features/mia-screen-sharing-and-custom-agents
 */
export interface MiaLocalAgentConfig {
  /** Public HTTPS address of your Agent Kit bridge (tunnel). Up to 300 characters. */
  url: string;
  /** Display label. Up to 40 characters. */
  label?: string;
  /** Default `readonly`. Your computer sets the highest level; this can only lower it. */
  access?: LocalAgentAccess;
  /** Activation code in the meeting chat before the agent acts. Default `true`. */
  require_code?: boolean;
  /** Only the owner can start a turn. Default `true`. */
  owner_only?: boolean;
  /** Up to 10 display names. Guests can copy names, so prefer the activation code. */
  owner_names?: string[];
  /** Up to 10 participant ids. */
  owner_ids?: string[];
  /** Seconds to wait for a reply, 10 to 600. Default 120. */
  timeout_s?: number;
  [k: string]: unknown;
}

export interface MiaModelConfig {
  provider?: MiaLlmProvider;
  /**
   * Model name. For `anthropic`, for example `claude-haiku-5-5` (fastest
   * replies) or `claude-sonnet-5-5`. Optional with `local_agent`.
   */
  model?: string;
  /** Inbuilt keys or your own key. Pipeline mode only. See {@link KeySource}. */
  key_source?: KeySource;
  /** Your own provider key, when you do not use a saved integration. Never with `key_source: "meetstream"`. */
  api_key?: string;
  /** Optional with `local_agent`. */
  system_prompt?: string;
  /** What the agent says on joining. Set it, and disclose that it is an AI. */
  first_message?: string;
  /** With `anthropic`: 0 to 1. */
  temperature?: number;
  /**
   * Reasoning effort where the model supports it. The agent uses `low` when
   * omitted.
   */
  reasoning_effort?: 'none' | 'minimal' | 'low' | 'medium' | 'high' | 'xhigh' | 'max' | (string & {});
  /** With `anthropic`, only `auto` or `none`. */
  tool_choice?: 'auto' | 'none' | (string & {});
  max_tokens?: number;
  /** Not supported with `anthropic` (400). */
  top_p?: number;
  /** Not supported with `anthropic` (400). */
  frequency_penalty?: number;
  /** Not supported with `anthropic` (400). */
  presence_penalty?: number;
  /** Required with `provider: "local_agent"`. */
  local_agent?: MiaLocalAgentConfig;
  [k: string]: unknown;
}

export interface MiaTranscriberConfig {
  /** For example `deepgram`, `assemblyai`, `openai` or `xai`. */
  provider?: string;
  model?: string;
  /**
   * Speech recognition language, for example `en` (the default) or `es`.
   * Leave it unset, or use `multi` or `auto`, for automatic language detection.
   */
  language?: string;
  /** Inbuilt keys or your own key. See {@link KeySource}. */
  key_source?: KeySource;
  /** Your own provider key, when you do not use a saved integration. */
  api_key?: string;
  /**
   * Product names, people's names and jargon. This one field fixes most
   * "it mishears our company name" complaints.
   */
  boostwords?: string[];
  [k: string]: unknown;
}

/** `voice` (text-to-speech). Pipeline mode only; in realtime mode the voice lives inside `model`. */
export interface MiaVoiceConfig {
  /** For example `openai`, `elevenlabs` or `xai`. Required. */
  provider?: string;
  /** Required. */
  voice_id?: string;
  model?: string;
  speed?: number;
  /** Inbuilt keys or your own key. See {@link KeySource}. */
  key_source?: KeySource;
  /** Your own provider key, when you do not use a saved integration. */
  api_key?: string;
  [k: string]: unknown;
}

/**
 * Built-in tools for `agent.tools`. `screen` (Google Meet, a vision-capable
 * model) lets the agent present and work a live web page in the meeting.
 */
export type MiaBuiltInTool = 'current_time' | 'weather_now' | 'screen' | (string & {});

export interface MiaAgentConfig {
  response_modality?: string;
  /** Built-in tools, for example `["screen"]`. */
  tools?: MiaBuiltInTool[];
  /** Your HTTPS functions the agent can call. Up to 20. */
  custom_functions?: unknown[];
  /** MCP servers the agent can reach. This is what turns a talking bot into one that does work. */
  mcp_servers?: unknown[];
  /**
   * Google Meet, with `tools: ["screen"]`: the bot presents its own desktop
   * (editor, terminal, spreadsheet). Opt-in. Default `false`.
   */
  desktop?: boolean;
  /** Treat chat messages that name the agent as requests, and answer in the chat. Default `false`. */
  chat_input?: boolean;
  /** Do the task without talking through each step. Default `false`. */
  quiet_actions?: boolean;
  /** Act during the meeting, but speak only when addressed by name. Pipeline mode. Default `false`. */
  speak_only_when_asked?: boolean;
  enable_interruptions?: boolean;
  interruption_mode?: string;
  false_interruption_timeout?: number;
  vad_threshold?: number;
  vad_eagerness?: string;
  user_away_timeout?: number;
  /**
   * When an MCP server cannot be reached at agent start: `true` (default)
   * starts without its tools; `false` does not start the agent. Both send an
   * `agent_error` webhook with `error_type: "mcp_unavailable"`.
   */
  mcp_fail_open?: boolean;
  /** Resume speaking after a false interruption. Default `true`. */
  resume_false_interruption?: boolean;
  [k: string]: unknown;
}

export interface CreateMiaParams {
  agent_name: string;
  /** `pipeline` gives you per-layer control, wake words, inbuilt keys and `local_agent`; `realtime` is lowest latency. */
  mode?: 'pipeline' | 'realtime' | (string & {});
  model?: MiaModelConfig;
  /** Pipeline mode only. In realtime mode the voice lives inside `model`. */
  voice?: MiaVoiceConfig;
  /** Pipeline mode only. */
  transcriber?: MiaTranscriberConfig;
  agent?: MiaAgentConfig;
  audio?: { sample_rate?: number; num_channels?: number; [k: string]: unknown };
  /** Pipeline mode only. */
  wake_word?: { enabled?: boolean; words?: string[]; timeout?: number; [k: string]: unknown };
  /** Gives the agent a visual avatar in the meeting video. */
  Avatar?: { provider?: string; enabled?: boolean; avatar_id?: string; [k: string]: unknown };
  [k: string]: unknown;
}

/**
 * Body of `mia.update()` (`PUT /mia`). `PUT` replaces each block you send,
 * so send the whole `agent` block. A masked secret (`****` plus the last four
 * characters) sent back keeps the stored value.
 */
export type UpdateMiaConfigParams = { agent_config_id: string } & Partial<CreateMiaParams>;

/** A saved agent config as the API returns it. Secrets come back masked. */
export interface AgentConfig {
  AgentConfigID?: string;
  AgentName?: string;
  Mode?: string;
  Model?: Record<string, unknown>;
  Voice?: Record<string, unknown>;
  Transcriber?: Record<string, unknown>;
  CreatedAt?: string;
  UpdatedAt?: string;
  [k: string]: unknown;
}

/** Response of `mia.create()`. */
export interface CreateMiaResponse {
  message?: string;
  agent_config_id: string;
  agent_config?: AgentConfig;
  [k: string]: unknown;
}

/** Result of `mia.checkLocalAgent()`. */
export interface LocalAgentCheck {
  local_agent: {
    /**
     * `ok`, or why the bridge cannot be used: `login_expired`,
     * `not_installed`, `no_token`, `token_rejected`, `unreachable`,
     * `bad_url`, `not_local_agent`.
     */
    status:
      | 'ok' | 'login_expired' | 'not_installed' | 'no_token' | 'token_rejected'
      | 'unreachable' | 'bad_url' | 'not_local_agent' | (string & {});
    latency_ms?: number;
    agent?: string;
    label?: string;
    login?: unknown;
    max_access?: LocalAgentAccess | (string & {});
    warm?: boolean;
    [k: string]: unknown;
  };
  [k: string]: unknown;
}

/**
 * Update a running MIA agent mid-call (`bots.updateMia()`). Send at least one
 * of the update fields. Saved agent configs are not changed.
 */
export interface UpdateLiveMiaParams {
  /** New values for the prompt's template variables. Scalars only. Up to 50 keys. */
  agent_config_params?: Record<string, string | number | boolean>;
  /** Replace the system prompt. Up to 32000 characters. */
  system_prompt?: string;
  wake_word_enabled?: boolean;
  /** Non-empty list, up to 10. To turn the wake word off, send `wake_word_enabled: false`. */
  wake_words?: string[];
  /**
   * Wait for the agent to apply the update and return its result
   * (`applied`, `partially_applied` or `failed`) instead of `accepted`.
   */
  wait_for_ack?: boolean;
}

/* --------------------------------------------------------------- billing */

/**
 * `GET /billing/balance`: your prepaid balance. Read only. Available when the
 * endpoint is on for your account; see `BalanceUnavailableError`.
 */
export interface BillingBalance {
  /** For example `pay_as_you_go`, or `invoice` for accounts billed by invoice. */
  customer_type: 'pay_as_you_go' | 'invoice' | (string & {});
  /**
   * Balance in US dollars as a decimal string, for example `"12.34"`.
   * `null` for accounts billed by invoice, which have no prepaid balance.
   */
  balance_usd: string | null;
  currency: 'USD' | (string & {});
  [k: string]: unknown;
}

/* ----------------------------------------------- failed transcript (422) */

/** Body of a `422` from `get_transcript`: the transcript failed and will not become ready. */
export interface FailedTranscriptBody {
  /** `Transcript processing failed: <reason>`. */
  message: string;
  transcript_status: 'Failed' | (string & {});
  transcript_id?: string;
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
  | 'bot.recording_permission_allowed' | 'bot.recording_permission_denied'
  | 'bot.leaving' | 'bot.stopped' | 'bot.error' | 'bot.uploading' | 'bot.done'
  | 'manifest.completed' | 'audio.processed' | 'video.processed' | 'video.failed'
  | 'transcription.processed' | 'transcription.failed' | 'bot.transcriptionready'
  | 'audio.skipped' | 'manifest.skipped' | 'transcription.skipped'
  | 'participant_events.join' | 'participant_events.leave' | 'participant_events.chat_message'
  | 'participant_events.raise_hand' | 'participant_events.lower_hand'
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
  /** On a Google Meet or Teams `bot.failed`: why the meeting blocked the join. */
  failure_reason?: FailureReason;
  /** On `audio.skipped`: `no_speech` when the meeting was silent. */
  no_audio_reason?: 'no_speech' | (string & {});
  [k: string]: unknown;
}

/**
 * A participant event delivered to a `recording_config.realtime_endpoints`
 * entry that lists it, for example `participant_events.raise_hand`.
 *
 * Hand events report transitions only: the bot's own hand is never reported,
 * and a participant who leaves with a hand up gets no `lower_hand`.
 */
export interface ParticipantEventPayload {
  event: RealtimeEvent;
  timestamp?: string;
  data?: {
    data?: {
      /** For example `join`, `leave`, `raise_hand`, `lower_hand`. */
      action?: string;
      participant?: {
        id?: string;
        name?: string;
        is_host?: boolean;
        platform?: string;
        extra_data?: unknown;
        [k: string]: unknown;
      };
      timestamp?: { relative?: number; absolute?: string; [k: string]: unknown };
      [k: string]: unknown;
    };
    bot?: { id?: string; metadata?: unknown; [k: string]: unknown };
    [k: string]: unknown;
  };
  custom_attributes?: Record<string, string>;
  [k: string]: unknown;
}
