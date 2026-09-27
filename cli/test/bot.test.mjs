import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { canonicalSteps, stepsEqual, pushSteps } from '../lib/bot.mjs';
const fx = n => JSON.parse(readFileSync(new URL(`./fixtures/${n}`, import.meta.url)));

test('canonicalSteps strips UI-only node keys', () => {
  const c = canonicalSteps(fx('steps-min.json'));
  assert.equal('position' in c.nodes[0], false); assert.equal('selected' in c.nodes[0], false);
  assert.equal(c.nodes[0].data.Title, 'General Info Collection');
});

test('stepsEqual ignores UI keys but detects content change', () => {
  const a = fx('steps-min.json'); const b = fx('steps-min.json');
  b.nodes[0].position = { x: 99, y: 99 };
  assert.equal(stepsEqual(a, b), true);
  b.nodes[0].data.Instructions = 'changed';
  assert.equal(stepsEqual(a, b), false);
});

// I2: canonicalSteps used to allowlist exactly 5 top-level keys, so a server dropping or
// mangling a sibling like mcpServers still passed the landed check. It must now compare
// every top-level key.
test('stepsEqual detects a difference in a sibling key canonicalSteps never used to look at', () => {
  const a = fx('steps-min.json'); const b = fx('steps-min.json');
  a.mcpServers = { srv1: { url: 'https://a.example.com' } };
  b.mcpServers = { srv1: { url: 'https://b.example.com' } };
  assert.equal(stepsEqual(a, b), false);
});

test('stepsEqual is true when only top-level key insertion order differs', () => {
  const base = fx('steps-min.json');
  base.mcpServers = { srv1: { url: 'https://a.example.com', enabled: true } };
  const a = { nodes: base.nodes, edges: base.edges, variables: base.variables, customTools: base.customTools, enabledGlobalToolNames: base.enabledGlobalToolNames, mcpServers: base.mcpServers };
  // Same data, keys inserted in reverse order (including inside the nested mcpServers object).
  const b = { mcpServers: { srv1: { enabled: true, url: 'https://a.example.com' } }, enabledGlobalToolNames: base.enabledGlobalToolNames, customTools: base.customTools, variables: base.variables, edges: base.edges, nodes: base.nodes };
  assert.equal(stepsEqual(a, b), true);
});

test('pushSteps: save then re-pull; landed=false when content reverted (UI autosave clobber)', async () => {
  const sent = fx('steps-min.json'); sent.nodes[0].data.Instructions = 'NEW';
  const calls = [];
  const ctx = { call: async (o) => {
    calls.push(`${o.method} ${o.path}`);
    if (o.method === 'POST') return { ok: true, status: 200, data: { version: '0.0.14', invalidPaths: [] } };
    return { ok: true, status: 200, data: fx('steps-min.json') }; // old content comes back
  } };
  const r = await pushSteps(ctx, 'bot_X', sent);
  assert.deepEqual(calls, ['POST /bot/{id}/save', 'GET /bot/{id}/steps']);
  assert.equal(r.savedVersion, '0.0.14'); assert.equal(r.landed, false);
});

test('pushSteps: landed=true when re-pull matches', async () => {
  const sent = fx('steps-min.json');
  const ctx = { call: async (o) => o.method === 'POST' ? { ok: true, status: 200, data: { version: '0.0.14', invalidPaths: [] } } : { ok: true, status: 200, data: sent } };
  assert.equal((await pushSteps(ctx, 'bot_X', sent)).landed, true);
});

test('pushSteps: re-pull failure is reported distinctly from a content-mismatch clobber', async () => {
  const sent = fx('steps-min.json');
  const ctx = { call: async (o) => o.method === 'POST' ? { ok: true, status: 200, data: { version: '0.0.14', invalidPaths: [] } } : { ok: false, status: 500, data: null } };
  const r = await pushSteps(ctx, 'bot_X', sent);
  assert.equal(r.landed, false);
  assert.equal(r.repullOk, false);
  assert.equal(r.repullStatus, 500);
});
