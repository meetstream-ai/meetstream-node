<div align="center">

# MeetStream SDK for TypeScript

**Send AI bots into Zoom, Google Meet and Microsoft Teams.** Record, transcribe, summarize and stream meetings, and run [MIA voice agents](#mia-voice-agents) that talk back.

[![npm](https://img.shields.io/npm/v/@meetstream/sdk?style=flat-square&color=fd6316)](https://www.npmjs.com/package/@meetstream/sdk)
[![Docs](https://img.shields.io/badge/docs-docs.meetstream.ai-45689f?style=flat-square)](https://docs.meetstream.ai)
[![Types](https://img.shields.io/badge/types-included-3178c6?style=flat-square)](#typed-end-to-end)
[![Deps](https://img.shields.io/badge/runtime%20deps-0-2c8a61?style=flat-square)](#why-this-sdk)
[![License](https://img.shields.io/badge/license-MIT-867c72?style=flat-square)](LICENSE)

</div>

```bash
npm install @meetstream/sdk
```

Node 18.17+. ESM and CommonJS. **Zero runtime dependencies.**

## Quickstart

```ts
import { MeetStream } from '@meetstream/sdk';

const meetstream = new MeetStream(); // reads MEETSTREAM_API_KEY

const bot = await meetstream.bots.create({
  meeting_link: 'https://meet.google.com/abc-defg-hij',
  bot_name: 'Notetaker',
  recording_config: {
    transcript: { provider: { deepgram: { model: 'nova-3', language: 'en' } } },
  },
});

// Bounded wait - never spins forever, even on a streaming-only bot.
const transcript = await meetstream.transcripts.waitFor(bot.transcript_id!);
```

Get a key at [app.meetstream.ai/api-key](https://app.meetstream.ai/api-key).

## Why this SDK

The MeetStream API has a handful of behaviours that look like bugs until you know them. This SDK encodes all of them so you do not have to rediscover them in production.

| The trap | What the SDK does |
|---|---|
| **`202` sits inside the 2xx range** and means "not ready yet", not success | Raises `NotReadyError` instead of handing you an empty body |
| **`507` looks like a failure** but is an idempotent replay | Resolves as success, returning the original resource |
| **Streaming-only providers return `202` forever** — no post-call transcript ever exists | `waitFor()` is always bounded and tells you exactly why it gave up |
| **Transcripts are keyed by `transcript_id`**, not `bot_id` | `transcripts.get()` takes the right id, and the types say so |
| **Segments use `transcript`, not `text`** | Typed, so the wrong field is a compile error |
| **`remove_bot` is a `GET`** | `bots.remove()` handles it |
| **REST uses `Token`, the MCP server uses `Bearer`** | Correct scheme sent automatically |
| **MIA takes only `agent_config_id`** | Documented on the type; extra bridge fields are the usual cause of a silent agent |

## Typed end to end

Types ship with the package and mirror the wire format exactly, so what you write is what the API receives.

```ts
import type { CreateBotParams, WebhookPayload } from '@meetstream/sdk';

const params: CreateBotParams = {
  meeting_link: 'https://zoom.us/j/123',   // not meeting_url
  video_required: true,
  audio_separate_streams: true,            // per-participant tracks
  automatic_leave: {
    waiting_room_timeout: 300,
    in_call_recording_timeout: 900,        // minimum 600, below that the API 400s
  },
};
```

## What you can do

<details open>
<summary><b>Bots</b> — lifecycle, media, live interaction</summary>

```ts
await meetstream.bots.create(params, { idempotencyKey: uuid });
await meetstream.bots.list();
await meetstream.bots.status(botId);
await meetstream.bots.detail(botId);       // includes transcript_id
await meetstream.bots.summary(botId);      // AI summary
await meetstream.bots.remove(botId);       // leave, keep the data
await meetstream.bots.deleteData(botId);   // irreversible

await meetstream.bots.audio(botId);
await meetstream.bots.video(botId);
await meetstream.bots.audioStreams(botId);      // per-participant audio
await meetstream.bots.recordingStreams(botId);  // per-participant video
await meetstream.bots.screenshots(botId);
await meetstream.bots.waitForAudio(botId);      // bounded

await meetstream.bots.participants(botId);
await meetstream.bots.chats(botId);
await meetstream.bots.speakerTimeline(botId);

await meetstream.bots.sendMessage(botId, 'Recording has started.');
await meetstream.bots.sendImage(botId, { img_url: 'https://…/slide.png', display_duration: 5 });
await meetstream.bots.pauseRecording(botId);    // privacy window
await meetstream.bots.resumeRecording(botId);
```

</details>

<details open>
<summary><b>Transcripts</b></summary>

```ts
await meetstream.transcripts.get(transcriptId);
await meetstream.transcripts.waitFor(transcriptId, { timeoutMs: 900_000 });
await meetstream.transcripts.listForBot(botId);
await meetstream.transcripts.transcribeBotAudio(botId);  // rescue a streaming-only bot
```

</details>

<details open>
<summary><b>Calendar</b> — auto-join and scheduling</summary>

```ts
await meetstream.calendar.connectGoogle({ google_client_id, google_client_secret, google_refresh_token });
await meetstream.calendar.connectOutlook({ /* … */ });
await meetstream.calendar.events();
await meetstream.calendar.scheduleEvent(eventId);
await meetstream.calendar.listScheduledBots();
await meetstream.calendar.rescheduleBot(botId, { scheduled_join_time: '2026-09-01T10:00:00Z' });
await meetstream.calendar.enableAutoSchedule();
```

</details>

<details open>
<summary><b>MIA voice agents</b></summary>

```ts
const agent = await meetstream.mia.create({
  agent_name: 'Meeting Assistant',
  mode: 'pipeline',                        // or 'realtime' for speech-to-speech
  model:       { provider: 'openai', model: 'gpt-4.1', first_message: "Hi, I'm an AI assistant on this call." },
  voice:       { provider: 'openai', voice_id: 'nova' },
  transcriber: { provider: 'deepgram', model: 'nova-3', boostwords: ['Acme', 'MeetStream'] },
  agent:       { tools: [], mcp_servers: [], enable_interruptions: true },
  wake_word:   { enabled: true, words: ['hey acme'], timeout: 30 },
});

// Attach it with ONE field. Adding socket_connection_url or
// live_audio_required alongside is the usual cause of a silent agent.
await meetstream.bots.create({ meeting_link, agent_config_id: agent.agent_config_id });
```

`boostwords` fixes most "it mishears our company name" complaints, and `mcp_servers` is what turns a talking bot into one that can do work mid-call.

</details>

<details>
<summary><b>Integrations</b> — Google signed-in bots, Zoom OAuth, your own S3</summary>

```ts
await meetstream.googleLogins.createDomain({ /* … */ });
await meetstream.googleLogins.create({ /* … */ });

await meetstream.zoom.authorizeUrl();
await meetstream.zoom.listConnections();

await meetstream.storage.set({ provider: 'aws', bucket_name, region, access_key_id, secret_key });
```

</details>

## Webhooks

Verify before you trust. Pass the **raw** body — re-serializing a parsed object changes key order and the signature will never match.

```ts
import express from 'express';
import { parseWebhook, isTerminal, describeStop } from '@meetstream/sdk';

app.post('/webhook', express.raw({ type: 'application/json' }), (req, res) => {
  let event;
  try {
    event = parseWebhook(req.body, req.header('x-meetstream-signature')!, process.env.WEBHOOK_SECRET!);
  } catch {
    return res.sendStatus(401);
  }

  if (isTerminal(event)) console.log(describeStop(event));
  res.sendStatus(200);   // ack fast, process async
});
```

**`bot.stopped` is the single terminal event** and always carries `status_code: 200` — the reason lives in `bot_status` (`Stopped`, `NotAllowed`, `Denied`, `Error`). `bot.error` is *not* terminal; the bot keeps running. Streaming-only providers stop at `audio.processed` and never emit `bot.done`.

## Errors

```ts
import { NotReadyError, RateLimitError, BadRequestError, MeetStreamError } from '@meetstream/sdk';

try {
  await meetstream.transcripts.get(id);
} catch (err) {
  if (err instanceof NotReadyError) { /* 202 - poll again */ }
  else if (err instanceof RateLimitError) { await sleep(err.retryAfter! * 1000); }
  else if (err instanceof BadRequestError) { console.error(err.message); } // the API's own message
  else if (err instanceof MeetStreamError) { console.error(err.status, err.requestId); }
}
```

`AuthenticationError` (401) means the header never arrived. `PermissionError` (403) means the key itself was rejected. That distinction saves a lot of debugging.

## Configuration

```ts
const meetstream = new MeetStream({
  apiKey: process.env.MEETSTREAM_API_KEY,
  baseUrl: 'https://api.meetstream.ai/api/v1',
  timeout: 60_000,
  maxRetries: 2,          // 429 and 5xx, exponential backoff, honours Retry-After
  defaultHeaders: {},
  fetch: customFetch,     // testing, proxies, instrumentation
});
```

| Variable | Purpose |
|---|---|
| `MEETSTREAM_API_KEY` | Your key. Required unless passed explicitly |
| `MEETSTREAM_API_URL` | Override the API base |

Anything not yet wrapped is reachable through the raw transport:

```ts
await meetstream.http.get('/some/new/endpoint');
```

## Also available

| | What | Where |
|:--:|---|---|
| 🔌 | **MCP server** — 19 tools for any MCP client | [`@meetstream/mcp`](https://www.npmjs.com/package/@meetstream/mcp) |
| ⌨️ | **CLI** | [`@meetstream/cli`](https://www.npmjs.com/package/@meetstream/cli) |
| 🤖 | **Claude Code plugin** | [claude-plugin](https://github.com/meetstream-ai/claude-plugin) |
| ✳️ | **Cursor plugin** | [meetstream-cursor-plugin](https://github.com/meetstream-ai/meetstream-cursor-plugin) |
| 🧪 | **Labs** — runnable templates | [labs](https://github.com/meetstream-ai/labs) |

## Links

[Documentation](https://docs.meetstream.ai) · [API reference](https://docs.meetstream.ai/api-reference/introduction) · [Errors](https://docs.meetstream.ai/errors) · [Webhooks](https://docs.meetstream.ai/guides/webhooks/webhooks-and-events) · [MIA](https://docs.meetstream.ai/guides/mia/create-mia) · [support@meetstream.ai](mailto:support@meetstream.ai)

MIT licensed.
