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
| **Streaming-only providers return `202` forever** - no post-call transcript ever exists | `waitFor()` is always bounded and tells you exactly why it gave up |
| **Transcripts are keyed by `transcript_id`**, not `bot_id` | `transcripts.get()` takes the right id, and the types say so |
| **Segments use `transcript`, not `text`** | Typed, so the wrong field is a compile error |
| **`remove_bot` is a `GET`** | `bots.remove()` handles it |
| **REST uses `Token`, the MCP server uses `Bearer`** | Correct scheme sent automatically |
| **MIA takes only `agent_config_id`** | Documented on the type; extra bridge fields are the usual cause of a silent agent |
| **Large speaker timelines come back as a download link**, not the timeline | `SpeakerTimeline` is a union; `isSpeakerTimelineDownload()` tells you which one you got |
| **`429` and in-progress `409` carry `Retry-After`** | Retried after the delay the API asked for; `err.retryAfter` has it when you handle it yourself |

## Typed end to end

Types ship with the package and mirror the wire format exactly, so what you write is what the API receives.

```ts
import type { CreateBotParams, WebhookPayload } from '@meetstream/sdk';

const params: CreateBotParams = {
  meeting_link: 'https://zoom.us/j/123',   // not meeting_url
  video_required: false,                   // audio only unless video was asked for (the API default; send it anyway)
  audio_separate_streams: true,            // per-participant audio tracks
  // With video on, pick the layout explicitly (the API defaults to grid_view):
  // video_required: true,
  // recording_config: { video_layout: 'speaker_view' },
  // video_separate_streams stays off unless per-participant video was asked for
  automatic_leave: {
    waiting_room_timeout: 300,
    in_call_recording_timeout: 900,        // minimum 600, below that the API 400s
  },
};
```

## What you can do

<details open>
<summary><b>Bots</b> - lifecycle, media, live interaction</summary>

```ts
await meetstream.bots.create(params, { idempotencyKey: uuid });
await meetstream.bots.list();
await meetstream.bots.status(botId);
await meetstream.bots.get(botId);          // full record, same as detail()
await meetstream.bots.detail(botId);       // includes transcript_id
await meetstream.bots.remove(botId);       // leave, keep the data
await meetstream.bots.stopStatus(botId);   // progress of that stop request
await meetstream.bots.deleteData(botId);   // irreversible

await meetstream.bots.audio(botId);
await meetstream.bots.video(botId);
await meetstream.bots.audioStreams(botId);      // per-participant audio
await meetstream.bots.recordingStreams(botId);  // per-participant video
await meetstream.bots.screenshots(botId, { limit: 25 });  // newest first, paged
await meetstream.bots.screenshot(botId, screenshotId);
await meetstream.bots.waitForAudio(botId);      // bounded

await meetstream.bots.participants(botId);
await meetstream.bots.chats(botId);
await meetstream.bots.speakerTimeline(botId);   // inline, or a download link for large meetings

await meetstream.bots.sendMessage(botId, 'Recording has started.');
await meetstream.bots.sendImage(botId, { img_url: 'https://…/slide.png', display_duration: 5 });
await meetstream.bots.pauseRecording(botId);    // privacy window
await meetstream.bots.resumeRecording(botId);
await meetstream.bots.raiseHand(botId);         // and lowerHand(botId)
await meetstream.bots.sendCommand(botId, { command: 'screenshot' });
await meetstream.bots.updateMia(botId, { system_prompt: '…', wait_for_ack: true });
```

</details>

<details open>
<summary><b>Transcripts</b></summary>

```ts
await meetstream.transcripts.get(transcriptId);
await meetstream.transcripts.getByBotId(botId);          // first transcript, no id lookup
await meetstream.transcripts.waitFor(transcriptId, { timeoutMs: 900_000 });
await meetstream.transcripts.listForBot(botId);
await meetstream.transcripts.transcribeBotAudio(botId);  // rescue a streaming-only bot
```

</details>

<details open>
<summary><b>Calendar</b> - auto-join and scheduling</summary>

```ts
await meetstream.calendar.connectGoogle({ google_client_id, google_client_secret, google_refresh_token });
await meetstream.calendar.connectOutlook({ /* … */ });
await meetstream.calendar.list();                         // calendars on every connected account
await meetstream.calendar.listConnections();
await meetstream.calendar.getConnection('google', 'ops@acme.com');
await meetstream.calendar.deleteConnection('google', 'ops@acme.com', { purge_events: false });
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
<summary><b>Integrations</b> - Google and Teams signed-in bots, authenticated Zoom joins, your own S3</summary>

```ts
await meetstream.googleLogins.createDomain({ /* … */ });
await meetstream.googleLogins.create({ /* … */ });

