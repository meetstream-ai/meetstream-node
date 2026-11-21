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
  isSpeakerTimelineDownload,
  TranscriptFailedError,
  BalanceUnavailableError,
  isInbuiltKeysUnavailable,
  segmentSpeaker,
  segmentText,
  segmentStart,
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

/* ------------------------------------------------------ bot endpoints */

test('bots.get and stopStatus hit the bot routes', async () => {
  const { ms, calls } = client({ body: { bot_id: 'b1', status: 'stopped' } });
  await ms.bots.get('b1');
  const stop = await ms.bots.stopStatus('b1');
  assert.equal(stop.status, 'stopped');
  assert.deepEqual(calls.map(req).map(({ method, path }) => ({ method, path })), [
    { method: 'GET', path: '/bots/b1' },
    { method: 'GET', path: '/bots/b1/stop_status' },
  ]);
});

test('screenshots list uses /screenshots with paging params, and one is fetched by id', async () => {
  const { ms, calls } = client({ body: { bot_id: 'b1', screenshots: [], next_continuation_token: null } });
  await ms.bots.screenshots('b1');
  await ms.bots.screenshots('b1', { limit: 50, continuation_token: 'tok', meta: 'm' });
  await ms.bots.screenshot('b1', '20261110T101010123Z_abc');
  assert.deepEqual(calls.map(req).map(({ method, path, query }) => ({ method, path, query })), [
    { method: 'GET', path: '/bots/b1/screenshots', query: {} },
    { method: 'GET', path: '/bots/b1/screenshots', query: { limit: '50', continuation_token: 'tok', meta: 'm' } },
    { method: 'GET', path: '/bots/b1/screenshots/20261110T101010123Z_abc', query: {} },
  ]);
});

test('sendCommand posts the command and returns hand_raised', async () => {
  const { ms, calls } = client({ body: { status: 'accepted', bot_id: 'b1', command: 'raise_hand', hand_raised: true } });
  const out = await ms.bots.sendCommand('b1', { command: 'raise_hand' });
  assert.equal(out.hand_raised, true);
  assert.deepEqual(req(calls[0]), { method: 'POST', path: '/bots/b1/send_command', query: {}, body: { command: 'raise_hand' } });
});

test('raiseHand and lowerHand send only the command', async () => {
  const { ms, calls } = client([
    { body: { status: 'accepted', bot_id: 'b1', command: 'raise_hand', hand_raised: true } },
    { body: { status: 'accepted', bot_id: 'b1', command: 'lower_hand', hand_raised: false } },
  ]);
  const up = await ms.bots.raiseHand('b1');
  const down = await ms.bots.lowerHand('b1');
  assert.equal(up.hand_raised, true);
  assert.equal(down.hand_raised, false);
  assert.deepEqual(calls.map((c) => req(c).body), [{ command: 'raise_hand' }, { command: 'lower_hand' }]);
  assert.ok(calls.every((c) => req(c).path === '/bots/b1/send_command'));
});

test('sendCommand screenshot returns the download fields', async () => {
  const body = { status: 'accepted', bot_id: 'b1', command: 'screenshot', id: 's1', filename: 's1.png', recorded_at: '2026-11-10T10:10:10Z', url: 'https://example.com/s1' };
  const { ms, calls } = client({ body });
  const out = await ms.bots.sendCommand('b1', { command: 'screenshot', metadata: { label: 'slide 3' } });
  assert.equal(out.url, 'https://example.com/s1');
  assert.deepEqual(req(calls[0]).body, { command: 'screenshot', metadata: { label: 'slide 3' } });
});

test('a command sent to a bot that is not in the meeting is a ConflictError and is not retried', async () => {
  const { fetchImpl, calls } = stubFetch({ status: 409, body: { error: 'Bot is not in an active meeting' } });
  const ms = new MeetStream({ apiKey: 'k', fetch: fetchImpl, maxRetries: 3 });
  await assert.rejects(() => ms.bots.raiseHand('b1'), ConflictError);
  assert.equal(calls.length, 1);
});

