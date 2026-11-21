/**
 * Read transcript segments from `get_transcript`.
 *
 * A segment names the speaker in `participant.name` and holds the text in a
 * `words` list (`words[].text`). Some providers also send flat `speaker` and
 * `transcript` fields. These helpers read both shapes, so a transcript never
 * "looks empty" because the code read the wrong field.
 */
import type { TranscriptSegment } from './types.js';

type SegmentLike = TranscriptSegment | Record<string, unknown>;

const str = (v: unknown): string => (typeof v === 'string' ? v.trim() : '');

/** Speaker name: `participant.name`, else the flat `speaker` field, else `fallback`. */
export function segmentSpeaker(segment: SegmentLike, fallback = 'Unknown'): string {
  const participant = (segment as Record<string, unknown>).participant;
  if (participant && typeof participant === 'object') {
    const name = str((participant as Record<string, unknown>).name);
    if (name) return name;
  }
  return str((segment as Record<string, unknown>).speaker) || fallback;
}

/** Segment text: `words[].text` joined with spaces, else the flat `transcript` field. */
export function segmentText(segment: SegmentLike): string {
  const s = segment as Record<string, unknown>;
  if (Array.isArray(s.words)) {
    const parts = s.words
      .map((w) => {
        if (!w || typeof w !== 'object') return '';
        const word = w as Record<string, unknown>;
        return str(word.text ?? word.punctuated_word ?? word.word);
      })
      .filter(Boolean);
    if (parts.length) return parts.join(' ');
  }
  return str(s.transcript) || str(s.text);
}

/** Start in seconds from the meeting start, or `undefined` when the segment has none. */
export function segmentStart(segment: SegmentLike): number | undefined {
  const s = segment as Record<string, unknown>;
  if (typeof s.start_time === 'number') return s.start_time;
  if (Array.isArray(s.words) && s.words[0] && typeof s.words[0] === 'object') {
    const stamp = (s.words[0] as Record<string, unknown>).start_timestamp;
    if (stamp && typeof stamp === 'object') {
      const rel = (stamp as Record<string, unknown>).relative;
      if (typeof rel === 'number') return rel;
    }
  }
  return undefined;
}
