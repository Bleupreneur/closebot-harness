import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { readFileSync, writeFileSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
const CB = fileURLToPath(new URL('../cb', import.meta.url));
const run = (args, env = {}) => spawnSync('node', [CB, ...args], { encoding: 'utf8', env: { ...process.env, CLOSEBOT_API_KEY: 'cb_test', ...env } });

// First-run commands: discoverable from top-level help, --help works without a key, and
// map fails cleanly (exit 2, no stack trace) on a fresh clone with no key.
const NOKEY = { PATH: process.env.PATH, HOME: '/nonexistent', CB_NO_REPO_ENV: '1' };
test('cb --help lists init, doctor and map', () => {
  const r = spawnSync('node', [CB, '--help'], { encoding: 'utf8', env: NOKEY });
  assert.equal(r.status, 0, r.stderr);
  for (const c of ['init', 'doctor', 'map']) assert.match(r.stdout, new RegExp(`^${c}\\s`, 'm'));
});

test('cb map --help and cb help doctor print usage without a key', () => {
  const a = spawnSync('node', [CB, 'map', '--help'], { encoding: 'utf8', env: NOKEY });
  assert.equal(a.status, 0, a.stderr); assert.match(a.stdout, /--no-steps/);
  const b = spawnSync('node', [CB, 'help', 'doctor'], { encoding: 'utf8', env: NOKEY });
  assert.equal(b.status, 0, b.stderr); assert.match(b.stdout, /\[ok\] \[warn\] \[fail\]/);
});

test('cb map without a key exits 2 with the setup hint, no stack trace', () => {
  const r = spawnSync('node', [CB, 'map'], { encoding: 'utf8', env: NOKEY });
  assert.equal(r.status, 2);
  assert.match(r.stderr, /CLOSEBOT_API_KEY/);
  assert.doesNotMatch(r.stderr, /at .*\.mjs:\d+/);
});

test('unknown command exits 2', () => {
  const r = run(['nope', 'nada']);
  assert.equal(r.status, 2); assert.match(r.stderr, /unknown/i);
});

test('dry-run GET prints request with masked key and exits 0', () => {
  const r = run(['bot', 'list', '--dry-run', '--json']);
  assert.equal(r.status, 0, r.stderr);
  const j = JSON.parse(r.stdout);
  assert.equal(j.method, 'GET'); assert.match(j.url, /\/bot$/); assert.equal(j.headers['X-CB-KEY'], '***');
});

test('Tier 2 without --confirm exits 4 even in dry-run', () => {
  const r = run(['bot', 'delete', '--id', 'bot_x', '--dry-run']);
  assert.equal(r.status, 4); assert.match(r.stderr, /--confirm/);
});

test('missing key exits 2 with setup hint', () => {
  const r = spawnSync('node', [CB, 'bot', 'list', '--dry-run'], { encoding: 'utf8', env: { PATH: process.env.PATH, HOME: '/nonexistent', CB_NO_REPO_ENV: '1' } });
  assert.equal(r.status, 2); assert.match(r.stderr, /CLOSEBOT_API_KEY/);
});

test('gotcha review works with no API key', () => {
  const r = spawnSync('node', [CB, 'gotcha', 'review'], { encoding: 'utf8', env: { PATH: process.env.PATH, HOME: '/nonexistent', CB_NO_REPO_ENV: '1', CB_GOTCHA_LOG: '/nonexistent/auto.jsonl' } });
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.stdout, /\(empty\)/);
});

// C1: the generated alias for POST /bot/{id}/publish (and /save) must never be reachable
// — it skips isSandbox, pre-flight, diff-vs-live and verify-by-refetch. This must hold
// regardless of --confirm/--dry-run, because those are what a caller would reach for.
test('generated bot post-publish is refused (exit 4) even with --confirm --dry-run', () => {
  const r = run(['bot', 'post-publish', '--id', 'bot_EXAMPLE00000001', '--confirm', '--dry-run', '--json']);
  assert.equal(r.status, 4);
  assert.match(r.stderr, /owned by the composite/);
  assert.match(r.stderr, /cb bot publish/);
});

