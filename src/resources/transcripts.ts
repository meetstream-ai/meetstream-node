import type { HttpClient, RequestOptions } from '../client.js';
import { NotReadyError } from '../errors.js';
import type { TranscriptSegment } from '../types.js';

export interface WaitOptions extends RequestOptions {
  timeoutMs?: number;
  intervalMs?: number;
}

export class Transcripts {
  constructor(private readonly http: HttpClient) {}

  /**
   * Fetch a transcript by **`transcript_id`**, not `bot_id`. Get the id from
   * the `createBot` response, `bots.detail()`, or `listForBot()`.
   *
   * Segments use a `transcript` field, not `text`. Reading the wrong field is
   * the usual reason a transcript "looks empty".
   *
   * Throws `NotReadyError` on HTTP 202.
   */
  get(
    transcriptId: string,
    params: { raw?: boolean } = {},
    opts: RequestOptions = {},
  ): Promise<{ transcript?: TranscriptSegment[] } | unknown> {
    return this.http.get(`/transcript/${encodeURIComponent(transcriptId)}/get_transcript`, {
      ...opts,
      query: { raw: params.raw ?? false },
    });
  }

  /** Every transcript belonging to a bot. */
  listForBot(botId: string, opts: RequestOptions = {}): Promise<unknown> {
    return this.http.get(`/bots/${encodeURIComponent(botId)}/transcriptions`, opts);
  }

  /**
   * Re-transcribe a bot's stored audio.
   *
   * This is the escape hatch when a bot used a streaming-only provider: the
   * live stream was the only record, and this generates a post-call transcript
   * from the audio after the fact.
   */
  transcribeBotAudio(botId: string, body: Record<string, unknown> = {}, opts: RequestOptions = {}): Promise<unknown> {
    return this.http.post(`/bots/${encodeURIComponent(botId)}/transcribe`, body, opts);
  }

  /**
   * Wait for a transcript, bounded.
   *
   * Never unbounded on purpose: streaming-only providers return 202 forever
   * because no post-call transcript will ever exist.
   */
  async waitFor(transcriptId: string, opts: WaitOptions = {}): Promise<unknown> {
    const timeoutMs = opts.timeoutMs ?? 900_000;
    const intervalMs = opts.intervalMs ?? 5_000;
    const deadline = Date.now() + timeoutMs;

    for (;;) {
      try {
        return await this.get(transcriptId, {}, opts);
      } catch (e) {
        if (!(e instanceof NotReadyError)) throw e;
        if (Date.now() + intervalMs > deadline) {
          throw new NotReadyError(
            `Transcript ${transcriptId} was still not ready after ${Math.round(timeoutMs / 1000)}s. ` +
              'If the bot used a streaming-only provider the transcript was delivered live and no ' +
              'post-call transcript exists; use transcribeBotAudio() to generate one.',
            { status: 202 },
          );
        }
        await new Promise((r) => setTimeout(r, intervalMs));
      }
    }
  }
}
