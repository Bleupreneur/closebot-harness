import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, statSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { runInit } from '../lib/init.mjs';

function repo() {
  const d = mkdtempSync(join(tmpdir(), 'cb-init-'));
  mkdirSync(join(d, 'cli'));
  writeFileSync(join(d, '.env.example'), 'CLOSEBOT_API_KEY=\n');
  writeFileSync(join(d, 'cli', 'sandbox.example.json'), '{"bots":["bot_SANDBOXXXXXXXXXX"]}\n');
  writeFileSync(join(d, 'cb.config.example.json'), '{"templateBot":"bot_XXXXXXXXXXXXXXXX"}\n');
  return d;
}

test('init creates .env from the example with mode 600', () => {
  const d = repo();
  const r = runInit({ repoDir: d });
  assert.equal(r.ok, true);
  assert.equal(r.actions[0].status, 'created');
  assert.equal(statSync(join(d, '.env')).mode & 0o777, 0o600);
  assert.equal(existsSync(join(d, 'cli', 'sandbox.json')), false, 'sandbox.json only with --sandbox');
  assert.equal(existsSync(join(d, 'cb.config.json')), false, 'cb.config.json only with --template');
});

test('init never overwrites existing files', () => {
  const d = repo();
  writeFileSync(join(d, '.env'), 'CLOSEBOT_API_KEY=cb_mine\n');
  writeFileSync(join(d, 'cli', 'sandbox.json'), '{"bots":["bot_MINE"]}');
  writeFileSync(join(d, 'cb.config.json'), '{"templateBot":"bot_MINE"}');
  const r = runInit({ repoDir: d, sandbox: true, template: 'bot_OTHER' });
  assert.deepEqual(r.actions.map(a => a.status), ['kept', 'kept', 'kept']);
  assert.equal(readFileSync(join(d, '.env'), 'utf8'), 'CLOSEBOT_API_KEY=cb_mine\n');
  assert.equal(readFileSync(join(d, 'cli', 'sandbox.json'), 'utf8'), '{"bots":["bot_MINE"]}');
  assert.equal(readFileSync(join(d, 'cb.config.json'), 'utf8'), '{"templateBot":"bot_MINE"}');
  assert.ok(!JSON.stringify(r).includes('cb_mine'), 'init must never echo the key');
});

test('init --sandbox and --template create their files', () => {
  const d = repo();
  const r = runInit({ repoDir: d, sandbox: true, template: 'bot_ABC123' });
  assert.equal(r.ok, true);
  assert.ok(existsSync(join(d, 'cli', 'sandbox.json')));
  assert.equal(JSON.parse(readFileSync(join(d, 'cb.config.json'), 'utf8')).templateBot, 'bot_ABC123');
});

test('init --template rejects a malformed id', () => {
  const d = repo();
  const r = runInit({ repoDir: d, template: true });
  assert.equal(r.ok, false);
  assert.equal(existsSync(join(d, 'cb.config.json')), false);
});
