import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, mkdtempSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { request } from '../lib/http.mjs';
import { loadOverrides } from '../lib/spec.mjs';
import { buildMap, renderMarkdown, renderMermaid, writeMap, frameworkParity, slugify, pool } from '../lib/map.mjs';

const FX = JSON.parse(readFileSync(new URL('./fixtures/map-account.json', import.meta.url)));
const overrides = loadOverrides();

// Mocked HTTP: routes on URL pathname, records every request, and lets a test force a
// status per path. Goes through the real request() so overrides + redaction are exercised.
function mockCtx({ status = {} } = {}) {
  const seen = [];
  const fetchImpl = async (url, init) => {
    const u = new URL(url);
    seen.push({ method: init.method, path: u.pathname, query: Object.fromEntries(u.searchParams) });
    const forced = status[u.pathname];
    if (forced) return new Response(JSON.stringify({ error: 'boom' }), { status: forced });
    if (!(u.pathname in FX)) return new Response('not found', { status: 404 });
    return new Response(JSON.stringify(FX[u.pathname]), { status: 200 });
  };
  const read = o => request({ key: 'cb_test', overrides, fetchImpl, ...o });
  return { ctx: { overrides, read, call: read }, seen };
}
const NOW = new Date('2026-09-25T12:00:00Z');

test('buildMap builds the full inventory from fixtures', async () => {
  const { ctx, seen } = mockCtx({ status: { '/bot/bot_EXAMPLE3/steps': 500 } });
  const m = await buildMap(ctx, { now: NOW });
  assert.equal(m.agency.name, 'Acme Growth Agency');
  assert.equal(m.agency.memberCount, 1);
  assert.deepEqual(m.counts, { sources: 3, bots: 3, personas: 1, libraryFiles: 2, smartFaqs: 2, dashboards: 1, reports: 1 });

  const a = m.sources.find(s => s.id === 'src_EXAMPLEA');
  assert.deepEqual(a.channels, ['SMS', 'FB']);
  assert.equal(a.topicsEnabled, true);
  assert.deepEqual(a.knowledge, { libraryFiles: 2, libraryNotReady: 1, fileTypes: { pdf: 1, text: 1 }, smartFaqs: 2, smartFaqsUnanswered: 1 });

  const b1 = m.bots.find(b => b.id === 'bot_EXAMPLE1');
  assert.equal(b1.live, '0.0.3'); assert.equal(b1.target, '0.0.4'); assert.equal(b1.targetPublished, false);
  assert.deepEqual(b1.personas, [{ id: 'per_EXAMPLE1', name: 'Friendly Front Desk' }]);
  assert.equal(b1.steps.version, '0.0.4');
  assert.equal(b1.steps.nodeCount, 6);
  assert.deepEqual(b1.steps.histogram, { Method: 3, MultiObjective: 1, ScenarioKeyword: 1, Source: 1 });
  assert.equal(b1.steps.framework.on_framework, true);
  assert.deepEqual(b1.knowledge, { libraryFiles: 2, smartFaqs: 2 });

  // steps are fetched for the edit target, with botVersion (requiredQuery) set
  assert.ok(seen.some(r => r.path === '/bot/bot_EXAMPLE1/steps' && r.query.botVersion === '0.0.4'));
  // only GETs, ever
  assert.ok(seen.every(r => r.method === 'GET'));
  // source listing is paged from 0 with the max page size
  assert.ok(seen.some(r => r.path === '/agency/source' && r.query.page === '0' && r.query.pageSize === '100'));

  const codes = m.issues.map(i => `${i.code}:${i.subject.match(/\((\w+)\)$/)?.[1]}`);
  for (const c of ['NO_PERSONA:bot_EXAMPLE2', 'NEVER_PUBLISHED:bot_EXAMPLE2', 'DRAFT_NEWER_THAN_LIVE:bot_EXAMPLE1',
    'NO_KB:bot_EXAMPLE2', 'FRAMEWORK_GAP:bot_EXAMPLE2', 'ORPHAN_NODE:bot_EXAMPLE2', 'LIBRARY_OFF:bot_EXAMPLE1',
    'NO_SOURCE:bot_EXAMPLE3', 'SOURCE_NO_BOT:src_EXAMPLEC', 'SOURCE_DISCONNECTED:src_EXAMPLEB', 'KB_NOT_READY:src_EXAMPLEA']) {
    assert.ok(codes.includes(c), `missing issue ${c}; got ${codes.join(', ')}`);
  }
  assert.equal(m.issues[0].severity, 'FAIL');
});

