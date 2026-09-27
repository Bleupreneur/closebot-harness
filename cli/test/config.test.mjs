import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { parseEnvFile, loadApiKey, findApiKey, loadTemplateBot, isSandbox, mask } from '../lib/config.mjs';

// Public release: the ~/.env.secrets fallback is gone — env var, then <repo>/.env only.
test('the default key search path does not include ~/.env.secrets', () => {
  assert.doesNotMatch(findApiKey.toString(), /env\.secrets/);
  assert.equal(findApiKey({}, []).key, null);
});

test('findApiKey reports where the key came from', () => {
  const d = mkdtempSync(join(tmpdir(), 'cb-'));
  const f = join(d, 'x.env'); writeFileSync(f, 'CLOSEBOT_API_KEY=cb_file\n');
  assert.deepEqual(findApiKey({ CLOSEBOT_API_KEY: 'cb_env' }, [f]), { key: 'cb_env', source: 'env:CLOSEBOT_API_KEY' });
  assert.deepEqual(findApiKey({}, [f]), { key: 'cb_file', source: f });
});

test('loadTemplateBot: env, then .env, then cb.config.json; placeholder counts as unset', () => {
  const d = mkdtempSync(join(tmpdir(), 'cb-'));
  assert.equal(loadTemplateBot({}, d), null);
  writeFileSync(join(d, 'cb.config.json'), '{"templateBot":"bot_XXXXXXXXXXXXXXXX"}');
  assert.equal(loadTemplateBot({}, d), null);
  writeFileSync(join(d, 'cb.config.json'), '{"templateBot":"bot_FROMCONFIG"}');
  assert.equal(loadTemplateBot({}, d), 'bot_FROMCONFIG');
  writeFileSync(join(d, '.env'), 'CB_TEMPLATE_BOT=bot_FROMDOTENV\n');
  assert.equal(loadTemplateBot({}, d), 'bot_FROMDOTENV');
  assert.equal(loadTemplateBot({ CB_TEMPLATE_BOT: 'bot_FROMENV' }, d), 'bot_FROMENV');
});

test('parseEnvFile handles export, quotes, comments', () => {
  const out = parseEnvFile(`# c\nexport CLOSEBOT_API_KEY="cb_abc"\nOTHER='x'\nBARE=y\n`);
  assert.deepEqual(out, { CLOSEBOT_API_KEY: 'cb_abc', OTHER: 'x', BARE: 'y' });
});

test('loadApiKey prefers env, then first file with the key', () => {
  const d = mkdtempSync(join(tmpdir(), 'cb-'));
  const f1 = join(d, 'a.env'); writeFileSync(f1, 'NOPE=1\n');
  const f2 = join(d, 'b.env'); writeFileSync(f2, 'CLOSEBOT_API_KEY=cb_file\n');
  assert.equal(loadApiKey({ CLOSEBOT_API_KEY: 'cb_env' }, [f1, f2]), 'cb_env');
  assert.equal(loadApiKey({}, [f1, f2]), 'cb_file');
  assert.equal(loadApiKey({}, [f1]), null);
});

test('isSandbox reads allowlist', () => {
  const d = mkdtempSync(join(tmpdir(), 'cb-'));
  const p = join(d, 'sandbox.json');
  writeFileSync(p, JSON.stringify({ bots: ['bot_OK'], sources: ['src_OK'] }));
  assert.equal(isSandbox('bot_OK', p), true);
  assert.equal(isSandbox('src_OK', p), true);
  assert.equal(isSandbox('bot_NOTINLIST000001', p), false);
});

test('isSandbox is false when the allowlist file is absent', () => {
  const d = mkdtempSync(join(tmpdir(), 'cb-'));
  assert.equal(isSandbox('bot_OK', join(d, 'missing.json')), false);
});

test('mask never reveals the key', () => {
  assert.equal(mask('cb_secret'), '***');
});

// Ledger #21: mask() used to declare zero parameters even though every call site passes
// the key, which misleads a reader into thinking the key is unavailable to it.
test('mask declares the key parameter it documents (arity 1) and still masks with none', () => {
  assert.equal(mask.length, 1);
  assert.equal(mask(), '***');
});
