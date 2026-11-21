import type { HttpClient, RequestOptions } from '../client.js';
import { BalanceUnavailableError, NotFoundError } from '../errors.js';
import type { BillingBalance } from '../types.js';

/** Account billing. Read only. Top up at https://app.meetstream.ai/billing. */
export class Billing {
  constructor(private readonly http: HttpClient) {}

  /**
   * Your prepaid balance, read with your API key. `balance_usd` is a decimal
   * string (for example `"12.34"`), or `null` for accounts billed by invoice.
   *
   * Available when the balance endpoint is on for your account. Until then the
   * API answers 404 and this throws {@link BalanceUnavailableError}: read the
   * balance on https://app.meetstream.ai/billing instead. Not retried.
   */
  async balance(opts: RequestOptions = {}): Promise<BillingBalance> {
    try {
      return await this.http.get<BillingBalance>('/billing/balance', opts);
    } catch (e) {
      if (e instanceof NotFoundError) {
        throw new BalanceUnavailableError(
          'The balance endpoint is not available for this account yet. See your balance at https://app.meetstream.ai/billing',
          { status: e.status, body: e.body, requestId: e.requestId },
        );
      }
      throw e;
    }
  }
}
