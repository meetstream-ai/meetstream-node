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

export interface CreateBotParams {
  /** The join URL. Note: `meeting_link`, not `meeting_url`. */
  meeting_link: string;
  bot_name?: string;
  /** Video is off by default; it costs more and takes longer to process. */
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
  google_meet?: { login_required?: boolean; google_login_domain?: string; sign_in_email?: string; [k: string]: unknown };
  zoom?: { use_zoom_obf?: boolean; [k: string]: unknown };
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

/** Why a bot stopped. Carried on the terminal `bot.stopped` webhook. */
export type BotStatus = 'Stopped' | 'NotAllowed' | 'Denied' | 'Error' | (string & {});

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
 * -> `video.processed` -> `bot.done` -> `data_deletion`
 *
 * `bot.stopped` is the single terminal event and always carries
 * `status_code: 200`; the reason is in `bot_status`. `bot.error` is
 * non-terminal - the bot keeps running. Streaming-only providers stop at
 * `audio.processed` and never emit `bot.done`.
 */
export type WebhookEvent =
  | 'bot.joining' | 'bot.in_waiting_room' | 'bot.inmeeting' | 'bot.recording'
  | 'bot.leaving' | 'bot.stopped' | 'bot.error' | 'bot.done'
  | 'manifest.completed' | 'audio.processed' | 'video.processed'
  | 'transcription.processed' | 'transcription.failed' | 'data_deletion'
  | (string & {});

/** The webhook envelope. The key is `event`, not `bot_event`. */
export interface WebhookPayload {
  event: WebhookEvent;
  bot_id?: string;
  bot_status?: BotStatus;
  message?: string;
  /** `bot.stopped` is always 200, whatever the reason. 500 appears on `transcription.failed`. */
  status_code?: number;
  custom_attributes?: Record<string, string>;
  [k: string]: unknown;
}