test('buildMap tolerates a 500 on one bot and keeps going', async () => {
  const { ctx } = mockCtx({ status: { '/bot/bot_EXAMPLE3/steps': 500 } });
  const m = await buildMap(ctx, { now: NOW });
  const b3 = m.bots.find(b => b.id === 'bot_EXAMPLE3');
  assert.equal(b3.steps, null);
  assert.equal(m.errors.length, 1);
  assert.deepEqual({ op: m.errors[0].op, status: m.errors[0].status, params: m.errors[0].params }, { op: 'GET /bot/{id}/steps', status: 500, params: { id: 'bot_EXAMPLE3' } });
  // the other bots still got their steps
  assert.ok(m.bots.find(b => b.id === 'bot_EXAMPLE2').steps);
  assert.match(renderMarkdown(m), /## Errors \(map continued past these\)/);
});

test('buildMap --bot scopes to one bot and its sources', async () => {
  const { ctx, seen } = mockCtx();
  const m = await buildMap(ctx, { botId: 'bot_EXAMPLE1', now: NOW });
  assert.deepEqual(m.scope, { bot: 'bot_EXAMPLE1' });
  assert.deepEqual(m.bots.map(b => b.id), ['bot_EXAMPLE1']);
  assert.deepEqual(m.sources.map(s => s.id), ['src_EXAMPLEA']);
  assert.ok(!seen.some(r => r.path === '/bot'), 'scoped run must not list every bot');
  assert.ok(!seen.some(r => r.path.startsWith('/bot/bot_EXAMPLE2')));
  assert.ok(seen.some(r => r.path === '/bot/bot_EXAMPLE1'));
});

test('--no-steps skips job-flow reads; --metrics adds 30-day counts', async () => {
  const { ctx, seen } = mockCtx();
  const m = await buildMap(ctx, { steps: false, metrics: true, now: NOW });
  assert.ok(!seen.some(r => r.path.endsWith('/steps')));
  assert.ok(m.bots.every(b => b.steps === null));
  assert.equal(m.metrics.agencySummary.currentMonthMessageCount, 120);
  assert.equal(m.sources[0].messages30d, 42);
  assert.equal(m.bots[0].metrics.actions30d, 7);
  const mc = seen.find(r => r.path === '/botMetric/messageCount');
  assert.equal(mc.query.end, '2026-09-25T12:00:00.000Z');
  assert.equal(mc.query.start, '2026-08-26T12:00:00.000Z');
});

test('map output never contains secrets, member emails, FAQ text or lead ids', async () => {
  const { ctx } = mockCtx();
  const m = await buildMap(ctx, { metrics: true, now: NOW });
  const all = JSON.stringify(m) + renderMarkdown(m) + renderMermaid(m);
  for (const bad of ['SECRET', 'pat@example.com', 'Pat Example', 'insurance', 'lead_PII', 'srckey']) assert.ok(!all.includes(bad), `leaked ${bad}`);
});

test('template bot adds node-type gap findings', async () => {
  const { ctx } = mockCtx();
  const m = await buildMap(ctx, { templateBot: 'bot_EXAMPLE1', now: NOW });
  assert.equal(m.template.found, true);
  const gap = m.issues.find(i => i.code === 'NODE_TYPE_GAP' && i.subject.includes('bot_EXAMPLE2'));
  assert.match(gap.message, /MultiObjective/);
  assert.ok(!m.issues.some(i => i.code === 'NODE_TYPE_GAP' && i.subject.includes('bot_EXAMPLE1')));
});

test('writeMap writes map.json, MAP.md and map.mmd', async () => {
  const { ctx } = mockCtx();
  const m = await buildMap(ctx, { now: NOW });
  const dir = join(mkdtempSync(join(tmpdir(), 'cb-map-')), `${slugify(m.agency.name)}-2026-09-25`);
  writeMap(m, dir);
  for (const f of ['map.json', 'MAP.md', 'map.mmd']) assert.ok(existsSync(join(dir, f)), f);
  assert.match(dir, /acme-growth-agency-2026-09-25$/);
  const md = readFileSync(join(dir, 'MAP.md'), 'utf8');
  assert.match(md, /^# CloseBot system map: Acme Growth Agency/);
  assert.match(md, /## Flagged issues/);
  const mmd = readFileSync(join(dir, 'map.mmd'), 'utf8');
  assert.match(mmd, /^graph LR/);
  assert.match(mmd, /S0 --> B0/);
});

test('every read failing still returns a map with errors, not a throw', async () => {
  const ctx = { overrides, read: async () => ({ ok: false, status: 401, data: null }) };
  const m = await buildMap(ctx, { now: NOW });
  assert.equal(m.agency, null);
  assert.ok(m.errors.length >= 5);
});

test('frameworkParity matches by title intent', () => {
  assert.equal(frameworkParity({ nodes: [] }).on_framework, false);
  const p = frameworkParity({ nodes: [
    { type: 'Method', data: { Title: 'general info collection' } }, { type: 'Method', data: { Title: 'Booking Agent 2' } },
    { type: 'Method', data: { Title: 'Booking Readiness Agent' } }, { type: 'MultiObjective', data: { Objectives: [{ Name: 'Pricing questions' }] } }] });
  assert.equal(p.on_framework, true);
});

test('pool never runs more than the limit at once', async () => {
  let active = 0, peak = 0;
  const out = await pool([1, 2, 3, 4, 5, 6, 7], 3, async x => { active++; peak = Math.max(peak, active); await new Promise(r => setTimeout(r, 5)); active--; return x * 2; });
  assert.deepEqual(out, [2, 4, 6, 8, 10, 12, 14]);
  assert.equal(peak, 3);
});
