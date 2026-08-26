import { HttpClient, type ClientOptions, type RequestOptions, DEFAULT_BASE_URL } from './client.js';
import { Bots } from './resources/bots.js';
import { Transcripts } from './resources/transcripts.js';
import { Calendar } from './resources/calendar.js';
import { Mia } from './resources/mia.js';
import { GoogleLogins, Zoom, Storage } from './resources/integrations.js';

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
  readonly zoom: Zoom;
  readonly storage: Storage;

  constructor(options: ClientOptions = {}) {
    this.http = new HttpClient(options);
    this.bots = new Bots(this.http);
    this.transcripts = new Transcripts(this.http);
    this.calendar = new Calendar(this.http);
    this.mia = new Mia(this.http);
    this.googleLogins = new GoogleLogins(this.http);
    this.zoom = new Zoom(this.http);
    this.storage = new Storage(this.http);
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
} from './errors.js';

export { verifyWebhookSignature, parseWebhook, isTerminal, describeStop } from './webhooks.js';

export type {
  Bot,
  BotStatus,
  CreateBotParams,
  CreateMiaParams,
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
} from './types.js';
