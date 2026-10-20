import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { buildUrl, redact, request } from '../lib/http.mjs';
import { loadOverrides } from '../lib/spec.mjs';

const ov = loadOverrides();
const fx = JSON.parse(readFileSync(new URL('./fixtures/sources.json', import.meta.url)));
// Captures only the FIRST call: some ops (e.g. POST /library/files) have a `followUp`
// override that fires a second request through the same fetchImpl, which would otherwise
// clobber the captured init before assertions run against the original request.
const mock = (status, body, capture = {}) => async (url, init) => {
  if (capture.url === undefined) { capture.url = url; capture.init = init; }
  return { status, ok: status < 300, text: async () => (typeof body === 'string' ? body : JSON.stringify(body)) };
};

test('buildUrl fills path params and query', () => {
  assert.equal(buildUrl('https://api.closebot.com', '/bot/{id}/steps', { id: 'bot_1' }, { botVersion: '0.0.3' }),
    'https://api.closebot.com/bot/bot_1/steps?botVersion=0.0.3');
});

test('redact replaces sensitive keys deeply', () => {
  const r = redact({ a: { accessToken: 'x', list: [{ token: 'y', ok: 1 }] } }, ov.redactFields);
  assert.equal(r.a.accessToken, '***'); assert.equal(r.a.list[0].token, '***'); assert.equal(r.a.list[0].ok, 1);
});

test('GET /agency/source projects safe fields and never leaks the JWT', async () => {
  const cap = {};
  const res = await request({ method: 'GET', base: 'https://api.closebot.com', path: '/agency/source', key: 'cb_k', overrides: ov, fetchImpl: mock(200, fx, cap) });
  assert.equal(cap.init.headers['X-CB-KEY'], 'cb_k');
  assert.deepEqual(res.data, [{ sourceId: 'src_A', name: 'Acme', category: 'GHL', timezone: 'America/Chicago' }]);
  assert.equal(JSON.stringify(res).includes('SECRET'), false);
});

test('saveTools sends a raw array even if given an object', async () => {
  const cap = {};
  await request({ method: 'POST', base: 'https://api.closebot.com', path: '/bot/{id}/saveTools', params: { id: 'b' }, body: { type: 'Email', enabled: true }, key: 'k', overrides: ov, fetchImpl: mock(200, [], cap) });
  assert.ok(Array.isArray(JSON.parse(cap.init.body)));
});

test('steps without botVersion is refused before any network call', async () => {
  let called = false;
  const res = await request({ method: 'GET', base: 'https://api.closebot.com', path: '/bot/{id}/steps', params: { id: 'b' }, query: {}, key: 'k', overrides: ov, fetchImpl: async () => { called = true; } });
  assert.equal(called, false); assert.equal(res.ok, false); assert.match(res.note, /botVersion/);
});

test('expectedStatus 404 on webscrape view is not a surprise', async () => {
  let surprised = 0;
  const res = await request({ method: 'GET', base: 'https://api.closebot.com', path: '/library/files/{fileId}/view', params: { fileId: 'f' }, key: 'k', overrides: ov, fetchImpl: mock(404, 'not found'), onSurprise: () => surprised++ });
  assert.equal(res.expected, true); assert.equal(surprised, 0);
});

test('400 with shape hint triggers onSurprise with redacted excerpt', async () => {
  const seen = [];
  await request({ method: 'POST', base: 'https://api.closebot.com', path: '/bot/{id}/save', params: { id: 'b' }, body: { botSteps: {} }, key: 'k', overrides: ov, fetchImpl: mock(400, { error: 'could not be converted to List<X>' }), onSurprise: s => seen.push(s) });
  assert.equal(seen.length, 1); assert.equal(seen[0].opKey, 'POST /bot/{id}/save'); assert.equal(seen[0].status, 400);
});

test('live message 420 maps to a named, non-error result', async () => {
  const res = await request({ method: 'POST', base: 'https://api.closebot.ai', path: '/message', body: { id: 'c' }, key: 'k', overrides: ov, fetchImpl: mock(420, '') });
  assert.equal(res.expected, true); assert.match(res.note, /No Credits/);
});

test('unexpected 401 body is redacted before it reaches the caller', async () => {
  const res = await request({ method: 'GET', base: 'https://api.closebot.com', path: '/bot', key: 'k', overrides: ov, fetchImpl: mock(401, { error: 'bad key', accessToken: 'eyJ.SECRET.jwt' }) });
  assert.equal(res.ok, false);
  assert.equal(res.data.accessToken, '***');
  assert.equal(JSON.stringify(res).includes('SECRET'), false);
});

test('dryRun prints and does not call fetch', async () => {
  let called = false;
  const res = await request({ method: 'DELETE', base: 'https://api.closebot.com', path: '/bot/{id}', params: { id: 'b' }, key: 'k', overrides: ov, fetchImpl: async () => { called = true; }, dryRun: true });
  assert.equal(called, false); assert.equal(res.ok, true); assert.equal(res.data.headers['X-CB-KEY'], '***');
});

