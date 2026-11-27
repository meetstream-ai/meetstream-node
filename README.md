<div align="center">

# MeetStream SDK for TypeScript

**Send AI bots into Zoom, Google Meet and Microsoft Teams.** Record, transcribe, summarize and stream meetings, and run [voice agents](#build-tracks) that talk back.

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

## Build tracks

Pick a track before you write code. Guide: [Integration paths](https://docs.meetstream.ai/guides/introduction/integration-paths).

| Track | What it is | Price per meeting hour |
|---|---|---|
| **1. Recording bot** | The bot joins Zoom, Google Meet or Microsoft Teams, records and transcribes. **1a. Non-realtime (post-call):** wait for the bot to finish, then get the transcript, recordings and participants; webhooks tell you when. **1b. Real-time (live):** live transcription webhook, real-time audio WebSocket, meeting control socket, chat, raise or lower hand. Start here unless you want an agent in the meeting. | Bot price |
| **2. Bridge server** (your own stack, local) | The bot connects out to your server over two WebSockets: meeting audio in, and audio, chat and images out. You run your own speech-to-text, LLM and text-to-speech, free local models included. | Bot price only |
| **3. Agents API infra** (hosted by MeetStream) | MeetStream hosts the voice agent (API name: MIA). **3a.** MeetStream's own, default keys. **3b.** Bring your own agent infra (LiveKit): coming soon. **3c.** Bring your own keys. **3d.** Local agent (your own agent CLI): coming soon. | Bot price + $0.25 agent infrastructure + the models you pick |

Bot price: $0.35 per recording hour ($0.25 at volume). The MeetStream transcription add-on is $0.10 per hour; it is waived when you use your own provider key. See [pricing](https://meetstream.ai/pricing).

Want an agent but not sure which track? Run your own stack (track 2, any models, local ones included), or let MeetStream host it (track 3a or 3c, no infrastructure work).

### Track 1: Recording bot

First decide: do you need the transcript **after the call** (1a), or something **during the call** (1b)?

**1a. Non-realtime transcription (post-call):** create a bot, wait for webhooks, then read the transcript, recordings and participants.

```ts
import { MeetStream } from '@meetstream/sdk';

const meetstream = new MeetStream(); // reads MEETSTREAM_API_KEY

// 1. Send the bot. Only meeting_link is required.
const bot = await meetstream.bots.create({
  meeting_link: 'https://meet.google.com/abc-defg-hij',
  bot_name: 'Notetaker',
  callback_url: `https://you.example.com/webhook?token=${process.env.MEETSTREAM_WEBHOOK_SECRET}`, // 2. lifecycle webhooks (unsigned: check the token)
  recording_config: { transcript: { provider: { meetstream: { language: 'auto' } } } }, // no provider key needed
});

// 3. Bounded wait for the transcript (also stops at once if it failed).
const transcript = await meetstream.transcripts.waitFor(bot.transcript_id!);
const audio = await meetstream.bots.audio(bot.bot_id);
const people = await meetstream.bots.participants(bot.bot_id);
```

**1b. Real-time transcription (live):** use the live transcription webhook (`live_transcription_required` with a `*_streaming` provider), the real-time audio WebSocket (`live_audio_required`), the meeting control socket (`socket_connection_url`), chat (`bots.sendMessage`) and raise or lower hand (`bots.raiseHand` / `bots.lowerHand`, which is `POST /api/v1/bots/{bot_id}/send_command` with `{"command": "raise_hand"}`).

```ts
await meetstream.bots.create({
  meeting_link: 'https://zoom.us/j/123456789',
  recording_config: { transcript: { provider: { meetstream_streaming: { transcription_mode: 'sentence' } } } },
  live_transcription_required: { webhook_url: 'https://you.example.com/live' },
});
await meetstream.bots.raiseHand(botId); // the bot must be in the meeting (409 otherwise)
```

`transcription_mode` on a `*_streaming` provider is `raw` (the default: interim POSTs with `is_final: false`, then the final one), `sentence` (finals only) or `word_level` (one word per POST). Type the POST body with `LiveTranscriptPayload` and keep only final text with `isFinalSegment(payload)`. `meeting_captions` sends `LiveCaptionPayload` (`{ type: 'caption', bot_id, caption: { text, speakerName } }`) instead. Live transcript POSTs are not signed: protect the URL with a token (see [Webhooks](#webhooks)).

Get a key at [app.meetstream.ai/api-key](https://app.meetstream.ai/api-key).

### Track 2: Bridge server (your own stack, local)

The bot opens two WebSockets to your server: live meeting audio comes in on `live_audio_required.websocket_url`, and the meeting control socket (`socket_connection_url.websocket_url`) carries the audio, chat, images and interrupts that you send back. Your server runs the speech-to-text, LLM and text-to-speech. MeetStream charges the bot price only: no agent infrastructure and no model tokens. To run the bridge on a laptop, expose it with a local tunnel (for example ngrok or cloudflared) and use the tunnel's `wss://` URL.

```ts
await meetstream.bots.create({
  meeting_link: 'https://meet.google.com/abc-defg-hij',
  bot_name: 'Assistant',
  live_audio_required: { websocket_url: 'wss://your-tunnel.example.com/bridge/audio' },  // audio in
  socket_connection_url: { websocket_url: 'wss://your-tunnel.example.com/bridge' },      // audio, chat, images out
});
```

Models you can use (free to run locally; check each model's license before commercial use):

- Speech-to-text: whisper.cpp or faster-whisper (Whisper models), NVIDIA Parakeet (parakeet-mlx on Apple silicon), Vosk, Moonshine.
- LLM: a local model through Ollama, LM Studio or llama.cpp (Llama, Qwen, Gemma, Mistral), or the model of the harness you already use.
- Text-to-speech: Piper, Kokoro, Chatterbox, macOS `say`.

Starter: [MeetStream Bridge](https://github.com/meetstream-ai/meetstream-agent) (FastAPI, OpenAI Realtime by default; swap in local models). Guides: [Bridge server architecture](https://docs.meetstream.ai/guides/websockets/bridge-server-architecture), [Real-time audio streaming](https://docs.meetstream.ai/guides/websockets/real-time-audio-streaming), [Meeting control patterns](https://docs.meetstream.ai/guides/websockets/meeting-control-patterns).

### Track 3: Agents API infra (hosted by MeetStream)

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

- **3a. MeetStream's own, default keys.** Set `key_source: "meetstream"` on each pipeline section (`transcriber`, `model`, `voice`), with no `api_key`. Inbuilt keys work in pipeline mode only: Deepgram (speech-to-text) and OpenAI (LLM and voice). Realtime mode runs on OpenAI and needs your own OpenAI key. Any other provider: bring your own key (3c). The easiest choice if you want MeetStream to host everything.
- **3b. Bring your own agent infra (LiveKit).** Coming soon. Not available yet.
- **3c. Bring your own keys.** Add your provider keys (OpenAI, Anthropic, Deepgram, ElevenLabs and others in the docs) under Integrations, and pick any supported model. Use `key_source: "user"` or leave it out. Your provider bills you for model usage.
- **3d. Local agent (your own agent CLI).** Coming soon. Not available in production yet. Your own agent (for example Claude Code, Codex or Hermes) will write what the voice agent says, through `meetstream setup` and `meetstream agent serve` over the MeetStream relay (no tunnel) and `model.provider: "local_agent"`. When it ships, meeting speech will reach an agent that has access to your computer and terminal, so a participant can try prompt injection: use the lowest access level.
- **Price:** bot price + $0.25 agent infrastructure + the per-hour price of each model you pick (with 3c, your provider bills the models). The dashboard agent editor shows the rate before the bot runs. See [Voice agent pricing and keys](https://docs.meetstream.ai/guides/mia/pricing-and-keys) and the [MIA API guide](https://docs.meetstream.ai/guides/mia/mia-api-guide).

If inbuilt keys are not on for your account yet, the API answers `400` with `MeetStream-managed keys are not available for <section>. Use your own key.` Check with `isInbuiltKeysUnavailable(err)`, then use your own key for that section (3c). Do not retry the same request.

A hosted agent bot takes only `agent_config_id`. Never add `live_audio_required` or `socket_connection_url` to it: that is the usual cause of a silent agent. A bridge server (track 2) is a separate bot.

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
await meetstream.mia.checkLocalAgent(agentConfigId); // track 3d (local agent), coming soon in production

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

The local agent (track 3d, `model.provider: "local_agent"`) is coming soon in production; see [Track 3](#track-3-agents-api-infra-hosted-by-meetstream).

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

**Only workspace webhook endpoints are signed.** They carry `X-MeetStream-Signature: sha256=<hex HMAC-SHA256 of the raw body>` and `X-MeetStream-Timestamp` (an ISO 8601 UTC string, for example `2026-11-19T14:30:00Z`). Per-bot `callback_url` deliveries and live transcript POSTs (`live_transcription_required.webhook_url`) are **never signed**. Do not run `parseWebhook` on them: it rejects every delivery.

**Per-bot `callback_url` and live URLs: put a secret token in the URL.**

```ts
import { timingSafeEqual } from 'node:crypto';

const SECRET = process.env.MEETSTREAM_WEBHOOK_SECRET!;
// bots.create({ ..., callback_url: `https://you.example.com/webhook?token=${SECRET}` })

app.post('/webhook', express.json(), (req, res) => {
  const token = Buffer.from(String(req.query.token ?? ''));
  if (token.length !== SECRET.length || !timingSafeEqual(token, Buffer.from(SECRET))) return res.sendStatus(401);
  // handle req.body
  res.sendStatus(200);
});
```

**Workspace webhook endpoints: verify the signature.** Pass the **raw** body - re-serializing a parsed object changes key order and the signature will never match.

```ts
import express from 'express';
import { parseWebhook, isTerminal, stopReason, describeStop } from '@meetstream/sdk';

app.post('/webhook', express.raw({ type: 'application/json' }), (req, res) => {
  let event;
  try {
    event = parseWebhook(req.body, req.header('x-meetstream-signature')!, process.env.WEBHOOK_SECRET!, {
      timestamp: req.header('x-meetstream-timestamp'), // must match the signed body's timestamp
      toleranceSeconds: 300,                            // optional replay window, off when not set
    });
  } catch {
    return res.sendStatus(401);
  }

  if (isTerminal(event)) console.log(stopReason(event), describeStop(event));
  res.sendStatus(200);   // ack fast, process async
});
```

Replay protection relies on the `timestamp` field inside the signed body: the HMAC covers the body, not the `X-MeetStream-Timestamp` header. With `toleranceSeconds` set, the delivery is rejected when the body's `timestamp` is missing or outside the window, or when the header is sent and does not match it.

Participant events (`participant_events.join`, `leave`, `chat_message`, `raise_hand`, `lower_hand`) go only to the `recording_config.realtime_endpoints` entries that list them; type them with `ParticipantEventPayload`. `handEvent(event)` returns `'raise_hand'`, `'lower_hand'` or `null`.

**Terminals are two-layer.** Every ending arrives once as `event: "bot.stopped"`, and `bot_event` says why: `bot.stopped`, `bot.kicked`, `bot.notallowed`, `bot.denied` or `bot.failed`. Not admitted, denied and failed carry `status_code: 500`. `stopReason(event)` reads it for you (a kick and a clean exit both report `bot_status: "Stopped"`, so don't branch on that). On `bot.failed`, `failure_reason` (for example `meeting_restricted` or `sign_in_required`) says why the meeting blocked the join, and `describeStop()` explains it. `bot.error` is *not* terminal; the bot keeps running. `bot.done` is the final event on every path, streaming-only bots included. Every event carries a `timestamp`.

### MIA custom functions

A MIA agent calls each `agent.custom_functions` entry (type it with `CustomFunction`) with the body `{ name, bot: { bot_id, dynamic_vars, agent_id?, speaker? }, args }` and the `X-Bot-ID` header (`X-Agent-ID` when known). With `payload_args_only: true` the body is only `args`. `parseCustomFunctionCall` reads the shape you state (envelope by default; pass `{ payloadArgsOnly: true }` for an args-only function). It never guesses the shape from the body: arguments come from the model and could imitate an envelope. `botId` comes from the `X-Bot-ID` header first, and from `bot.bot_id` only in envelope mode when the header is missing.

```ts
import { parseCustomFunctionCall } from '@meetstream/sdk';

app.post('/tools/lookup-order', express.json(), (req, res) => {
  const { name, botId, args } = parseCustomFunctionCall(req.body, req.headers);
  res.json({ status: 'shipped', order_id: args.order_id });
});
```

**Every field, `X-Bot-ID` included, is unauthenticated.** These calls are not signed. Put a secret token in the function's `headers` (for example `{ "Authorization": "Bearer <your secret>" }`) and check it in your endpoint before you trust the call.

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
- **Local agent (track 3d, coming soon in production):** `model.provider: "local_agent"` with a typed `model.local_agent` block.
- **API v1.10.0 agent options:** `agent.tools` (`screen`), `agent.chat_input`, `agent.quiet_actions`, `agent.speak_only_when_asked`, `agent.desktop`, and `transcriber.language`.
- **Failed transcripts:** a `422` from `get_transcript` is a `TranscriptFailedError` with `status`, `transcriptStatus` and `reason`.
- **Billing:** `billing.balance()` for `GET /billing/balance`, available when the endpoint is on for your account; a `404` is a `BalanceUnavailableError` that points to the billing page.
- **Zoom Meeting Direct Connect:** `meetingDirectConnect.create`, `get`, `leave`.

Full history: [CHANGELOG.md](CHANGELOG.md).

## Also available

| | What | Where |
|:--:|---|---|
| 🔌 | **MCP server** - 19 tools for any MCP client, hosted: add the URL and sign in | [`https://mcp.meetstream.ai/mcp`](https://docs.meetstream.ai/build-with-ai/meetstream-mcp-server) |
| ⌨️ | **CLI** - `meetstream`, one binary: `npm install -g @meetstream/cli`, `pipx install meetstream-cli` or `brew install meetstream-ai/tap/meetstream`; agents call `meetstream <command> --json --no-input` | [meetstream-ai/cli](https://github.com/meetstream-ai/cli) |
| 🤖 | **Claude Code plugin** | [claude-plugin](https://github.com/meetstream-ai/claude-plugin) |
| ✳️ | **Cursor plugin** | [meetstream-cursor-plugin](https://github.com/meetstream-ai/meetstream-cursor-plugin) |
| 🧪 | **Labs** - runnable templates | [labs](https://github.com/meetstream-ai/labs) |

## Latest docs

- [Integration paths](https://docs.meetstream.ai/guides/introduction/integration-paths): recording bot, bridge server, Agents API infra
- [Bridge server architecture](https://docs.meetstream.ai/guides/websockets/bridge-server-architecture) · [Real-time audio streaming](https://docs.meetstream.ai/guides/websockets/real-time-audio-streaming) · [Meeting control patterns](https://docs.meetstream.ai/guides/websockets/meeting-control-patterns)
- [Create your first bot](https://docs.meetstream.ai/guides/get-started/create-your-first-bot) · [Create Bot payload reference](https://docs.meetstream.ai/api-reference/create-bot-payload-reference)
- [Webhooks and events](https://docs.meetstream.ai/guides/webhooks/webhooks-and-events) · [Errors](https://docs.meetstream.ai/errors)
- [MIA API guide](https://docs.meetstream.ai/guides/mia/mia-api-guide) · [Voice agent pricing and keys](https://docs.meetstream.ai/guides/mia/pricing-and-keys) · [MIA screen sharing and custom agents](https://docs.meetstream.ai/guides/features/mia-screen-sharing-and-custom-agents)
- [SDKs](https://docs.meetstream.ai/build-with-ai/sdks) · [OpenAPI](https://docs.meetstream.ai/openapi.json)

For the latest details, fetch the page with `.md` appended, read https://docs.meetstream.ai/llms.txt, or connect the docs MCP server at https://docs.meetstream.ai/_mcp/server. If this README and the docs differ, the docs are correct.

Support: [support@meetstream.ai](mailto:support@meetstream.ai). MIT licensed.
