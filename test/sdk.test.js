// Tests run against the built ESM output. No API key and no network required:
// every request is served by an injected fetch stub.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';

import {
  MeetStream,
  NotReadyError,
  AuthenticationError,
  PermissionError,
  ConflictError,
  RateLimitError,
  BadRequestError,
  NotFoundError,
  ServerError,
  MeetStreamError,
  verifyWebhookSignature,
  parseWebhook,
  isTerminal,
  describeStop,
} from '../dist/esm/index.js';

/** Build a fetch stub that records calls and replays queued responses. */
function stubFetch(responses) {
  const calls = [];
  const queue = Array.isArray(responses) ? [...responses] : [responses];
  const fetchImpl = async (url, init) => {
    calls.push({ url: url.toString(), init });
    const next = queue.length > 1 ? queue.shift() : queue[0];
    const { status = 200, body = {}, headers = {} } = next;
    return new Response(typeof body === 'string' ? body : JSON.stringify(body), {
      status,
      headers: { 'content-type': 'application/json', ...headers },
    });
  };
  return { fetchImpl, calls };
}

function client(responses, opts = {}) {
  const { fetchImpl, calls } = stubFetch(responses);
  return { ms: new MeetStream({ apiKey: 'ms_test', fetch: fetchImpl, maxRetries: 0, ...opts }), calls };
}

test('requires an API key', () => {
  const saved = process.env.MEETSTREAM_API_KEY;
  delete process.env.MEETSTREAM_API_KEY;
  try {
    assert.throws(() => new MeetStream(), MeetStreamError);
  } finally {
    if (saved !== undefined) process.env.MEETSTREAM_API_KEY = saved;
  }
});

test('REST auth uses the Token scheme, not Bearer', async () => {
  const { ms, calls } = client({ body: { bot_id: 'b1' } });
  await ms.bots.create({ meeting_link: 'https://meet.google.com/a-b-c' });
  assert.equal(calls[0].init.headers.Authorization, 'Token ms_test');
});

test('createBot posts meeting_link to the right path', async () => {
  const { ms, calls } = client({ status: 201, body: { bot_id: 'b1', transcript_id: 't1' } });
  const bot = await ms.bots.create({ meeting_link: 'https://zoom.us/j/1', bot_name: 'Notetaker' });
  assert.equal(bot.bot_id, 'b1');
  assert.match(calls[0].url, /\/api\/v1\/bots\/create_bot$/);
  assert.equal(calls[0].init.method, 'POST');
  assert.equal(JSON.parse(calls[0].init.body).meeting_link, 'https://zoom.us/j/1');
});

test('507 is an idempotent replay and resolves as success', async () => {
  const { ms } = client({ status: 507, body: { bot_id: 'original' } });
  const bot = await ms.bots.create(
    { meeting_link: 'https://zoom.us/j/1' },
    { idempotencyKey: 'fixed-uuid' },
  );
  assert.equal(bot.bot_id, 'original');
});

test('idempotency key is sent as a header', async () => {
  const { ms, calls } = client({ body: {} });
  await ms.bots.create({ meeting_link: 'x' }, { idempotencyKey: 'abc-123' });
  assert.equal(calls[0].init.headers['Idempotency-Key'], 'abc-123');
});

test('202 raises NotReadyError rather than looking like success', async () => {
  const { ms } = client({ status: 202, body: { message: 'processing' } });
  await assert.rejects(() => ms.transcripts.get('t1'), NotReadyError);
});

test('status codes map onto distinct error types', async () => {
  const cases = [
    [400, BadRequestError], [401, AuthenticationError], [403, PermissionError],
    [404, NotFoundError], [409, ConflictError], [429, RateLimitError], [503, ServerError],
  ];
  for (const [status, Type] of cases) {
    const { ms } = client({ status, body: { message: `fail ${status}` } });
    await assert.rejects(() => ms.bots.status('b1'), (e) => {
      assert.ok(e instanceof Type, `${status} should be ${Type.name}, got ${e.constructor.name}`);
      assert.equal(e.status, status);
      assert.equal(e.message, `fail ${status}`);
      return true;
    });
  }
});

test('removeBot is a GET, deleteData is a DELETE', async () => {
  const { ms, calls } = client({ body: {} });
  await ms.bots.remove('b1');
  await ms.bots.deleteData('b1');
  assert.equal(calls[0].init.method, 'GET');
  assert.match(calls[0].url, /\/bots\/b1\/remove_bot$/);
  assert.equal(calls[1].init.method, 'DELETE');
  assert.match(calls[1].url, /\/bots\/b1\/delete$/);
});

test('transcript is fetched by transcript_id on the transcript route', async () => {
  const { ms, calls } = client({ body: { transcript: [{ speaker: 'Sid', transcript: 'hello' }] } });
  const out = await ms.transcripts.get('t-42');
  assert.equal(out.transcript[0].transcript, 'hello');
  assert.match(calls[0].url, /\/transcript\/t-42\/get_transcript\?raw=false$/);
});

