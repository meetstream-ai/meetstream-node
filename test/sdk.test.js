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
  stopReason,
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

/* ---------------------------------------------------- signed-in logins */

const req = (call) => {
  const u = new URL(call.url);
  return {
    method: call.init.method,
    path: u.pathname.replace(/^\/api\/v1/, ''),
    query: Object.fromEntries(u.searchParams),
    body: call.init.body ? JSON.parse(call.init.body) : undefined,
  };
};

test('teamsLogins domain methods hit /teams-login-domains', async () => {
  const { ms, calls } = client({ body: {} });
  await ms.teamsLogins.createDomain({ domain: 'bots.acme.com', name: 'Acme', login_mode: 'always' });
  await ms.teamsLogins.listDomains();
  await ms.teamsLogins.getDomain('bots.acme.com');
  await ms.teamsLogins.updateDomain('bots.acme.com', { name: 'Renamed' });
  await ms.teamsLogins.deleteDomain('bots.acme.com');
  assert.deepEqual(calls.map(req), [
    { method: 'POST', path: '/teams-login-domains', query: {}, body: { domain: 'bots.acme.com', name: 'Acme', login_mode: 'always' } },
    { method: 'GET', path: '/teams-login-domains', query: {}, body: undefined },
    { method: 'GET', path: '/teams-login-domains/bots.acme.com', query: {}, body: undefined },
    { method: 'PATCH', path: '/teams-login-domains/bots.acme.com', query: {}, body: { name: 'Renamed' } },
    { method: 'DELETE', path: '/teams-login-domains/bots.acme.com', query: {}, body: undefined },
  ]);
});

test('teamsLogins login methods hit /teams-logins', async () => {
  const { ms, calls } = client({ body: {} });
  await ms.teamsLogins.create({ domain: 'bots.acme.com', email: 'bot1@bots.acme.com', password: 'placeholder' });
  await ms.teamsLogins.list('bots.acme.com');
  await ms.teamsLogins.get('login-1');
  await ms.teamsLogins.update('login-1', { is_active: false });
  await ms.teamsLogins.delete('login-1');
  assert.deepEqual(calls.map(req), [
    { method: 'POST', path: '/teams-logins', query: {}, body: { domain: 'bots.acme.com', email: 'bot1@bots.acme.com', password: 'placeholder' } },
    { method: 'GET', path: '/teams-logins', query: { domain: 'bots.acme.com' }, body: undefined },
    { method: 'GET', path: '/teams-logins/login-1', query: {}, body: undefined },
    { method: 'PATCH', path: '/teams-logins/login-1', query: {}, body: { is_active: false } },
    { method: 'DELETE', path: '/teams-logins/login-1', query: {}, body: undefined },
  ]);
});

test('googleLogins.list accepts an optional domain filter', async () => {
  const { ms, calls } = client({ body: {} });
  await ms.googleLogins.list();
  await ms.googleLogins.list('acme.com');
  await ms.googleLogins.list({ timeout: 5000 });
  assert.deepEqual(calls.map(req).map(({ method, path, query }) => ({ method, path, query })), [
    { method: 'GET', path: '/google-logins', query: {} },
    { method: 'GET', path: '/google-logins', query: { domain: 'acme.com' } },
    { method: 'GET', path: '/google-logins', query: {} },
  ]);
});

test('bots.create passes a teams sign-in block through unchanged', async () => {
  const { ms, calls } = client({ status: 201, body: { bot_id: 'b1' } });
  const teams = { login_required: true, teams_login_domain: 'bots.acme.com', sign_in_email: 'bot1@bots.acme.com', strict_email: false };
  await ms.bots.create({ meeting_link: 'https://teams.microsoft.com/l/meetup-join/x', teams });
  assert.deepEqual(JSON.parse(calls[0].init.body).teams, teams);
});

/* ------------------------------------------------------------- webhooks */

const SECRET = 'whsec_test';
const BODY = JSON.stringify({ event: 'bot.stopped', bot_event: 'bot.notallowed', bot_id: 'b1', bot_status: 'NotAllowed', status_code: 500, timestamp: '2026-06-16T06:28:14.445Z' });
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

// Shapes taken from captured production webhooks (Jun 2026).
test('describeStop reads the reason from bot_event', () => {
  assert.match(describeStop({ event: 'bot.stopped', bot_event: 'bot.stopped', bot_status: 'Stopped', status_code: 200 }), /normally/i);
  assert.match(describeStop({ event: 'bot.stopped', bot_event: 'bot.kicked', bot_status: 'Stopped', status_code: 200 }), /removed/i);
  assert.match(describeStop({ event: 'bot.stopped', bot_event: 'bot.notallowed', bot_status: 'NotAllowed', status_code: 500 }), /waiting room/i);
  assert.match(describeStop({ event: 'bot.stopped', bot_event: 'bot.denied', bot_status: 'Denied', status_code: 500 }), /refused/i);
  assert.match(describeStop({ event: 'bot.stopped', bot_event: 'bot.failed', bot_status: 'FAILED', status_code: 500 }), /crashed/i);
});

test('stopReason falls back to bot_status, case-insensitively', () => {
  assert.equal(stopReason({ event: 'bot.stopped', bot_status: 'NotAllowed' }), 'bot.notallowed');
  assert.equal(stopReason({ event: 'bot.stopped', bot_status: 'Denied' }), 'bot.denied');
  assert.equal(stopReason({ event: 'bot.stopped', bot_status: 'ERROR' }), 'bot.failed');
  assert.equal(stopReason({ event: 'bot.stopped', bot_status: 'Failed' }), 'bot.failed');
  assert.equal(stopReason({ event: 'bot.stopped', bot_status: 'Stopped' }), 'bot.stopped');
});

test('a kick is distinguishable from a clean exit even though bot_status matches', () => {
  const kick = { event: 'bot.stopped', bot_event: 'bot.kicked', bot_status: 'Stopped' };
  const clean = { event: 'bot.stopped', bot_event: 'bot.stopped', bot_status: 'Stopped' };
  assert.notEqual(stopReason(kick), stopReason(clean));
});

// Policy: audio only unless asked, speaker view when video is on, per-participant video opt-in.
test('create passes video policy fields through unchanged', async () => {
  const { ms, calls } = client([{ status: 201, body: { bot_id: 'b1' } }]);
  await ms.bots.create({
    meeting_link: 'https://meet.google.com/x',
    bot_name: 'Notetaker',
    video_required: true,
    recording_config: { video_layout: 'speaker_view' },
  });
  const sent = JSON.parse(calls[0].init.body);
  assert.equal(sent.video_required, true);
  assert.equal(sent.recording_config.video_layout, 'speaker_view');
  assert.equal(sent.video_separate_streams, undefined);
});