// Teams signed-in bots: one concurrent bot per Microsoft account; bot_name is not applied
await meetstream.teamsLogins.createDomain({ domain: 'bots.acme.com', name: 'Acme bots', login_mode: 'always' });
await meetstream.teamsLogins.create({
  domain: 'bots.acme.com',
  email: 'bot1@bots.acme.com',
  password: process.env.TEAMS_BOT_PASSWORD, // write-only, never returned
});
await meetstream.bots.create({
  meeting_link: 'https://teams.microsoft.com/l/meetup-join/...',
  bot_name: 'Notetaker', // required, though the Microsoft account's own name is shown
  teams: { login_required: true, teams_login_domain: 'bots.acme.com' },
});

// Zoom with no setup: just the link. use_own_app: true requires your own Zoom app instead
await meetstream.bots.create({ meeting_link, bot_name: 'Notetaker', zoom: { use_own_app: false } });

// Authenticated Zoom joins (need your own Zoom app): each URL is an HTTPS endpoint on your server that returns a fresh token
await meetstream.bots.create({ meeting_link, bot_name: 'Notetaker', zoom: { zak_url: 'https://you.example.com/zoom/zak' } });
await meetstream.bots.create({ meeting_link, bot_name: 'Notetaker', zoom: { obf_url: 'https://you.example.com/zoom/obf' } });

await meetstream.storage.set({ provider: 'aws', bucket_name, region, access_key_id, secret_key });

// Pick one of the storage destinations saved in the dashboard for this bot
await meetstream.bots.create({ meeting_link, bot_name: 'Notetaker', storage_id: 'eu-archive' });
```

Teams setup (dedicated Microsoft 365 tenant, account requirements, errors): [Teams signed-in bots guide](https://docs.meetstream.ai/guides/app-integrations/teams-signed-in-bots).

</details>

## Webhooks

Verify before you trust. Pass the **raw** body - re-serializing a parsed object changes key order and the signature will never match.

```ts
import express from 'express';
import { parseWebhook, isTerminal, stopReason, describeStop } from '@meetstream/sdk';

app.post('/webhook', express.raw({ type: 'application/json' }), (req, res) => {
  let event;
  try {
    event = parseWebhook(req.body, req.header('x-meetstream-signature')!, process.env.WEBHOOK_SECRET!);
  } catch {
    return res.sendStatus(401);
  }

  if (isTerminal(event)) console.log(stopReason(event), describeStop(event));
  res.sendStatus(200);   // ack fast, process async
});
```

Participant events (`participant_events.join`, `leave`, `chat_message`, `raise_hand`, `lower_hand`) go only to the `recording_config.realtime_endpoints` entries that list them; type them with `ParticipantEventPayload`.

**Terminals are two-layer.** Every ending arrives once as `event: "bot.stopped"`, and `bot_event` says why: `bot.stopped`, `bot.kicked`, `bot.notallowed`, `bot.denied` or `bot.failed`. Not admitted, denied and failed carry `status_code: 500`. `stopReason(event)` reads it for you (a kick and a clean exit both report `bot_status: "Stopped"`, so don't branch on that). On `bot.failed`, `failure_reason` (for example `meeting_restricted` or `sign_in_required`) says why the meeting blocked the join, and `describeStop()` explains it. `bot.error` is *not* terminal; the bot keeps running. `bot.done` is the final event on every path, streaming-only bots included. Every event carries a `timestamp`.

## Errors

```ts
import { NotReadyError, RateLimitError, BadRequestError, MeetStreamError } from '@meetstream/sdk';