test('generated bot post-save is refused (exit 4) without --confirm/--dry-run too', () => {
  const r = run(['bot', 'post-save', '--id', 'bot_x', '--dry-run']);
  assert.equal(r.status, 4);
  assert.match(r.stderr, /owned by the composite/);
  assert.match(r.stderr, /cb bot push/);
});

test('bot list --dry-run is unaffected by the composite-owned refusal', () => {
  const r = run(['bot', 'list', '--dry-run', '--json']);
  assert.equal(r.status, 0, r.stderr);
});

// I1: composites must be discoverable via `cb help <group>`, ahead of the generated
// aliases they disable — otherwise a caller finds post-publish and never finds publish.
test('cb help bot lists both the composite publish and the disabled generated post-publish', () => {
  const r = run(['help', 'bot']);
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.stdout, /^bot publish\s/m);
  assert.match(r.stdout, /^bot post-publish\s/m);
});

test('cb help kb lists composite-only commands instead of falling back to the group list', () => {
  const r = run(['help', 'kb']);
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.stdout, /^kb build\s/m);
});

// I3: `bot list`/`bot delete` are real aliases (ALIASES.bot in cli/cb) used by five
// skills and the umbrella cheat sheet, but `cb help bot` printed only the canonical
// `bot get-bot`/`bot delete-bot` rows — an agent that checks help first before running
// a skill's documented command concluded the alias was wrong and froze-styled around it.
test('cb help bot lists the bot list/delete aliases alongside their canonical commands', () => {
  const r = run(['help', 'bot']);
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.stdout, /^bot list\s+alias\s+alias of get-bot/m);
  assert.match(r.stdout, /^bot delete\s+alias\s+alias of delete-bot/m);
  assert.match(r.stdout, /^bot get-bot\s/m);
  assert.match(r.stdout, /^bot delete-bot\s/m);
});

// I4: a thrown validation error (not fail()-ed) must map to exit 2, not the generic
// exit-3 catch-all reserved for genuine API/network failures.
test('malformed --body JSON exits 2, not 3', () => {
  const r = run(['bot', 'post-savetools', '--id', 'bot_x', '--body', '{bad', '--confirm']);
  assert.equal(r.status, 2);
  assert.match(r.stderr, /--body/);
});

test('bot push with a missing steps file exits 2 (ENOENT), not 3', () => {
  const r = run(['bot', 'push', 'bot_x', '/nonexistent/dir/steps.json']);
  assert.equal(r.status, 2);
});

// Minor 8: a requiredQuery refusal never hits the network (status stays 0) — the error
// message should render the note explaining why, not the misleading "HTTP 0".
test('missing required query param renders the note, not "HTTP 0"', () => {
  const r = run(['bot', 'get-steps', '--id', 'bot_x']);
  assert.equal(r.status, 3);
  assert.match(r.stderr, /botVersion is required/);
  assert.doesNotMatch(r.stderr, /HTTP 0/);
});

// Minor 5: bot audit used to swallow spawnSync's r.error, so a missing/non-executable
// scripts/cb-view-agent.sh gave a silent exit 3. Force that by pointing PATH only at the
// directory holding `node` (so the outer `node cli/cb ...` invocation still resolves)
// while making the *inner* spawnSync('bash', ...) unable to find bash.
test('bot audit surfaces a spawn error on stderr instead of failing silently', () => {
  const nodeDir = dirname(process.execPath);
  const r = spawnSync('node', [CB, 'bot', 'audit', 'bot_x'], { encoding: 'utf8', env: { CLOSEBOT_API_KEY: 'cb_test', PATH: nodeDir } });
  assert.equal(r.status, 3);
  assert.match(r.stderr, /audit spawn failed/);
});

