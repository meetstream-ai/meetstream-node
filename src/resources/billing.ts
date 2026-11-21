import type { HttpClient, RequestOptions } from '../client.js';
import type { BillingBalance } from '../types.js';

/** Account billing. Read only. Top up at https://app.meetstream.ai/billing. */
export class Billing {
  constructor(private readonly http: HttpClient) {}

  /**
   * Your prepaid balance, read with your API key. `balance_usd` is a decimal
   * string (for example `"12.34"`), or `null` for accounts billed by invoice.
   */
  balance(opts: RequestOptions = {}): Promise<BillingBalance> {
    return this.http.get('/billing/balance', opts);
  }
}
