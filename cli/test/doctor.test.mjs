import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, chmodSync, copyFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { runDoctor, formatDoctor, SWAGGER_URL } from '../lib/doctor.mjs';
import { loadOverrides } from '../lib/spec.mjs';
import { REPO_DIR } from '../lib/config.mjs';

const overrides = loadOverrides();
// A throwaway repo dir with just what doctor reads: schema/openapi.json (+ optional .env).
function repo({ env = null, mode = 0o600 } = {}) {
  const d = mkdtempSync(join(tmpdir(), 'cb-doc-'));
  mkdirSync(join(d, 'schema')); mkdirSync(join(d, 'cli'));
  copyFileSync(join(REPO_DIR, 'schema', 'openapi.json'), join(d, 'schema', 'openapi.json'));
  if (env !== null) { writeFileSync(join(d, '.env'), env); chmodSync(join(d, '.env'), mode); }
  return d;
}
const noNet = async () => { throw new Error('network disabled in test'); };
const byName = (r, n) => r.checks.find(c => c.name === n);

test('doctor fails cleanly with no .env and no key', async () => {
  const r = await runDoctor({ repoDir: repo(), env: {}, fetchImpl: noNet, overrides, nodeVersion: '22.1.0' });
  assert.equal(r.ok, false);
  assert.equal(byName(r, '.env').status, 'fail');
  assert.equal(byName(r, 'api key').status, 'fail');
  assert.equal(byName(r, 'key valid').status, 'fail');
  assert.equal(byName(r, 'spec drift').status, 'warn'); // network failure is only a warning
  assert.match(formatDoctor(r), /^\[ok\]\s+node/m);
});

test('doctor flags a world-readable .env', async () => {
  const r = await runDoctor({ repoDir: repo({ env: 'CLOSEBOT_API_KEY=cb_live_abcdef\n', mode: 0o644 }), env: {}, fetchImpl: noNet, overrides, offline: true });
  assert.equal(byName(r, '.env').status, 'fail');
  assert.match(byName(r, '.env').detail, /chmod 600/);
});

test('doctor reports a .env with no key', async () => {
  const r = await runDoctor({ repoDir: repo({ env: 'CLOSEBOT_API_KEY=\n' }), env: {}, fetchImpl: noNet, overrides, offline: true });
  assert.equal(byName(r, '.env').status, 'ok');
  assert.equal(byName(r, 'api key').status, 'fail');
  assert.equal(r.ok, false);
});

test('doctor passes with a valid key and never prints it', async () => {
  const secret = 'cb_live_SUPERSECRETVALUE';
  const fetchImpl = async (url) => {
    if (url === SWAGGER_URL) return new Response(JSON.stringify({ paths: { '/bot': { get: {} } } }), { status: 200 });
    if (url.endsWith('/agency/current')) return new Response(JSON.stringify({ name: 'Acme Growth Agency' }), { status: 200 });
    if (url.includes('/bot/')) return new Response(JSON.stringify({ name: 'Template' }), { status: 200 });
    return new Response('{}', { status: 404 });
  };
  const d = repo({ env: `CLOSEBOT_API_KEY=${secret}\nCB_TEMPLATE_BOT=bot_TEMPLATE1\n` });
  const r = await runDoctor({ repoDir: d, env: {}, fetchImpl, overrides });
  assert.equal(r.ok, true, JSON.stringify(r.checks));
  assert.equal(byName(r, 'agency').detail, 'Acme Growth Agency');
  assert.equal(byName(r, 'spec drift').status, 'warn'); // 1 live op vs 182 local
  assert.equal(byName(r, 'template bot').status, 'ok');
  assert.ok(!JSON.stringify(r).includes(secret));
  assert.ok(!formatDoctor(r).includes('SUPERSECRET'));
});

test('doctor fails on a rejected key (401)', async () => {
  const fetchImpl = async () => new Response('{"message":"unauthorized"}', { status: 401 });
  const r = await runDoctor({ repoDir: repo({ env: 'CLOSEBOT_API_KEY=cb_bad\n' }), env: {}, fetchImpl, overrides, offline: true });
  assert.equal(byName(r, 'key valid').status, 'fail');
  assert.match(byName(r, 'key valid').detail, /401/);
});

test('doctor fails on Node < 22', async () => {
  const r = await runDoctor({ repoDir: repo(), env: {}, fetchImpl: noNet, overrides, offline: true, nodeVersion: '20.11.0' });
  assert.equal(byName(r, 'node').status, 'fail');
});

test('doctor warns on a placeholder sandbox.json', async () => {
  const d = repo();
  copyFileSync(join(REPO_DIR, 'cli', 'sandbox.example.json'), join(d, 'cli', 'sandbox.json'));
  const r = await runDoctor({ repoDir: d, env: {}, fetchImpl: noNet, overrides, offline: true });
  assert.equal(byName(r, 'sandbox').status, 'warn');
  assert.match(byName(r, 'sandbox').detail, /placeholder/);
});