test('an unsupported command surfaces the API code', async () => {
  const { ms } = client({ status: 400, body: { error: "Command 'raise_hand' is not supported on whatsapp bots.", code: 'unsupported_on_whatsapp', command: 'raise_hand', platform: 'whatsapp' } });
  await assert.rejects(() => ms.bots.raiseHand('b1'), (e) => {
    assert.ok(e instanceof BadRequestError);
    assert.equal(e.code, 'unsupported_on_whatsapp');
    assert.match(e.message, /not supported on whatsapp/);
    return true;
  });
});

test('updateMia posts to update_mia with wait_for_ack and returns the agent result', async () => {
  const { ms, calls } = client({ body: { status: 'partially_applied', bot_id: 'b1', command: 'update_mia', applied: ['system_prompt'], errors: [{ field: 'wake_words' }] } });
  const out = await ms.bots.updateMia('b1', { system_prompt: 'Be brief.', wake_words: ['hey ada'], wait_for_ack: true });
  assert.equal(out.status, 'partially_applied');
  assert.deepEqual(out.applied, ['system_prompt']);
  assert.deepEqual(req(calls[0]), {
    method: 'POST', path: '/bots/b1/update_mia', query: {},
    body: { system_prompt: 'Be brief.', wake_words: ['hey ada'], wait_for_ack: true },
  });
});

test('sendCommand update_mia carries the same fields', async () => {
  const { ms, calls } = client({ body: { status: 'applied', bot_id: 'b1', command: 'update_mia' } });
  await ms.bots.sendCommand('b1', { command: 'update_mia', agent_config_params: { name: 'Ada' }, wait_for_ack: true });
  assert.deepEqual(req(calls[0]).body, { command: 'update_mia', agent_config_params: { name: 'Ada' }, wait_for_ack: true });
});

test('sendMessage accepts metadata; sendImage accepts base64', async () => {
  const { ms, calls } = client({ body: { status: 'accepted' } });
  await ms.bots.sendMessage('b1', 'hello');
  await ms.bots.sendMessage('b1', { message: 'hi', metadata: { k: 'v' } });
  await ms.bots.sendImage('b1', { img: 'aGVsbG8=', display_duration: 3 });
  assert.deepEqual(calls.map(req).map(({ path, body }) => ({ path, body })), [
    { path: '/bots/b1/send_message', body: { message: 'hello' } },
    { path: '/bots/b1/send_message', body: { message: 'hi', metadata: { k: 'v' } } },
    { path: '/bots/b1/send_image', body: { img: 'aGVsbG8=', display_duration: 3 } },
  ]);
});

test('speakerTimeline returns either the timeline or a download link', async () => {
  const link = { bot_id: 'b1', speaker_timeline_url: 'https://example.com/t.json', size_bytes: 8421337, truncated: false };
  const { ms, calls } = client([{ body: { chunks: [] } }, { body: link }]);
  const inline = await ms.bots.speakerTimeline('b1');
  const large = await ms.bots.speakerTimeline('b1');
  assert.equal(isSpeakerTimelineDownload(inline), false);
  assert.equal(isSpeakerTimelineDownload(large), true);
  assert.equal(large.size_bytes, 8421337);
  assert.equal(isSpeakerTimelineDownload([]), false);
  assert.equal(isSpeakerTimelineDownload(null), false);
  assert.match(calls[0].url, /\/bots\/b1\/get_speaker_timeline$/);
});

test('transcripts.getByBotId reads the bot transcript route', async () => {
  const { ms, calls } = client({ body: { transcript: [] } });
  await ms.transcripts.getByBotId('b1');
  await ms.transcripts.getByBotId('b1', { raw: true });
  assert.deepEqual(calls.map(req).map(({ path, query }) => ({ path, query })), [
    { path: '/bots/b1/get_transcript', query: { raw: 'false' } },
    { path: '/bots/b1/get_transcript', query: { raw: 'true' } },
  ]);
});

test('googleLogins.get fetches one login', async () => {
  const { ms, calls } = client({ body: {} });
  await ms.googleLogins.get('login-1');
  assert.deepEqual(req(calls[0]), { method: 'GET', path: '/google-logins/login-1', query: {}, body: undefined });
});

/* ---------------------------------------------------------- calendar */

