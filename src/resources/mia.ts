import type { HttpClient, RequestOptions } from '../client.js';
import type {
  AgentConfig,
  CreateMiaParams,
  CreateMiaResponse,
  LocalAgentCheck,
  UpdateLiveMiaParams,
  UpdateLiveMiaResponse,
  UpdateMiaConfigParams,
} from '../types.js';

/**
 * Agents API (MIA): voice agents in the meeting. The agent rides on a bot: it
 * hears the meeting and answers by voice, in the chat, or with silent tool
 * calls.
 *
 * Flow: save an agent config here, then pass the returned `agent_config_id`
 * to `bots.create()`. That single field is all an agent bot needs.
 *
 * Keys: each pipeline section (`transcriber`, `model`, `voice`) uses
 * MeetStream's inbuilt keys with `key_source: "meetstream"`, or your own key.
 * `model.provider: "local_agent"` runs your own agent through the MeetStream
 * Agent Kit. See https://docs.meetstream.ai/guides/mia/pricing-and-keys and
 * https://docs.meetstream.ai/guides/mia/mia-api-guide.
 *
 * Secrets come back masked (`****` plus the last four characters). Sending a
 * masked value back in `update()` keeps the stored secret.
 */
export class Mia {
  constructor(private readonly http: HttpClient) {}

  /** Save an agent config. Returns its `agent_config_id`. */
  create(params: CreateMiaParams, opts: RequestOptions = {}): Promise<CreateMiaResponse> {
    return this.http.post('/mia', params, opts);
  }

  /** One agent config by id. */
  get(agentConfigId: string, opts: RequestOptions = {}): Promise<AgentConfig & Record<string, unknown>> {
    return this.http.get('/mia', { ...opts, query: { agent_config_id: agentConfigId } });
  }

  /** List agent configs, or fetch one by passing `agent_config_id`. */
  list(params: { agent_config_id?: string } = {}, opts: RequestOptions = {}): Promise<unknown> {
    return this.http.get('/mia', { ...opts, query: params as Record<string, unknown> });
  }

  /**
   * Update a saved config (`PUT`). The body must include `agent_config_id`.
   * Each block you send replaces the stored block, so send the whole `agent`
   * block. Running bots keep the config they started with; use `updateLive()`
   * for a bot in a meeting.
   */
  update(params: UpdateMiaConfigParams, opts: RequestOptions = {}): Promise<unknown> {
    return this.http.put('/mia', params, opts);
  }

  delete(agentConfigId: string, opts: RequestOptions = {}): Promise<unknown> {
    return this.http.delete('/mia', { ...opts, query: { agent_config_id: agentConfigId } });
  }

  /**
   * Test the connection to your local agent bridge for a config with
   * `model.provider: "local_agent"`. Run it before the call.
   * `local_agent.status` is `ok`, or the reason the bridge cannot be used.
   */
  checkLocalAgent(agentConfigId: string, opts: RequestOptions = {}): Promise<LocalAgentCheck> {
    return this.http.get('/mia', { ...opts, query: { agent_config_id: agentConfigId, check: 'local_agent' } });
  }

  /**
   * Update the agent of a bot that is in a meeting: prompt variables, system
   * prompt or wake words. The saved config does not change. With
   * `wait_for_ack: true` the response carries the agent's own result
   * (`applied`, `partially_applied`, `failed`, or `accepted` when the agent did
   * not answer in time). Same call as `bots.updateMia()`.
   */
  updateLive(botId: string, params: UpdateLiveMiaParams, opts: RequestOptions = {}): Promise<UpdateLiveMiaResponse> {
    return this.http.post(`/bots/${encodeURIComponent(botId)}/update_mia`, params, opts);
  }
}
