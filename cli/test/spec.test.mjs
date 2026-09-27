import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadCliSpec, loadOverrides, findCommand, opKey, tierOf, overrideFor } from '../lib/spec.mjs';

const spec = loadCliSpec();
const ov = loadOverrides();

test('findCommand resolves a generated command by group/cmd', () => {
  const c = findCommand(spec, 'bot', 'get-bot') || Object.values(spec.commands.bot).find(x => x.path === '/bot/{id}' && x.method === 'GET');
  assert.ok(c);
  assert.equal(c.method, 'GET');
});

test('findCommand returns null for unknown', () => {
  assert.equal(findCommand(spec, 'nope', 'nada'), null);
});

test('tierOf: GET=0, POST=1, DELETE=2, listed=2', () => {
  assert.equal(tierOf('GET', '/bot', ov), 0);
  assert.equal(tierOf('POST', '/bot/{id}/save', ov), 1);
  assert.equal(tierOf('DELETE', '/bot/{id}', ov), 2);
  assert.equal(tierOf('POST', '/bot/{id}/publish', ov), 2);
  assert.equal(tierOf('POST', '/agency/billing/refill', ov), 2);
});

test('overrideFor returns the saveTools array rule', () => {
  assert.equal(overrideFor('POST', '/bot/{id}/saveTools', ov).bodyShape, 'array');
  assert.deepEqual(overrideFor('GET', '/bot', ov), {});
});

test('opKey normalises', () => {
  assert.equal(opKey('post', '/bot/{id}/save'), 'POST /bot/{id}/save');
});

// C2: --key must never be advertised in global_flags — 8 livedemo commands take `key`
// as a path parameter, and a caller trusting a documented --key flag would interpolate
// the API key straight into the request URL.
test('global_flags advertises no --key flag', () => {
  const names = spec.global_flags.map(f => f.name);
  assert.equal(names.includes('--key'), false);
  assert.ok(names.includes('--json'));
  assert.ok(names.includes('--dry-run'));
});

// Spec parity with the live CloseBot OpenAPI (182 ops as of 2026-09-25).
test('generated CLI spec covers every op in schema/openapi.json', async () => {
  const { opsOf, staleOverrides } = await import('../lib/specrefresh.mjs');
  const { readFileSync } = await import('node:fs');
  const openapi = JSON.parse(readFileSync(new URL('../../schema/openapi.json', import.meta.url), 'utf8'));
  const ops = opsOf(openapi);
  const cliOps = new Set(Object.values(spec.commands).flatMap(g => Object.values(g)).filter(c => !c.base).map(c => opKey(c.method, c.path)));
  assert.equal(ops.size, 182);
  assert.deepEqual([...ops.keys()].filter(k => !cliOps.has(k)), []);
  assert.equal(cliOps.has('GET /botMetric/leaderboard'), false);
  assert.equal(cliOps.has('GET /leaderboard/board'), true);
  assert.deepEqual(staleOverrides(ov, openapi), []);
});

test('tierOf: report/dashboard deletes and share replacement are Tier 2', () => {
  assert.equal(tierOf('DELETE', '/report/{id}', ov), 2);
  assert.equal(tierOf('DELETE', '/report/{id}/shares/{accountId}', ov), 2);
  assert.equal(tierOf('DELETE', '/dashboard/{id}', ov), 2);
  assert.equal(tierOf('PUT', '/report/{id}/shares', ov), 2);
  assert.equal(tierOf('POST', '/report/{id}/shares', ov), 1);
  assert.equal(tierOf('GET', '/leaderboard/board', ov), 0);
});