test('calendar list, connections and disconnect use the live routes', async () => {
  const { ms, calls } = client({ body: {} });
  await ms.calendar.list();
  await ms.calendar.list({ provider: 'google', account_id: 'a@acme.com' });
  await ms.calendar.listConnections({ limit: 10, cursor: 'c1' });
  await ms.calendar.getConnection('outlook', 'a@acme.com');
  await ms.calendar.deleteConnection('google', 'a@acme.com', { purge_events: false });
  await ms.calendar.disconnect({ provider: 'google', account_id: 'a@acme.com', purge_events: false });
  const got = calls.map(req);
  assert.deepEqual(got.map(({ method, path, query }) => ({ method, path, query })), [
    { method: 'GET', path: '/calendar/calendars', query: {} },
    { method: 'GET', path: '/calendar/calendars', query: { provider: 'google', account_id: 'a@acme.com' } },
    { method: 'GET', path: '/calendar/connections', query: { limit: '10', cursor: 'c1' } },
    { method: 'GET', path: '/calendar/connections/outlook/a%40acme.com', query: {} },
    { method: 'DELETE', path: '/calendar/connections/google/a%40acme.com', query: { purge_events: 'false' } },
    { method: 'DELETE', path: '/calendar/disconnect', query: { provider: 'google', account_id: 'a@acme.com', purge_events: 'false' } },
  ]);
});

/* ------------------------------------------------------ create fields */

test('create passes the new bot fields through unchanged', async () => {
  const { ms, calls } = client({ status: 201, body: { bot_id: 'b1' } });
  const params = {
    meeting_link: 'https://zoom.us/j/123',
    bot_name: 'Notetaker',
    storage_id: 'eu-archive_1',
    zoom: { use_own_app: false },
    bot_camera_stream: { websocket_url: 'wss://signal.example.com/ws' },
    automatic_leave: { recording_permission_denied_timeout: 600 },
    recording_config: {
      video_layout: 'speaker_view_default',
      transcript: { provider: { smallest: { model: 'pulse', language: 'en', diarize: true, keywords: ['Acme'] } } },
      realtime_endpoints: [{ type: 'webhook', url: 'https://you.example.com/rt', events: ['participant_events.raise_hand', 'participant_events.lower_hand'] }],
    },
  };
  await ms.bots.create(params);
  assert.deepEqual(JSON.parse(calls[0].init.body), params);
});

test('create sends smallest_streaming with a live transcription webhook', async () => {
  const { ms, calls } = client({ status: 201, body: { bot_id: 'b1' } });
  await ms.bots.create({
    meeting_link: 'https://meet.google.com/x',
    live_transcription_required: { webhook_url: 'https://you.example.com/live' },
    recording_config: { transcript: { provider: { smallest_streaming: { model: 'pulse-2' } } } },
  });
  assert.deepEqual(JSON.parse(calls[0].init.body).recording_config.transcript.provider, { smallest_streaming: { model: 'pulse-2' } });
});

test('mia create passes an anthropic model config through', async () => {
  const { ms, calls } = client({ body: { agent_config_id: 'agent-2' } });
  const model = { provider: 'anthropic', model: 'claude-haiku-5-5', reasoning_effort: 'low', temperature: 0.4, tool_choice: 'auto' };
  await ms.mia.create({ agent_name: 'Claude agent', mode: 'pipeline', model, agent: { mcp_fail_open: false } });
  const sent = JSON.parse(calls[0].init.body);
  assert.deepEqual(sent.model, model);
  assert.equal(sent.agent.mcp_fail_open, false);
});

/* ------------------------------------------------- errors and retries */

test('a {"message"} body becomes the error message; error and bare strings are fallbacks', async () => {
  const cases = [
    [{ message: 'Manifest file not found. It may still be processing.' }, 'Manifest file not found. It may still be processing.'],
    [{ error: 'Bot not found' }, 'Bot not found'],
    ['Bot not found', 'Bot not found'],
  ];
  for (const [body, expected] of cases) {
    const { ms } = client({ status: 404, body });
    await assert.rejects(() => ms.bots.speakerTimeline('b1'), (e) => {
      assert.ok(e instanceof NotFoundError);
      assert.equal(e.message, expected);
      return true;
    });
  }
});