// Report Minor 1 (bot test half): there's no meaningful dry run of a real ephemeral test
// session — refuse outright (exit 2) rather than half-run into a misleading
// "could not create test session" failure.
test('bot test --dry-run is refused (exit 2), not half-run', () => {
  const r = run(['bot', 'test', 'bot_x', 'hello', '--dry-run']);
  assert.equal(r.status, 2);
  assert.match(r.stderr, /cannot be dry-run/);
});

// Test sessions are CloseBot's own isolated test mode (no channels fire), and the
// publish flow needs `cb bot test` on the bot about to go live — so the sandbox
// allowlist gates publishing and write-mode smoke tests, not test sessions.
test('test-session commands are not limited to sandbox bots', () => {
  const sandboxFile = join(mkdtempSync(join(tmpdir(), 'cb-')), 'sandbox.json');
  writeFileSync(sandboxFile, JSON.stringify({ bots: [], sources: [] }));
  const r = run(['bottesting', 'put-testsession', '--botId', 'bot_CLIENT', '--leadId', 'lead_X', '--body', '{"mimicSourceId":"src_CLIENT"}', '--dry-run'], { CB_SANDBOX_FILE: sandboxFile });
  assert.equal(r.status, 0, r.stderr);
  assert.equal(JSON.parse(r.stdout).body.mimicSourceId, 'src_CLIENT');
});

test('--flag=value is parsed, so --dry-run=true previews instead of sending', () => {
  const r = run(['bot', 'list', '--dry-run=true']);
  assert.equal(r.status, 0, r.stderr);
  assert.equal(JSON.parse(r.stdout).method, 'GET');
});

test('a misspelled safety flag is refused instead of being ignored', () => {
  for (const flag of ['--dryrun', '--dry_run', '--Confirm']) {
    const r = run(['bot', 'list', flag]);
    assert.equal(r.status, 2, `${flag}: ${r.stderr}`);
    assert.match(r.stderr, /did you mean/);
  }
  const bad = run(['bot', 'list', '--dry-run=yes']);
  assert.equal(bad.status, 2);
});

test('a switch never swallows the next positional argument', () => {
  // Before: --dry-run took bot_X as its value, so the id went missing (usage error).
  const r = run(['bot', 'test', '--dry-run', 'bot_X', 'hello']);
  assert.equal(r.status, 2);
  assert.match(r.stderr, /cannot be dry-run/);
});

test('billing settings writes are Tier 2 and need --confirm', () => {
  for (const cmd of [['billing', 'put-options'], ['billing', 'put-re-billing']]) {
    const r = run([...cmd, '--body', '{}', '--dry-run']);
    assert.equal(r.status, 4, `${cmd.join(' ')}: ${r.stderr}`);
    assert.match(r.stderr, /Tier 2/);
  }
});

// Fix round 1 (2026-09-05): publish's confirm gate must still fire on the real
// (non-dry-run) path exactly as before — only --dry-run is exempt.
test('bot publish without --confirm or --dry-run exits 4 (existing behaviour preserved)', () => {
  const r = run(['bot', 'publish', 'bot_NOTSANDBOX']);
  assert.equal(r.status, 4);
  assert.match(r.stderr, /--confirm/);
});

// Fix round 1 (2026-09-05): the sandbox refusal must fire before --dry-run's now-relaxed
// confirm requirement — a --dry-run against the sandbox bot must never preview a
// "publish" of a bot that can never actually go live.
test('bot publish --dry-run against the sandbox id still exits 4 (no --confirm passed)', () => {
  // cli/sandbox.json is gitignored, so the test supplies its own allowlist.
  const sandboxFile = join(mkdtempSync(join(tmpdir(), 'cb-')), 'sandbox.json');
  const sandboxId = 'bot_TESTSANDBOX';
  writeFileSync(sandboxFile, JSON.stringify({ bots: [sandboxId], sources: [] }));
  const r = run(['bot', 'publish', sandboxId, '--dry-run'], { CB_SANDBOX_FILE: sandboxFile });
  assert.equal(r.status, 4);
  assert.match(r.stderr, /CB-SANDBOX/);
});
