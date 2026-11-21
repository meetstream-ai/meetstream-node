<div align="center">

# MeetStream SDK for TypeScript

**Send AI bots into Zoom, Google Meet and Microsoft Teams.** Record, transcribe, summarize and stream meetings, and run [voice agents](#flow-2-agents-in-meetings-your-own-stack) that talk back.

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

## Three ways to integrate

Pick a flow before you write code. Guide: [Integration paths](https://docs.meetstream.ai/guides/introduction/integration-paths).

| Flow | What it is | Price per meeting hour |
|---|---|---|
| **1. Recording only** (Bot API) | Send a bot to Zoom, Google Meet or Microsoft Teams. Get recordings, transcripts, participants, chat and webhooks after the call, or live data during the call. Start here unless you want an agent in the meeting. | Bot price |
| **2. Agents in meetings, your own stack** (recommended first for an agent) | **2a. Bridge server:** the bot streams live audio to your server, and your server sends audio, chat and images back. You run your own speech-to-text, LLM and voice, hosted or local. **2b. Your own agent as the brain:** Claude Code, Codex, Hermes, OpenClaw and others answer through `model.provider: "local_agent"` and the Agent Kit. | 2a: bot price only. 2b: bot price + $0.25 agent infrastructure. MeetStream charges no model tokens in either. |
| **3. Managed agent infrastructure** (Agents API) | MeetStream hosts the voice agent (API name: MIA). **3a.** MeetStream's inbuilt keys. Inbuilt keys work in pipeline mode only: Deepgram (speech-to-text) and OpenAI (LLM and voice). Realtime mode runs on OpenAI and needs your own OpenAI key. Any other provider: bring your own key. **3b.** Your own provider keys. | Bot price + $0.25 agent infrastructure + the models you pick |

Bot price: $0.35 per recording hour ($0.25 at volume). The MeetStream transcription add-on is $0.10 per hour; it is waived when you use your own provider key. See [pricing](https://meetstream.ai/pricing).

Want an agent but not sure which flow? Run your own stack (flow 2, any models, local ones included), or let MeetStream host it (flow 3, no infrastructure work).

### Flow 1: Recording only (Bot API)

First decide: do you need notes **after the call** (post-call), or something **during the call** (live)?

**Post-call:** create a bot, wait for webhooks, then read the transcript, recordings and participants.

```ts
import { MeetStream } from '@meetstream/sdk';

const meetstream = new MeetStream(); // reads MEETSTREAM_API_KEY

// 1. Send the bot. Only meeting_link is required.
const bot = await meetstream.bots.create({
  meeting_link: 'https://meet.google.com/abc-defg-hij',
  bot_name: 'Notetaker',
  callback_url: 'https://you.example.com/webhook',   // 2. lifecycle webhooks
  recording_config: { transcript: { provider: { meetstream: { language: 'auto' } } } }, // no provider key needed
});

// 3. Bounded wait for the transcript (also stops at once if it failed).
const transcript = await meetstream.transcripts.waitFor(bot.transcript_id!);
const audio = await meetstream.bots.audio(bot.bot_id);
const people = await meetstream.bots.participants(bot.bot_id);
```

**Live:** use the live transcription webhook (`live_transcription_required` with a `*_streaming` provider), the real-time audio WebSocket (`live_audio_required`), the meeting control socket (`socket_connection_url`), chat (`bots.sendMessage`) and raise or lower hand (`bots.raiseHand` / `bots.lowerHand`, which is `POST /api/v1/bots/{bot_id}/send_command` with `{"command": "raise_hand"}`).

```ts
await meetstream.bots.create({
  meeting_link: 'https://zoom.us/j/123456789',
  recording_config: { transcript: { provider: { meetstream_streaming: { transcription_mode: 'sentence' } } } },
  live_transcription_required: { webhook_url: 'https://you.example.com/live' },
});
await meetstream.bots.raiseHand(botId); // the bot must be in the meeting (409 otherwise)
```

Get a key at [app.meetstream.ai/api-key](https://app.meetstream.ai/api-key).

### Flow 2: Agents in meetings, your own stack

#### 2a. Bridge server

The bot opens two WebSockets to your server: live meeting audio comes in on `live_audio_required`, and the meeting control socket (`socket_connection_url`) carries the audio, chat, images and interrupts that you send back. Your server runs the speech-to-text, LLM and voice, hosted or local (for example Parakeet for local speech-to-text, a local LLM and a local TTS). MeetStream charges the bot price only: no agent infrastructure and no model tokens.

```ts
await meetstream.bots.create({
  meeting_link: 'https://meet.google.com/abc-defg-hij',
  bot_name: 'Assistant',
  live_audio_required: { websocket_url: 'wss://your-bridge.example.com/bridge/audio' },  // audio in
  socket_connection_url: { websocket_url: 'wss://your-bridge.example.com/bridge' },      // audio, chat, images out
});
```

Starter: [MeetStream Bridge](https://github.com/meetstream-ai/meetstream-agent) (FastAPI, OpenAI Realtime by default; swap in your own or local models). Guides: [Bridge server architecture](https://docs.meetstream.ai/guides/websockets/bridge-server-architecture), [Real-time audio streaming](https://docs.meetstream.ai/guides/websockets/real-time-audio-streaming), [Meeting control patterns](https://docs.meetstream.ai/guides/websockets/meeting-control-patterns).

#### 2b. Your own agent as the brain (Agent Kit)

Your agent (Claude Code, Codex, Hermes, OpenClaw and others) runs on your computer or your own subscription and writes what the voice agent says. Run the [MeetStream Agent Kit](https://github.com/meetstream-ai/agent-kit) bridge (`meetstream-agent-kit` on PyPI), save an agent with `model.provider: "local_agent"`, then send a bot with its `agent_config_id`. Price: bot price + $0.25 agent infrastructure; MeetStream charges no model tokens for your agent's reasoning.

```ts
const mine = await meetstream.mia.create({
  agent_name: 'My Claude Code',
  mode: 'pipeline',
  transcriber: { provider: 'deepgram' },
  voice: { provider: 'openai', voice_id: 'coral' },
  model: {
    provider: 'local_agent',
    local_agent: { url: 'https://your-tunnel.example.com', access: 'readonly', require_code: true },
  },
});
const check = await meetstream.mia.checkLocalAgent(mine.agent_config_id);
if (check.local_agent.status !== 'ok') throw new Error(`Bridge not ready: ${check.local_agent.status}`);
await meetstream.bots.create({ meeting_link, agent_config_id: mine.agent_config_id });
```

Flow 2b is opt-in and needs the local agent feature on for your account. Meeting speech reaches an agent that has access to your computer and terminal, so a participant can try prompt injection: keep the lowest access level (`readonly` is the default) and the activation code on. Your computer, your agent and the bridge must stay on for the whole call. Guide: [MIA screen sharing and custom agents](https://docs.meetstream.ai/guides/features/mia-screen-sharing-and-custom-agents).

### Flow 3: Managed agent infrastructure (Agents API)

MeetStream hosts the voice agent (API name: MIA). 1. Save an agent config. 2. Send a bot with its `agent_config_id`. Nothing else is needed on the bot.

```ts
const agent = await meetstream.mia.create({
  agent_name: 'Meeting assistant',
  mode: 'pipeline',
  transcriber: { provider: 'deepgram', model: 'nova-3', key_source: 'meetstream' },
  model: { provider: 'openai', model: 'gpt-4.1', key_source: 'meetstream',
           system_prompt: 'You are a helpful meeting assistant. Keep answers short.',
           first_message: "Hi, I'm an AI assistant on this call." },
  voice: { provider: 'openai', voice_id: 'coral', key_source: 'meetstream' },
});

await meetstream.bots.create({ meeting_link, agent_config_id: agent.agent_config_id });
```

- **3a. MeetStream's inbuilt keys.** Set `key_source: "meetstream"` on each pipeline section (`transcriber`, `model`, `voice`), with no `api_key`. Pipeline mode only. Inbuilt keys work in pipeline mode only: Deepgram (speech-to-text) and OpenAI (LLM and voice). Realtime mode runs on OpenAI and needs your own OpenAI key. Any other provider: bring your own key.
- **3b. Your own keys.** Add your provider keys (OpenAI, Anthropic, Deepgram, ElevenLabs and others in the docs) under Integrations, and pick any supported model. Use `key_source: "user"` or leave it out. Your provider bills you for model usage.
- **Price:** bot price + $0.25 agent infrastructure + the per-hour price of each model you pick (with 3b, your provider bills the models). The dashboard agent editor shows the rate before the bot runs. See [Voice agent pricing and keys](https://docs.meetstream.ai/guides/mia/pricing-and-keys) and the [MIA API guide](https://docs.meetstream.ai/guides/mia/mia-api-guide).

If inbuilt keys are not on for your account yet, the API answers `400` with `MeetStream-managed keys are not available for <section>. Use your own key.` Check with `isInbuiltKeysUnavailable(err)`, then use your own key for that section (3b). Do not retry the same request.

A MIA bot takes only `agent_config_id`. Never add `live_audio_required` or `socket_connection_url` to it: that is the usual cause of a silent agent. Flows 2a and 3 are separate bots.

## Why this SDK

The MeetStream API has a handful of behaviours that look like bugs until you know them. This SDK encodes all of them so you do not have to rediscover them in production.

| The trap | What the SDK does |
|---|---|
| **`202` sits inside the 2xx range** and means "not ready yet", not success | Raises `NotReadyError` instead of handing you an empty body |
| **`507` looks like a failure** but is an idempotent replay | Resolves as success, returning the original resource |
| **Streaming-only providers return `202` forever** - no post-call transcript ever exists | `waitFor()` is always bounded and tells you exactly why it gave up |
| **Transcripts are keyed by `transcript_id`**, not `bot_id` | `transcripts.get()` takes the right id, and the types say so |
| **Speaker is `participant.name`, text is `words[].text`** | Typed as `TranscriptSegment`; `segmentSpeaker()` / `segmentText()` read it (and the flat `speaker` / `transcript` shape) |
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

Each segment names the speaker in `participant.name` and holds the text in `words[].text`:

```ts
import { segmentSpeaker, segmentText, type TranscriptSegment } from '@meetstream/sdk';

const segments = (await meetstream.transcripts.get(transcriptId)) as TranscriptSegment[];
for (const s of segments) console.log(`${segmentSpeaker(s)}: ${segmentText(s)}`);
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
<summary><b>Agents API (MIA voice agents)</b></summary>

```ts
await meetstream.mia.create(config);                 // returns agent_config_id
await meetstream.mia.get(agentConfigId);
await meetstream.mia.list();
await meetstream.mia.update({ agent_config_id, agent: { chat_input: true } }); // PUT: send whole blocks
await meetstream.mia.delete(agentConfigId);
await meetstream.mia.checkLocalAgent(agentConfigId); // local_agent bridge: { local_agent: { status: 'ok', ... } }

// Attach with ONE field. Adding socket_connection_url or live_audio_required
// alongside is the usual cause of a silent agent.
await meetstream.bots.create({ meeting_link, agent_config_id, agent_config_params: { customer: 'Ana' } });

// Change a running agent. The saved config does not change.
await meetstream.mia.updateLive(botId, { system_prompt: '…', wait_for_ack: true }); // same as bots.updateMia
```

Agent options from API v1.10.0:

```ts
await meetstream.mia.create({
  agent_name: 'Presenter',
  mode: 'pipeline',
  transcriber: { provider: 'deepgram', language: 'es' },   // honoured; unset, 'multi' or 'auto' = detect
  model:       { provider: 'openai', model: 'gpt-4.1' },   // a vision-capable model for 'screen'
  voice:       { provider: 'openai', voice_id: 'coral' },
  agent: {
    tools: ['screen'],             // Google Meet: present and work a live web page
    chat_input: true,              // chat messages that name the agent are requests
    quiet_actions: true,           // act without talking through each step
    speak_only_when_asked: true,   // speak only when addressed by name
  },
});
```

Your own agent (flow 2b) is set up in [Flow 2b](#2b-your-own-agent-as-the-brain-agent-kit) above.

`boostwords` on the transcriber fixes most "it mishears our company name" complaints, and `mcp_servers` is what turns a talking bot into one that can do work mid-call.

</details>

<details open>
<summary><b>Billing</b></summary>

```ts
import { BalanceUnavailableError } from '@meetstream/sdk';

try {
  const { balance_usd, customer_type } = await meetstream.billing.balance(); // GET /billing/balance, read only
  // balance_usd is a decimal string such as "12.34", or null for accounts billed by invoice.
} catch (err) {
  if (err instanceof BalanceUnavailableError) console.log(`See your balance at ${err.billingUrl}`);
}
```

The balance endpoint is available when it is on for your account. Until then it answers `404`, which the SDK raises as `BalanceUnavailableError` (not retried).

Top up at [app.meetstream.ai/billing](https://app.meetstream.ai/billing). A create with low credits returns `403` `Low credits please recharge`; do not retry it in a loop.

</details>

<details>
<summary><b>Zoom Meeting Direct Connect</b> - record Zoom with no bot in the meeting</summary>

```ts
const session = await meetstream.meetingDirectConnect.create({ zoom_rtms: { meeting_uuid, rtms_stream_id, server_urls, signature } });
await meetstream.meetingDirectConnect.get(botId);
await meetstream.meetingDirectConnect.leave(botId);
```

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

// Zoom: bots join through your Zoom app (Meeting SDK) with an OBF token (on behalf of a user in the meeting)
// or a ZAK token (signed-in bot), the way Zoom asks Meeting SDK apps to join since 2 March 2026.
// Each URL is an HTTPS endpoint on your server that returns a fresh token.
await meetstream.bots.create({ meeting_link, bot_name: 'Notetaker', zoom: { zak_url: 'https://you.example.com/zoom/zak' } });
await meetstream.bots.create({ meeting_link, bot_name: 'Notetaker', zoom: { obf_url: 'https://you.example.com/zoom/obf' } });

await meetstream.storage.set({ provider: 'aws', bucket_name, region, access_key_id, secret_key });

// Pick one of the storage destinations saved in the dashboard for this bot
await meetstream.bots.create({ meeting_link, bot_name: 'Notetaker', storage_id: 'eu-archive' });
```

Teams setup (dedicated Microsoft 365 tenant, account requirements, errors): [Teams signed-in bots guide](https://docs.meetstream.ai/guides/app-integrations/teams-signed-in-bots).

Zoom setup: [Zoom Marketplace app setup](https://docs.meetstream.ai/guides/app-integrations/zoom-marketplace-app-setup) · [Zoom authenticated bots (ZAK and OBF)](https://docs.meetstream.ai/guides/app-integrations/zoom-authenticated-bots).

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
import { NotReadyError, TranscriptFailedError, RateLimitError, BadRequestError, MeetStreamError } from '@meetstream/sdk';

try {
  await meetstream.transcripts.get(id);
} catch (err) {
  if (err instanceof NotReadyError) { /* 202 - poll again */ }
  else if (err instanceof TranscriptFailedError) { console.error(err.status, err.transcriptStatus, err.reason); } // 422: final, fix the cause, then transcribeBotAudio()
  else if (err instanceof RateLimitError) { await sleep((err.retryAfter ?? 5) * 1000); } // also err.limit, err.window
  else if (err instanceof BadRequestError) { console.error(err.message, err.code); } // the API's own message and code
  else if (err instanceof MeetStreamError) { console.error(err.status, err.requestId); }
}
```

`err.message` is the API's `message` field (older responses: `error`, or a bare string). `err.code` carries a machine-readable code when the API sent one, such as `rate_limit_exceeded` or `unsupported_on_whatsapp`.

`TranscriptFailedError` (422) means the transcript failed and will not become ready, for example because the provider rejected the API key or a usage limit was reached. It is not retried. Fix the cause, then call `transcripts.transcribeBotAudio(botId)`.

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

## What's new in 1.4.0

- **Agents API:** `mia.get`, `mia.checkLocalAgent`, `mia.updateLive` (with `wait_for_ack`), typed responses.
- **Keys:** `key_source: "meetstream" | "user"` on `transcriber`, `model` and `voice`, and `isInbuiltKeysUnavailable(err)`.
- **Your own agent:** `model.provider: "local_agent"` with a typed `model.local_agent` block.
- **API v1.10.0 agent options:** `agent.tools` (`screen`), `agent.chat_input`, `agent.quiet_actions`, `agent.speak_only_when_asked`, `agent.desktop`, and `transcriber.language`.
- **Failed transcripts:** a `422` from `get_transcript` is a `TranscriptFailedError` with `status`, `transcriptStatus` and `reason`.
- **Billing:** `billing.balance()` for `GET /billing/balance`, available when the endpoint is on for your account; a `404` is a `BalanceUnavailableError` that points to the billing page.
- **Zoom Meeting Direct Connect:** `meetingDirectConnect.create`, `get`, `leave`.

Full history: [CHANGELOG.md](CHANGELOG.md).

## Also available

| | What | Where |
|:--:|---|---|
| 🔌 | **MCP server** - 19 tools for any MCP client, hosted: add the URL and sign in | [`https://mcp.meetstream.ai/mcp`](https://docs.meetstream.ai/build-with-ai/meetstream-mcp-server) |
| ⌨️ | **CLI** | [`@meetstream/cli`](https://www.npmjs.com/package/@meetstream/cli) |
| 🤖 | **Claude Code plugin** | [claude-plugin](https://github.com/meetstream-ai/claude-plugin) |
| ✳️ | **Cursor plugin** | [meetstream-cursor-plugin](https://github.com/meetstream-ai/meetstream-cursor-plugin) |
| 🧪 | **Labs** - runnable templates | [labs](https://github.com/meetstream-ai/labs) |

## Latest docs

- [Integration paths](https://docs.meetstream.ai/guides/introduction/integration-paths): recording only, your own stack (bridge or your own agent), managed agents
- [Bridge server architecture](https://docs.meetstream.ai/guides/websockets/bridge-server-architecture) · [Real-time audio streaming](https://docs.meetstream.ai/guides/websockets/real-time-audio-streaming) · [Meeting control patterns](https://docs.meetstream.ai/guides/websockets/meeting-control-patterns)
- [Create your first bot](https://docs.meetstream.ai/guides/get-started/create-your-first-bot) · [Create Bot payload reference](https://docs.meetstream.ai/api-reference/create-bot-payload-reference)
- [Webhooks and events](https://docs.meetstream.ai/guides/webhooks/webhooks-and-events) · [Errors](https://docs.meetstream.ai/errors)
- [MIA API guide](https://docs.meetstream.ai/guides/mia/mia-api-guide) · [Voice agent pricing and keys](https://docs.meetstream.ai/guides/mia/pricing-and-keys) · [MIA screen sharing and custom agents](https://docs.meetstream.ai/guides/features/mia-screen-sharing-and-custom-agents)
- [SDKs](https://docs.meetstream.ai/build-with-ai/sdks) · [OpenAPI](https://docs.meetstream.ai/openapi.json)

For the latest details, fetch the page with `.md` appended, read https://docs.meetstream.ai/llms.txt, or connect the docs MCP server at https://docs.meetstream.ai/_mcp/server. If this README and the docs differ, the docs are correct.

Support: [support@meetstream.ai](mailto:support@meetstream.ai). MIT licensed.