test('429 surfaces Retry-After, limit, window and code', async () => {
  const body = { error: 'rate_limit_exceeded', message: 'Too many bot creates.', limit: 5, window: 'minute', retry_after: 37 };
  const { ms } = client({ status: 429, body, headers: { 'retry-after': '37' } });
  await assert.rejects(() => ms.bots.create({ meeting_link: 'x' }), (e) => {
    assert.ok(e instanceof RateLimitError);
    assert.equal(e.retryAfter, 37);
    assert.equal(e.limit, 5);
    assert.equal(e.window, 'minute');
    assert.equal(e.code, 'rate_limit_exceeded');
    assert.equal(e.message, 'Too many bot creates.');
    return true;
  });
});

test('retryAfter falls back to the body, and an HTTP-date header is parsed', async () => {
  const a = client({ status: 429, body: { error: 'Rate limit exceeded', limit: 30, retry_after: 12 } });
  await assert.rejects(() => a.ms.bots.raiseHand('b1'), (e) => e instanceof RateLimitError && e.retryAfter === 12);
  const when = new Date(Date.now() + 30_000).toUTCString();
  const b = client({ status: 429, body: {}, headers: { 'retry-after': when } });
  await assert.rejects(() => b.ms.bots.status('b1'), (e) => {
    assert.ok(e.retryAfter >= 28 && e.retryAfter <= 31, `got ${e.retryAfter}`);
    return true;
  });
});

test('429 is retried after Retry-After', async () => {
  const { fetchImpl, calls } = stubFetch([
    { status: 429, body: { message: 'slow down' }, headers: { 'retry-after': '0' } },
    { status: 200, body: { ok: true } },
  ]);
  const ms = new MeetStream({ apiKey: 'k', fetch: fetchImpl, maxRetries: 2 });
  const out = await ms.bots.status('b1');
  assert.equal(out.ok, true);
  assert.equal(calls.length, 2);
});

test('a Retry-After longer than 60 seconds is thrown, not slept on', async () => {
  const { fetchImpl, calls } = stubFetch({ status: 429, body: { window: 'hour', retry_after: 1800 }, headers: { 'retry-after': '1800' } });
  const ms = new MeetStream({ apiKey: 'k', fetch: fetchImpl, maxRetries: 2 });
  await assert.rejects(() => ms.bots.create({ meeting_link: 'x' }), (e) => e instanceof RateLimitError && e.retryAfter === 1800);
  assert.equal(calls.length, 1);
});

test('a 409 with Retry-After (create still saving) is retried with the same key', async () => {
  const { fetchImpl, calls } = stubFetch([
    { status: 409, body: { error: 'A request with this Idempotency-Key is still in progress.' }, headers: { 'retry-after': '0' } },
    { status: 507, body: { bot_id: 'original' } },
  ]);
  const ms = new MeetStream({ apiKey: 'k', fetch: fetchImpl, maxRetries: 2 });
  const bot = await ms.bots.create({ meeting_link: 'x' }, { idempotencyKey: 'key-1' });
  assert.equal(bot.bot_id, 'original');
  assert.equal(calls.length, 2);
  assert.ok(calls.every((c) => c.init.headers['Idempotency-Key'] === 'key-1'));
});

test('a 409 without Retry-After is a real conflict and is not retried', async () => {
  const { fetchImpl, calls } = stubFetch({ status: 409, body: { error: 'deduplication_key already used for another meeting', existing_bot_id: 'b0' } });
  const ms = new MeetStream({ apiKey: 'k', fetch: fetchImpl, maxRetries: 2 });
  await assert.rejects(() => ms.bots.create({ meeting_link: 'x', deduplication_key: 'k' }), ConflictError);
  assert.equal(calls.length, 1);
});

/* ------------------------------------------------- webhook reason values */

test('describeStop explains failure_reason on bot.failed', () => {
  assert.match(describeStop({ event: 'bot.stopped', bot_event: 'bot.failed', bot_status: 'Failed', failure_reason: 'meeting_restricted' }), /restricted/i);
  assert.match(describeStop({ event: 'bot.stopped', bot_event: 'bot.failed', bot_status: 'Failed', failure_reason: 'sign_in_required' }), /signed-in bot/i);
  assert.match(describeStop({ event: 'bot.stopped', bot_event: 'bot.failed', bot_status: 'Failed', failure_reason: 'something_new' }), /crashed/i);
});