try {
  await meetstream.transcripts.get(id);
} catch (err) {
  if (err instanceof NotReadyError) { /* 202 - poll again */ }
  else if (err instanceof RateLimitError) { await sleep((err.retryAfter ?? 5) * 1000); } // also err.limit, err.window
  else if (err instanceof BadRequestError) { console.error(err.message, err.code); } // the API's own message and code
  else if (err instanceof MeetStreamError) { console.error(err.status, err.requestId); }
}
```

`err.message` is the API's `message` field (older responses: `error`, or a bare string). `err.code` carries a machine-readable code when the API sent one, such as `rate_limit_exceeded` or `unsupported_on_whatsapp`.

`AuthenticationError` (401) means the header never arrived. `PermissionError` (403) means the key itself was rejected. That distinction saves a lot of debugging.

## Configuration

```ts
const meetstream = new MeetStream({
  apiKey: process.env.MEETSTREAM_API_KEY,
  baseUrl: 'https://api.meetstream.ai/api/v1',
  timeout: 60_000,
  maxRetries: 2,          // 429, 5xx and in-progress 409, exponential backoff, honours Retry-After
  defaultHeaders: {},
  fetch: customFetch,     // testing, proxies, instrumentation
});
```

A `Retry-After` longer than 60 seconds (for example a pay-as-you-go hourly create limit) is not waited out inside the call: the `RateLimitError` is thrown with `retryAfter` set, so you can schedule the retry.

| Variable | Purpose |
|---|---|
| `MEETSTREAM_API_KEY` | Your key. Required unless passed explicitly |
| `MEETSTREAM_API_URL` | Override the API base |

Anything not yet wrapped is reachable through the raw transport:

```ts
await meetstream.http.get('/some/new/endpoint');
```

## What's new in 1.3.0

- **Raise and lower hand.** `bots.raiseHand(botId)` / `bots.lowerHand(botId)` on Google Meet, Zoom and Teams. `hand_raised` in the response is the state the bot saw after acting.
- **`bots.sendCommand()`** for the full live-bot command set, typed per command: `raise_hand`, `lower_hand`, `sendmsg`, `sendchat`, `sendimg`, `sendimg_url`, `interrupt`, `screenshot`, `update_mia`, `pause_recording`, `resume_recording`.
- **`bots.updateMia()`** updates a running MIA agent; `wait_for_ack: true` returns the agent's result (`applied`, `partially_applied`, `failed`).
- **MIA with Claude:** `model: { provider: 'anthropic', model: 'claude-haiku-5-5' }` in pipeline mode, with `reasoning_effort` and `tool_choice` typed.
- **New create fields typed:** `zoom.use_own_app`, `bot_camera_stream`, `storage_id`, `initial_audio`, the `smallest` / `smallest_streaming` transcription providers, `grid_view_default` / `speaker_view_default` layouts (Google Meet and Teams), `realtime_endpoints` with participant hand events, and `recording_permission_denied_timeout` up to 600 seconds.
- **Speaker timeline download links:** `speakerTimeline()` returns a `SpeakerTimeline` union; `isSpeakerTimelineDownload()` detects the large-meeting shape.
- **Endpoints added:** `bots.get`, `bots.stopStatus`, `bots.screenshot`, `transcripts.getByBotId`, `googleLogins.get`, `calendar.listConnections`, `calendar.getConnection`, `calendar.deleteConnection`.
- **Fixed routes:** `bots.screenshots()` now calls `/screenshots` (with paging), `calendar.list()` calls `/calendar/calendars`, and `calendar.disconnect()` is a `DELETE`.
- **Errors:** `retryAfter` and `code` on every error, `limit` and `window` on `RateLimitError`. In-progress `409`s on create are retried with the same key.
- **Types:** more `BotStatus` values, `BotErrorReason`, `FailureReason`, `StopStatus`, and `failure_reason` / `no_audio_reason` on webhooks.
- **Deprecated:** `bots.summary()` and `calendar.toggleRecurrence()`. The API has no route for either.

## Also available

| | What | Where |
|:--:|---|---|
| 🔌 | **MCP server** - 19 tools for any MCP client, hosted: add the URL and sign in | [`https://mcp.meetstream.ai/mcp`](https://docs.meetstream.ai/build-with-ai/meetstream-mcp-server) |
| ⌨️ | **CLI** | [`@meetstream/cli`](https://www.npmjs.com/package/@meetstream/cli) |
| 🤖 | **Claude Code plugin** | [claude-plugin](https://github.com/meetstream-ai/claude-plugin) |
| ✳️ | **Cursor plugin** | [meetstream-cursor-plugin](https://github.com/meetstream-ai/meetstream-cursor-plugin) |
| 🧪 | **Labs** - runnable templates | [labs](https://github.com/meetstream-ai/labs) |

## Links

[Documentation](https://docs.meetstream.ai) · [API reference](https://docs.meetstream.ai/api-reference/introduction) · [Errors](https://docs.meetstream.ai/errors) · [Webhooks](https://docs.meetstream.ai/guides/webhooks/webhooks-and-events) · [MIA](https://docs.meetstream.ai/guides/mia/create-an-agent) · [support@meetstream.ai](mailto:support@meetstream.ai)

MIT licensed.
