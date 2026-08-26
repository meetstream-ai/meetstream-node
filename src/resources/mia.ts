import type { HttpClient, RequestOptions } from '../client.js';
import type { CreateMiaParams } from '../types.js';

/**
 * MIA: MeetStream Infrastructure Agents - AI participants that listen and
 * speak in a live meeting. MeetStream hosts the audio bridge, so you host
 * nothing.
 *
 * Flow: create a config here, then pass the returned `agent_config_id` to
 * `bots.create()`. That single field is all a MIA bot needs.
 */
export class Mia {
  constructor(private readonly http: HttpClient) {}

  /** Create an agent config. Returns an `agent_config_id`. */
  create(params: CreateMiaParams, opts: RequestOptions = {}): Promise<{ agent_config_id?: string } & Record<string, unknown>> {
    return this.http.post('/mia', params, opts);
  }

  /** List configs, or fetch one by passing `agent_config_id`. */
  list(params: { agent_config_id?: string } = {}, opts: RequestOptions = {}): Promise<unknown> {
    return this.http.get('/mia', { ...opts, query: params as Record<string, unknown> });
  }

  /** Update a config. The body must include `agent_config_id`. */
  update(
    params: { agent_config_id: string } & Partial<CreateMiaParams>,
    opts: RequestOptions = {},
  ): Promise<unknown> {
    return this.http.put('/mia', params, opts);
  }

  delete(agentConfigId: string, opts: RequestOptions = {}): Promise<unknown> {
    return this.http.delete('/mia', { ...opts, query: { agent_config_id: agentConfigId } });
  }
}