test('multipart omits JSON content-type and passes FormData through', async () => {
  const cap = {}; const fd = new FormData(); fd.append('file', new Blob(['x']), 'a.txt');
  await request({ method: 'POST', base: 'https://api.closebot.com', path: '/library/files', body: fd, multipart: true, key: 'k', overrides: ov, fetchImpl: mock(200, { id: 'file_1', fileId: 'file_1' }, cap) });
  assert.equal(cap.init.headers['Content-Type'], undefined); assert.equal(cap.init.body, fd);
});

// Ledger #27: object-shaped surprise bodies were unbounded (only string bodies were
// capped at 300 chars), and gotchas/auto.jsonl is tracked in git.
test('onSurprise bodyExcerpt is capped at 300 chars for a large object body', async () => {
  const seen = [];
  const bigError = { error: 'could not be converted to List<X>', detail: 'x'.repeat(2000) };
  await request({ method: 'POST', base: 'https://api.closebot.com', path: '/bot/{id}/save', params: { id: 'b' }, body: { botSteps: {} }, key: 'k', overrides: ov, fetchImpl: mock(400, bigError), onSurprise: s => seen.push(s) });
  assert.equal(seen.length, 1);
  assert.equal(typeof seen[0].bodyExcerpt, 'string');
  assert.ok(seen[0].bodyExcerpt.length <= 300);
});

test('onSurprise bodyExcerpt redacts secret fields before capping', async () => {
  const seen = [];
  const bigError = { error: 'could not be converted to List<X>', accessToken: 'eyJ.SECRET.jwt', detail: 'x'.repeat(2000) };
  await request({ method: 'POST', base: 'https://api.closebot.com', path: '/bot/{id}/save', params: { id: 'b' }, body: { botSteps: {} }, key: 'k', overrides: ov, fetchImpl: mock(400, bigError), onSurprise: s => seen.push(s) });
  assert.equal(seen[0].bodyExcerpt.includes('SECRET'), false);
});

// Ledger #23: a clientFilter override must not fail open on a non-array response —
// silently returning everything as if already filtered would, e.g., make `kb verify`
// count every file in the account as attached to the queried source.
test('clientFilter does not silently filter (or pass through as filtered) a non-array response', async () => {
  const envelope = { total: 1, results: [{ fileId: 'file_1', sources: [{ id: 'src_A' }] }] };
  const res = await request({ method: 'GET', base: 'https://api.closebot.com', path: '/library/files', query: { sourceId: 'src_A' }, key: 'k', overrides: ov, fetchImpl: mock(200, envelope) });
  assert.deepEqual(res.data, envelope);
  assert.match(res.note, /clientFilter/);
  assert.match(res.note, /UNFILTERED/);
});

// Ledger #32: followUp and --unsafe-raw had no direct coverage.
test('followUp chains a GET after a 204 response and matches the created record by matchField', async () => {
  const calls = [];
  const fetchImpl = async (url, init) => {
    calls.push({ url, method: init.method });
    if (init.method === 'POST') return { status: 204, ok: true, text: async () => '' };
    return { status: 200, ok: true, text: async () => JSON.stringify([{ id: 'faq_1', question: 'Q1' }, { id: 'faq_2', question: 'Q2' }]) };
  };
  const res = await request({ method: 'POST', base: 'https://api.closebot.com', path: '/smart-faq', body: { sourceId: 'src_A', question: 'Q2', answer: 'A2' }, key: 'k', overrides: ov, fetchImpl });
  assert.equal(calls.length, 2);
  assert.equal(calls[1].method, 'GET');
  assert.equal(res.data.id, 'faq_2');
});

test('--unsafe-raw skips redaction and source projection, exposing raw fields', async () => {
  const res = await request({ method: 'GET', base: 'https://api.closebot.com', path: '/agency/source', key: 'k', overrides: ov, unsafeRaw: true, fetchImpl: mock(200, fx) });
  assert.deepEqual(res.data, fx);
  assert.equal(res.data.results[0].accessToken, 'eyJ.SECRET.jwt');
});

test('maxTimeMs bounds a slow response body read, not just the initial fetch', async () => {
  const slowMock = async (url, init) => ({
    status: 200, ok: true,
    text: () => new Promise((_resolve, reject) => {
      init.signal.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError')));
    }),
  });
  await assert.rejects(
    request({ method: 'GET', base: 'https://api.closebot.com', path: '/bot', key: 'k', overrides: ov, fetchImpl: slowMock, maxTimeMs: 200 }),
    /AbortError|aborted/i,
  );
});

test('redaction covers channel auth tokens and other secret fields', () => {
  const r = redact({ channels: [{ name: 'web', authToken: 'a', externalApiKey: 'b', clientSecret: 'c' }] }, ov.redactFields);
  assert.deepEqual(r.channels[0], { name: 'web', authToken: '***', externalApiKey: '***', clientSecret: '***' });
});
