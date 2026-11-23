# Changelog

All notable changes to `@meetstream/sdk`.

## 1.4.3 (2026-11-23)

### Changed

- README and AGENTS.md point to the new `meetstream` CLI (one binary from github.com/meetstream-ai/cli; install with `npm install -g @meetstream/cli`, `pipx install meetstream-cli` or `brew install meetstream-ai/tap/meetstream`). Track 3d (coming soon) now names `meetstream setup` and `meetstream agent serve` over the MeetStream relay instead of the Agent Kit. No code change.

## 1.4.2 (2026-11-22)

### Changed

- README and AGENTS.md use the build tracks: 1. recording bot (1a post-call, 1b live), 2. bridge server (your own stack, local, with free local speech-to-text, LLM and text-to-speech options and a tunnel note), 3. Agents API infra (3a MeetStream's own default keys, 3b bring your own agent infra with LiveKit: coming soon, 3c bring your own keys, 3d local agent: coming soon). The local agent (`model.provider: "local_agent"`, Agent Kit) is no longer shown as available, and the README has no setup steps for it. No code change.

## 1.4.1 (2026-11-21)

### Fixed

- Transcript shape. `get_transcript` segments name the speaker in `participant.name` and hold the text in `words[].text`; the docs said `speaker` / `transcript`. `TranscriptSegment` now types these fields. New `TranscriptWord`, `TranscriptParticipant` and `TranscriptTimestamp` types; `transcripts.get()` / `getByBotId()` are typed as a segment list. New `segmentSpeaker()`, `segmentText()` and `segmentStart()` helpers read this shape and the flat `speaker` / `transcript` shape. Tests cover both.
- Zoom wording in docstrings and type comments: Zoom bots join through your Zoom app (Meeting SDK) with an OBF token (`obf_url`) or a ZAK token (`zak_url`). The text no longer says Zoom needs no setup. `zoom.use_own_app` is unchanged.
- README and AGENTS.md state: "Inbuilt keys work in pipeline mode only: Deepgram (speech-to-text) and OpenAI (LLM and voice). Realtime mode runs on OpenAI and needs your own OpenAI key. Any other provider: bring your own key." `key_source: "meetstream"` works in pipeline mode only.

## 1.4.0 (2026-11-21)

Matches MeetStream API v1.10.0.

### Added

- Agents API: `mia.get(agentConfigId)`, `mia.checkLocalAgent(agentConfigId)` (`GET /mia?check=local_agent`), and `mia.updateLive(botId, params)` (same call as `bots.updateMia`, with `wait_for_ack`). `mia.create` returns a typed `CreateMiaResponse`.
- `KeySource` (`"meetstream"` | `"user"`) as `key_source` on `transcriber`, `model` and `voice`, for MeetStream's inbuilt keys or your own keys.
- `isInbuiltKeysUnavailable(err)` detects the `400` the API returns while inbuilt keys are not on for an account.
- `model.provider: "local_agent"` (needs the local agent feature on for the account) with a typed `model.local_agent` block (`url`, `label`, `access`, `require_code`, `owner_only`, `owner_names`, `owner_ids`, `timeout_s`) and `LocalAgentCheck`.
- Agent options: `agent.tools` (`current_time`, `weather_now`, `screen`), `agent.desktop`, `agent.chat_input`, `agent.quiet_actions`, `agent.speak_only_when_asked`, `agent.custom_functions`. `transcriber.language` is documented (unset, `multi` or `auto` = automatic detection). New `MiaVoiceConfig` type.
- `TranscriptFailedError`: a `422` from `get_transcript` carries `status`, `transcriptStatus`, `transcriptId` and `reason`. It is not retried, and `transcripts.waitFor` stops at once.
- `billing.balance()` for `GET /billing/balance` (`customer_type`, `balance_usd`, `currency`). Available when the endpoint is on for the account; a `404` raises `BalanceUnavailableError` (with `billingUrl`), not retried.
- `meetingDirectConnect.create`, `get` and `leave` (Zoom Meeting Direct Connect), as in the Python SDK.

### Changed

- README opens with the two ways to integrate (Bot API, Agents API), a fastest path for each, the voice agent setups with prices, and a "Latest docs" section.

## 1.3.0 (2026-11-17)

- `bots.raiseHand`, `bots.lowerHand` and `bots.sendCommand` (typed per command), `bots.updateMia` with `wait_for_ack`.
- MIA with Claude: `model.provider: "anthropic"` in pipeline mode, `reasoning_effort` and `tool_choice` typed.
- New create fields typed: `zoom.use_own_app`, `bot_camera_stream`, `storage_id`, `initial_audio`, the `smallest` and `smallest_streaming` providers, `grid_view_default` and `speaker_view_default` layouts, `realtime_endpoints` with participant hand events, `recording_permission_denied_timeout` up to 600 seconds.
- `speakerTimeline()` returns a union; `isSpeakerTimelineDownload()` detects the download-link shape.
- Endpoints added: `bots.get`, `bots.stopStatus`, `bots.screenshot`, `transcripts.getByBotId`, `googleLogins.get`, `calendar.listConnections`, `calendar.getConnection`, `calendar.deleteConnection`.
- Route fixes: `bots.screenshots()` calls `/screenshots` (with paging), `calendar.list()` calls `/calendar/calendars`, `calendar.disconnect()` is a `DELETE`.
- Errors carry `retryAfter` and `code`; `RateLimitError` carries `limit` and `window`. An in-progress `409` on create is retried with the same key.
- Deprecated: `bots.summary()` and `calendar.toggleRecurrence()`. The API has no route for either.

## 1.2.1 and earlier

See the git history.