test('participant hand events parse like other webhooks', () => {
  const body = JSON.stringify({
    event: 'participant_events.raise_hand',
    timestamp: '2026-11-12T10:00:00Z',
    data: { data: { action: 'raise_hand', participant: { id: 'p1', name: 'Sid', is_host: false, platform: 'zoom' }, timestamp: { relative: 12.5, absolute: '2026-11-12T10:00:00Z' } }, bot: { id: 'b1' } },
  });
  const sig = createHmac('sha256', SECRET).update(body, 'utf8').digest('hex');
  const parsed = parseWebhook(body, sig, SECRET);
  assert.equal(parsed.event, 'participant_events.raise_hand');
  assert.equal(isTerminal(parsed), false);
  assert.equal(parsed.data.data.action, 'raise_hand');
});

/* ------------------------------------------------- 1.4.0: Agents API */

test('mia.get fetches one config by agent_config_id', async () => {
  const { ms, calls } = client({ body: { AgentConfigID: 'a1', AgentName: 'Helper' } });
  const cfg = await ms.mia.get('a1');
  assert.equal(cfg.AgentConfigID, 'a1');
  assert.equal(calls[0].init.method, 'GET');
  assert.match(calls[0].url, /\/api\/v1\/mia\?agent_config_id=a1$/);
});

test('mia.create sends key_source on each pipeline section and no api_key', async () => {
  const { ms, calls } = client({ status: 201, body: { agent_config_id: 'a2', message: 'created' } });
  const res = await ms.mia.create({
    agent_name: 'Inbuilt keys',
    mode: 'pipeline',
    transcriber: { provider: 'deepgram', model: 'nova-3', language: 'es', key_source: 'meetstream' },
    model: { provider: 'openai', model: 'gpt-4.1', system_prompt: 'Be brief.', key_source: 'meetstream' },
    voice: { provider: 'openai', voice_id: 'coral', key_source: 'meetstream' },
  });
  assert.equal(res.agent_config_id, 'a2');
  const body = JSON.parse(calls[0].init.body);
  assert.equal(body.transcriber.key_source, 'meetstream');
  assert.equal(body.transcriber.language, 'es');
  assert.equal(body.model.key_source, 'meetstream');
  assert.equal(body.voice.key_source, 'meetstream');
  assert.equal(body.model.api_key, undefined);
});

test('mia.create passes a local_agent model and the v1.10.0 agent options through', async () => {
  const { ms, calls } = client({ status: 201, body: { agent_config_id: 'a3' } });
  await ms.mia.create({
    agent_name: 'My agent',
    mode: 'pipeline',
    transcriber: { provider: 'deepgram', key_source: 'user' },
    voice: { provider: 'openai', voice_id: 'coral' },
    model: {
      provider: 'local_agent',
      local_agent: { url: 'https://bridge.example.com', access: 'readonly', require_code: true, timeout_s: 120 },
    },
    agent: { tools: ['screen'], chat_input: true, quiet_actions: true, speak_only_when_asked: true, desktop: false },
  });
  const body = JSON.parse(calls[0].init.body);
  assert.equal(body.model.provider, 'local_agent');
  assert.deepEqual(body.model.local_agent, { url: 'https://bridge.example.com', access: 'readonly', require_code: true, timeout_s: 120 });
  assert.deepEqual(body.agent.tools, ['screen']);
  assert.equal(body.agent.chat_input, true);
  assert.equal(body.agent.quiet_actions, true);
  assert.equal(body.agent.speak_only_when_asked, true);
});

test('mia.update PUTs the full body with agent_config_id', async () => {
  const { ms, calls } = client({ body: { message: 'updated' } });
  await ms.mia.update({ agent_config_id: 'a1', agent: { chat_input: true } });
  assert.equal(calls[0].init.method, 'PUT');
  assert.match(calls[0].url, /\/api\/v1\/mia$/);
  assert.deepEqual(JSON.parse(calls[0].init.body), { agent_config_id: 'a1', agent: { chat_input: true } });
});

