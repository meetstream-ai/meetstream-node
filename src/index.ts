import { HttpClient, type ClientOptions, type RequestOptions, DEFAULT_BASE_URL } from './client.js';
import { Bots, isSpeakerTimelineDownload } from './resources/bots.js';
import { Transcripts } from './resources/transcripts.js';
import { Calendar } from './resources/calendar.js';
import { Mia } from './resources/mia.js';
import { GoogleLogins, TeamsLogins, Zoom, Storage } from './resources/integrations.js';
import { Billing } from './resources/billing.js';
import { MeetingDirectConnect } from './resources/meeting-direct-connect.js';

/**
 * The MeetStream client.
 *
 * ```ts
 * import { MeetStream } from '@meetstream/sdk';
 *
 * const meetstream = new MeetStream(); // reads MEETSTREAM_API_KEY
 *
 * const bot = await meetstream.bots.create({
 *   meeting_link: 'https://meet.google.com/abc-defg-hij',
 *   bot_name: 'Notetaker',
 *   recording_config: {
 *     transcript: { provider: { deepgram: { model: 'nova-3', language: 'en' } } },
 *   },
 * });
 *
 * const transcript = await meetstream.transcripts.waitFor(bot.transcript_id!);
 * ```
 */
export class MeetStream {
  /** Low-level transport, if you need an endpoint the SDK does not wrap yet. */
  readonly http: HttpClient;

  readonly bots: Bots;
  readonly transcripts: Transcripts;
  readonly calendar: Calendar;
  readonly mia: Mia;
  readonly googleLogins: GoogleLogins;
  readonly teamsLogins: TeamsLogins;
  readonly zoom: Zoom;
  readonly storage: Storage;
  readonly billing: Billing;
  readonly meetingDirectConnect: MeetingDirectConnect;

  constructor(options: ClientOptions = {}) {
    this.http = new HttpClient(options);
    this.bots = new Bots(this.http);
    this.transcripts = new Transcripts(this.http);
    this.calendar = new Calendar(this.http);
    this.mia = new Mia(this.http);
    this.googleLogins = new GoogleLogins(this.http);
    this.teamsLogins = new TeamsLogins(this.http);
    this.zoom = new Zoom(this.http);
    this.storage = new Storage(this.http);
    this.billing = new Billing(this.http);
    this.meetingDirectConnect = new MeetingDirectConnect(this.http);
  }
}

export default MeetStream;

export { HttpClient, DEFAULT_BASE_URL };
export type { ClientOptions, RequestOptions };

export {
  MeetStreamError,
  ConnectionError,
  TimeoutError,
  BadRequestError,
  AuthenticationError,
  PermissionError,
  NotFoundError,
  ConflictError,
  RateLimitError,
  ServerError,
  NotReadyError,
  TranscriptFailedError,
  isInbuiltKeysUnavailable,
} from './errors.js';

export { verifyWebhookSignature, parseWebhook, isTerminal, stopReason, describeStop } from './webhooks.js';
export { isSpeakerTimelineDownload };
export type { CalendarProvider } from './resources/calendar.js';
export type { ErrorOptions } from './errors.js';

export type {
  VideoLayout,
  Bot,
  BotStatus,
  BotErrorReason,
  FailureReason,
  StopStatus,
  CreateBotParams,
  ZoomJoinOptions,
  RealtimeEndpoint,
  RealtimeEvent,
  SmallestTranscriptionConfig,
  SmallestStreamingTranscriptionConfig,
  SpeakerTimeline,
  SpeakerTimelineInline,
  SpeakerTimelineDownload,
  Screenshot,
  ScreenshotsPage,
  ListScreenshotsParams,
  BotCommand,
  SendCommandParams,
  SendCommandResponse,
  CommandResponse,
  HandCommandResponse,
  ScreenshotCommandResponse,
  ChatCommandResponse,
  RecordingCommandResponse,
  UpdateLiveMiaParams,
  UpdateLiveMiaResponse,
  MiaLlmProvider,
  CreateMiaParams,
  CreateMiaResponse,
  UpdateMiaConfigParams,
  AgentConfig,
  KeySource,
  LocalAgentAccess,
  MiaLocalAgentConfig,
  MiaVoiceConfig,
  MiaBuiltInTool,
  LocalAgentCheck,
  BillingBalance,
  FailedTranscriptBody,
  GoogleMeetSignInOptions,
  TeamsSignInOptions,
  RecordingConfig,
  AutomaticLeaveConfig,
  TranscriptSegment,
  TranscriptProviderConfig,
  TranscriptionProvider,
  PostCallTranscriptionProvider,
  StreamingTranscriptionProvider,
  MiaModelConfig,
  MiaAgentConfig,
  MiaTranscriberConfig,
  WebhookEvent,
  WebhookPayload,
  ParticipantEventPayload,
  StopReason,
} from './types.js';