test('waitFor gives up rather than polling a streaming-only bot forever', async () => {
  const { ms } = client({ status: 202, body: {} });
  await assert.rejects(
    () => ms.transcripts.waitFor('t1', { timeoutMs: 60, intervalMs: 10 }),
    (e) => {
      assert.ok(e instanceof NotReadyError);
      assert.match(e.message, /streaming-only/);
      return true;
    },
  );
});

test('retries transient failures then succeeds', async () => {
  const { fetchImpl, calls } = stubFetch([
    { status: 503, body: { message: 'unavailable' } },
    { status: 200, body: { ok: true } },
  ]);
  const ms = new MeetStream({ apiKey: 'ms_test', fetch: fetchImpl, maxRetries: 3 });
  const out = await ms.bots.status('b1');
  assert.equal(out.ok, true);
  assert.equal(calls.length, 2);
});

test('does not retry a 400', async () => {
  const { fetchImpl, calls } = stubFetch({ status: 400, body: { message: 'meeting_link is required.' } });
  const ms = new MeetStream({ apiKey: 'ms_test', fetch: fetchImpl, maxRetries: 3 });
  await assert.rejects(() => ms.bots.create({}), BadRequestError);
  assert.equal(calls.length, 1);
});

test('mia create returns agent_config_id and update sends PUT', async () => {
  const { ms, calls } = client({ body: { agent_config_id: 'agent-1' } });
  const cfg = await ms.mia.create({ agent_name: 'Assistant', mode: 'pipeline' });
  assert.equal(cfg.agent_config_id, 'agent-1');
  await ms.mia.update({ agent_config_id: 'agent-1', agent_name: 'Renamed' });
  assert.equal(calls[1].init.method, 'PUT');
});

test('mia delete passes agent_config_id as a query param', async () => {
  const { ms, calls } = client({ body: {} });
  await ms.mia.delete('agent-1');
  assert.equal(calls[0].init.method, 'DELETE');
  assert.match(calls[0].url, /\/mia\?agent_config_id=agent-1$/);
});

test('rescheduleBot uses scheduled_join_time', async () => {
  const { ms, calls } = client({ body: {} });
  await ms.calendar.rescheduleBot('b1', { scheduled_join_time: '2026-09-01T10:00:00Z' });
  assert.equal(calls[0].init.method, 'PATCH');
  assert.equal(JSON.parse(calls[0].init.body).scheduled_join_time, '2026-09-01T10:00:00Z');
});

test('storage.set targets admin/configs with config_type=storage', async () => {
  const { ms, calls } = client({ body: {} });
  await ms.storage.set({ provider: 'aws', bucket_name: 'b' });
  assert.equal(calls[0].init.method, 'PUT');
  assert.match(calls[0].url, /\/admin\/configs\?config_type=storage$/);
});

test('baseUrl override is honoured', async () => {
  const { fetchImpl, calls } = stubFetch({ body: {} });
  const ms = new MeetStream({ apiKey: 'k', fetch: fetchImpl, baseUrl: 'https://staging.example.com/api/v1' });
  await ms.bots.list();
  assert.match(calls[0].url, /^https:\/\/staging\.example\.com\/api\/v1\/bots$/);
});

/* ------------------------------------------------------------- webhooks */

const SECRET = 'whsec_test';
const BODY = JSON.stringify({ event: 'bot.stopped', bot_id: 'b1', bot_status: 'NotAllowed', status_code: 200 });
const SIG = createHmac('sha256', SECRET).update(BODY, 'utf8').digest('hex');

test('valid webhook signature verifies, in both bare and prefixed form', () => {
  assert.equal(verifyWebhookSignature(BODY, SIG, SECRET), true);
  assert.equal(verifyWebhookSignature(BODY, `sha256=${SIG}`, SECRET), true);
  assert.equal(verifyWebhookSignature(Buffer.from(BODY), SIG, SECRET), true);
});

test('tampered body or wrong secret fails verification', () => {
  assert.equal(verifyWebhookSignature(BODY + ' ', SIG, SECRET), false);
  assert.equal(verifyWebhookSignature(BODY, SIG, 'wrong'), false);
  assert.equal(verifyWebhookSignature(BODY, 'short', SECRET), false);
  assert.equal(verifyWebhookSignature(BODY, '', SECRET), false);
});

test('parseWebhook refuses a forged payload', () => {
  assert.throws(() => parseWebhook(BODY, 'bad', SECRET), /verification failed/);
  const parsed = parseWebhook(BODY, SIG, SECRET);
  assert.equal(parsed.event, 'bot.stopped');
});

test('bot.stopped is terminal and bot.error is not', () => {
  assert.equal(isTerminal({ event: 'bot.stopped' }), true);
  assert.equal(isTerminal({ event: 'bot.error' }), false);
  assert.equal(isTerminal({ event: 'bot.done' }), false);
});

test('describeStop explains each bot_status', () => {
  assert.match(describeStop({ event: 'bot.stopped', bot_status: 'NotAllowed' }), /waiting room/i);
  assert.match(describeStop({ event: 'bot.stopped', bot_status: 'Denied' }), /refused/i);
  assert.match(describeStop({ event: 'bot.stopped', bot_status: 'Error' }), /crashed/i);
  assert.match(describeStop({ event: 'bot.stopped', bot_status: 'Stopped' }), /normally/i);
});