test('mia.checkLocalAgent sends check=local_agent and returns the bridge status', async () => {
  const { ms, calls } = client({ body: { local_agent: { status: 'ok', latency_ms: 42, agent: 'claude', max_access: 'readonly' } } });
  const res = await ms.mia.checkLocalAgent('a3');
  assert.equal(res.local_agent.status, 'ok');
  const url = new URL(calls[0].url);
  assert.equal(url.pathname, '/api/v1/mia');
  assert.equal(url.searchParams.get('agent_config_id'), 'a3');
  assert.equal(url.searchParams.get('check'), 'local_agent');
});

test('mia.updateLive posts update_mia with wait_for_ack', async () => {
  const { ms, calls } = client({ body: { status: 'applied', bot_id: 'b1', command: 'update_mia', applied: ['system_prompt'] } });
  const res = await ms.mia.updateLive('b1', { system_prompt: 'New rules', wait_for_ack: true });
  assert.equal(res.status, 'applied');
  assert.match(calls[0].url, /\/api\/v1\/bots\/b1\/update_mia$/);
  assert.deepEqual(JSON.parse(calls[0].init.body), { system_prompt: 'New rules', wait_for_ack: true });
});

test('bots.create attaches an agent with agent_config_id only', async () => {
  const { ms, calls } = client({ status: 201, body: { bot_id: 'b9' } });
  await ms.bots.create({ meeting_link: 'https://meet.google.com/a-b-c', agent_config_id: 'a1', agent_config_params: { name: 'Ana' } });
  const body = JSON.parse(calls[0].init.body);
  assert.equal(body.agent_config_id, 'a1');
  assert.equal(body.socket_connection_url, undefined);
  assert.equal(body.live_audio_required, undefined);
});

test('isInbuiltKeysUnavailable spots the inbuilt-keys-not-on error, and only that one', async () => {
  const { ms } = client({ status: 400, body: { message: 'MeetStream-managed keys are not available for model. Use your own key.' } });
  const err = await ms.mia.create({ agent_name: 'x', mode: 'pipeline', model: { provider: 'openai', key_source: 'meetstream' } }).catch((e) => e);
  assert.ok(err instanceof BadRequestError);
  assert.equal(isInbuiltKeysUnavailable(err), true);
  assert.equal(isInbuiltKeysUnavailable(new BadRequestError('API key not configured for: openai')), false);
});

/* --------------------------------------------- 1.4.0: failed transcript */

test('a 422 failed transcript is a TranscriptFailedError with status and reason, and is not retried', async () => {
  const body = { message: 'Transcript processing failed: provider authentication was rejected. Check the API key.', transcript_status: 'Failed', transcript_id: 't1' };
  const { ms, calls } = client({ status: 422, body }, { maxRetries: 2 });
  const err = await ms.transcripts.get('t1').catch((e) => e);
  assert.ok(err instanceof TranscriptFailedError);
  assert.ok(err instanceof MeetStreamError);
  assert.equal(err.status, 422);
  assert.equal(err.transcriptStatus, 'Failed');
  assert.equal(err.transcriptId, 't1');
  assert.equal(err.reason, 'provider authentication was rejected. Check the API key.');
  assert.equal(calls.length, 1);
});

test('getByBotId and waitFor stop at once on a failed transcript', async () => {
  const body = { message: 'Transcript processing failed: the transcription provider timed out.', transcript_status: 'Failed', transcript_id: 't2' };
  const { ms, calls } = client({ status: 422, body });
  await assert.rejects(ms.transcripts.getByBotId('b1'), TranscriptFailedError);
  await assert.rejects(ms.transcripts.waitFor('t2', { intervalMs: 1, timeoutMs: 1000 }), TranscriptFailedError);
  assert.equal(calls.length, 2);
});

test('a 422 without transcript_status stays a plain MeetStreamError', async () => {
  const { ms } = client({ status: 422, body: { message: 'Unprocessable' } });
  const err = await ms.bots.status('b1').catch((e) => e);
  assert.ok(err instanceof MeetStreamError);
  assert.ok(!(err instanceof TranscriptFailedError));
  assert.equal(err.status, 422);
});

