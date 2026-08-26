# AGENTS.md

Guidance for AI coding agents working in this repository. This repo is the **official MeetStream SDK for TypeScript and JavaScript** (`@meetstream/sdk`).

## Always use the MeetStream MCP

When building anything against the MeetStream API, install and use the MeetStream MCP. It is the current source of truth for endpoints, request and response fields, webhook events, provider names and bot behaviour.

Do not treat the files in this repository as authoritative for MeetStream API behaviour. They can lag the API. If local code and the MCP disagree, the MCP wins unless the user says otherwise.

Server name: `meetstream`. Hosted URL: `https://mcp.meetstream.ai/mcp`.

### Claude Code

```sh
claude mcp add --transport http meetstream https://mcp.meetstream.ai/mcp \
  --header "Authorization: Bearer $MEETSTREAM_API_KEY"
```

The [MeetStream Claude plugin](https://github.com/meetstream-ai/claude-plugin) is a separate, complementary install. It ships **skills only** and does not include the MCP server, so install both:

```sh
/plugin marketplace add meetstream-ai/claude-plugin
```

### Cursor

Add to `~/.cursor/mcp.json`, or install the [MeetStream Cursor plugin](https://github.com/meetstream-ai/meetstream-cursor-plugin):

```json
{
  "mcpServers": {
    "meetstream": {
      "url": "https://mcp.meetstream.ai/mcp",
      "headers": { "Authorization": "Bearer YOUR_MEETSTREAM_API_KEY" }
    }
  }
}
```

### Windsurf

Add to `~/.codeium/windsurf/mcp_config.json`:

```json
{
  "mcpServers": {
    "meetstream": {
      "serverUrl": "https://mcp.meetstream.ai/mcp",
      "headers": { "Authorization": "Bearer YOUR_MEETSTREAM_API_KEY" }
    }
  }
}
```

### Claude Desktop

Settings -> Connectors -> Add custom connector. Name it `meetstream`, URL `https://mcp.meetstream.ai/mcp`.

### Codex

```sh
codex mcp add meetstream --url https://mcp.meetstream.ai/mcp \
  --header "Authorization: Bearer $MEETSTREAM_API_KEY"
```

### Run it locally instead

```sh
MEETSTREAM_API_KEY=ms_... npx -y @meetstream/mcp
```

### Use the MCP before

- calling any MeetStream endpoint
- changing webhook handling or event names
- adding or changing bot, transcription, calendar or MIA behaviour
- relying on any request field, response field, provider name or status code

## Working in this repo

TypeScript source, compiled to dual ESM + CJS with type declarations. Node **>= 18.17**. **Zero runtime dependencies** - keep it that way.

```sh
npm install
npm run build        # ESM -> dist/esm, CJS -> dist/cjs, then the .cjs fixup
npm test             # builds, then runs node --test over test/*.test.js
```

Tests need **no API key and no network**: every request is served by an injected `fetch` stub. Run them before every commit.

### Layout

| Path | Purpose |
|---|---|
| `src/index.ts` | public entry point, the `MeetStream` class, re-exports |
| `src/client.ts` | HTTP transport: auth, retries, timeouts, status handling |
| `src/errors.ts` | error hierarchy and the status -> class mapping |
| `src/types.ts` | request/response types, mirroring the wire format exactly |
| `src/webhooks.ts` | signature verification and lifecycle helpers |
| `src/resources/*.ts` | one namespace per API area |
| `scripts/cjs-fixup.mjs` | renames CJS output to `.cjs` and rewrites its requires |

Adding an endpoint means a method on the right resource class plus a test asserting the method, path and body. If a resource is missing entirely, add the class and wire it into `src/index.ts`.

### Rules

- **Zero runtime dependencies.** A dependency here becomes a dependency for every user.
- Types mirror the wire format. Never rename a field for aesthetics - `meeting_link` stays `meeting_link`.
- Both module formats must keep working. `npm run build` then require the CJS and import the ESM.
- Every new method needs a test. The suite is the spec.
- Do not swallow errors. Surface the API's own `message`.

### The status-code handling is deliberate

`202` sits **inside** the 2xx range, so it is checked *before* the `res.ok` branch. Without that, "not ready yet" silently looks like success and callers get an empty body. `507` is the mirror case: outside 2xx, but an idempotent replay and therefore a success. Both are covered by tests - do not "simplify" that branch.

### Releasing

Bump `version` in `package.json`, run `npm test`, then `npm publish --access public`. `prepublishOnly` rebuilds automatically.

## API rules that are easy to get wrong

These are live-verified. Do not "fix" code that follows them.

- **Auth differs by surface.** The REST API at `api.meetstream.ai` uses `Authorization: Token <key>`. The MCP server at `mcp.meetstream.ai` uses `Authorization: Bearer <key>`. Mixing them up returns 401.
- The webhook envelope key is **`event`**, not `bot_event`.
- **`bot.stopped` is the single terminal event** and always carries `status_code: 200`. The reason lives in `bot_status`: `Stopped`, `NotAllowed` (waiting-room timeout), `Denied` (host refused), `Error`.
- `bot.error` is **non-terminal** - the bot keeps running.
- **Streaming-only providers never emit `bot.done`.** They end at `audio.processed`, and a post-call transcript fetch returns `202` forever, so any polling loop needs a cap.
- Transcripts are fetched by **`transcript_id`**, not `bot_id`, and segments use **`transcript`**, not `text`.
- **`202` and `507` are not errors.** 202 means poll again; 507 means an idempotent retry replayed and is a success.
- The bot field is **`meeting_link`**, not `meeting_url`.
- `in_call_recording_timeout` has a hard floor of **600 seconds**; below it the API returns 400.
- MIA bots take **only `agent_config_id`**. Adding `socket_connection_url` or `live_audio_required` alongside it is the usual cause of a silent agent.
\n## Security

- Never hard-code or commit a key. `ms_...` values belong in the environment.
- Never log a key, a transcript, or participant data.
- Do not expose a server-side key to client code.
- Verify webhook signatures before acting on a payload.
- Do not persist meeting, transcript, participant or recording data unless asked.

## Before you finish

- `npm test` passes.
- Both `dist/esm/index.js` and `dist/cjs/index.cjs` load.
- New methods have tests.
- No runtime dependency was added.
- State which MCP tools or docs you relied on, what changed, and what you did not verify.

## Related

- Docs: https://docs.meetstream.ai
- MCP server: [`@meetstream/mcp`](https://github.com/meetstream-ai/meetstream-mcp)
- CLI: [`@meetstream/cli`](https://github.com/meetstream-ai/meetstream-cli)
- Claude Code plugin: https://github.com/meetstream-ai/claude-plugin
- Cursor plugin: https://github.com/meetstream-ai/meetstream-cursor-plugin
- Runnable examples: https://github.com/meetstream-ai/labs