/* ------------------------------------------------------ 1.4.0: billing */

test('billing.balance reads GET /billing/balance', async () => {
  const { ms, calls } = client({ body: { customer_type: 'pay_as_you_go', balance_usd: '12.34', currency: 'USD' } });
  const bal = await ms.billing.balance();
  assert.equal(bal.balance_usd, '12.34');
  assert.equal(bal.currency, 'USD');
  assert.equal(calls[0].init.method, 'GET');
  assert.match(calls[0].url, /\/api\/v1\/billing\/balance$/);
});

test('billing.balance returns null balance_usd for an invoice account', async () => {
  const { ms } = client({ body: { customer_type: 'invoice', balance_usd: null, currency: 'USD' } });
  const bal = await ms.billing.balance();
  assert.equal(bal.balance_usd, null);
});

/* ------------------------------------- 1.4.0: Meeting Direct Connect */

test('meetingDirectConnect create, get and leave use the direct connect routes', async () => {
  const { ms, calls } = client({ body: { bot_id: 'r1' } });
  await ms.meetingDirectConnect.create({ zoom_rtms: { meeting_uuid: 'u', rtms_stream_id: 's', server_urls: 'wss://x', signature: 'sig' } });
  await ms.meetingDirectConnect.get('r1');
  await ms.meetingDirectConnect.leave('r1');
  assert.equal(calls[0].init.method, 'POST');
  assert.match(calls[0].url, /\/api\/v1\/meeting_direct_connect$/);
  assert.equal(calls[1].init.method, 'GET');
  assert.match(calls[1].url, /\/api\/v1\/meeting_direct_connect\/r1$/);
  assert.equal(calls[2].init.method, 'POST');
  assert.match(calls[2].url, /\/api\/v1\/meeting_direct_connect\/r1\/leave$/);
});

test('billing.balance maps a 404 to BalanceUnavailableError with the billing page, and does not retry', async () => {
  const { ms, calls } = client({ status: 404, body: { message: 'Route not found' } }, { maxRetries: 2 });
  const err = await ms.billing.balance().catch((e) => e);
  assert.ok(err instanceof BalanceUnavailableError);
  assert.ok(err instanceof NotFoundError);
  assert.equal(err.status, 404);
  assert.equal(err.billingUrl, 'https://app.meetstream.ai/billing');
  assert.match(err.message, /app\.meetstream\.ai\/billing/);
  assert.equal(calls.length, 1);
});

// Live shape, captured from a `meetstream` provider transcript:
// participant.name + words[].text, with no flat speaker/transcript field.
const LIVE_SEGMENTS = [
  {
    participant: { id: 100, name: 'Nav', platform: 'desktop' },
    words: [
      { text: "I'll", start_timestamp: { relative: 31.4, absolute: 31.4 }, end_timestamp: { relative: 31.6, absolute: 31.6 } },
      { text: 'write the migration doc by Friday.', start_timestamp: { relative: 32, absolute: 32 }, end_timestamp: { relative: 34, absolute: 34 } },
    ],
    language_code: 'en',
  },
  { participant: { id: 101, name: '', platform: 'desktop' }, words: [{ text: '' }] },
];

test('segment helpers read the live transcript shape', async () => {
  const { ms } = client({ body: LIVE_SEGMENTS });
  const segments = await ms.transcripts.get('tr_1');
  assert.equal(segmentSpeaker(segments[0]), 'Nav');
  assert.equal(segmentText(segments[0]), "I'll write the migration doc by Friday.");
  assert.equal(segmentStart(segments[0]), 31.4);
  assert.equal(segmentSpeaker(segments[1]), 'Unknown');
  assert.equal(segmentText(segments[1]), '');
  assert.equal(segmentStart({}), undefined);
});

test('segment helpers still read the flat speaker/transcript shape', () => {
  const flat = { speaker: 'Alice', transcript: 'hello there', start_time: 0 };
  assert.equal(segmentSpeaker(flat), 'Alice');
  assert.equal(segmentText(flat), 'hello there');
  assert.equal(segmentStart(flat), 0);
});
