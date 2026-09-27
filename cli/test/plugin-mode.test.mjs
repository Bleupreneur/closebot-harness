// Plugin-mode config resolution: user-level config dir (~/.config/closebot or
// $CLOSEBOT_CONFIG_DIR), lookup order, cb init --global, doctor reporting, and bin/cb.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, statSync, existsSync, copyFileSync, chmodSync, symlinkSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { spawnSync } from 'node:child_process';
import { REPO_DIR, isPluginMode, userConfigDir, configDirs, envFiles, findApiKey, findTemplateBot, loadTemplateBot, sandboxPath, sandboxCandidates } from '../lib/config.mjs';
import { runInit } from '../lib/init.mjs';
import { runDoctor } from '../lib/doctor.mjs';
import { loadOverrides } from '../lib/spec.mjs';

const tmp = p => mkdtempSync(join(tmpdir(), p));
const overrides = loadOverrides();
const noNet = async () => { throw new Error('network disabled in test'); };
const byName = (r, n) => r.checks.filter(c => c.name === n);

function repo({ env = null } = {}) {
  const d = tmp('cb-pm-repo-');
  mkdirSync(join(d, 'schema')); mkdirSync(join(d, 'cli'));
  copyFileSync(join(REPO_DIR, 'schema', 'openapi.json'), join(d, 'schema', 'openapi.json'));
  writeFileSync(join(d, '.env.example'), 'CLOSEBOT_API_KEY=\n');
  writeFileSync(join(d, 'cli', 'sandbox.example.json'), '{"bots":["bot_SANDBOXXXXXXXXXX"]}\n');
  writeFileSync(join(d, 'cb.config.example.json'), '{"templateBot":"bot_XXXXXXXXXXXXXXXX"}\n');
  if (env !== null) { writeFileSync(join(d, '.env'), env); chmodSync(join(d, '.env'), 0o600); }
  return d;
}

test('isPluginMode: env signals and plugin-cache install paths; a plain clone is folder mode', () => {
  assert.equal(isPluginMode({}, '/Users/x/code/closebot-harness'), false);
  assert.equal(isPluginMode({ CLAUDE_PLUGIN_ROOT: '/p' }, '/Users/x/code/closebot-harness'), true);
  assert.equal(isPluginMode({ CB_PLUGIN_MODE: '1' }, '/Users/x/code/closebot-harness'), true);
  assert.equal(isPluginMode({}, '/Users/x/.claude/plugins/cache/closebot-harness/closebot-harness/1.0.0'), true);
  assert.equal(isPluginMode({}, '/Users/x/.claude/plugins/marketplaces/closebot-harness'), true);
});

test('userConfigDir: CLOSEBOT_CONFIG_DIR, else HOME/USERPROFILE/.config/closebot, else null', () => {
  assert.equal(userConfigDir({ CLOSEBOT_CONFIG_DIR: '/c', HOME: '/h' }), '/c');
  assert.equal(userConfigDir({ HOME: '/h' }), join('/h', '.config', 'closebot'));
  assert.equal(userConfigDir({ USERPROFILE: '/w' }), join('/w', '.config', 'closebot'));
  assert.equal(userConfigDir({}), null);
  assert.deepEqual(configDirs({}, '/r'), [{ kind: 'repo', dir: '/r' }]);
  assert.deepEqual(envFiles({ CLOSEBOT_CONFIG_DIR: '/c' }, '/r'), [join('/r', '.env'), join('/c', '.env')]);
});

test('findApiKey order: env var, then repo .env, then user .env; never a project ./.env', () => {
  const r = tmp('cb-pm-r-'), u = tmp('cb-pm-u-');
  writeFileSync(join(u, '.env'), 'CLOSEBOT_API_KEY=cb_user\n');
  const env = { CLOSEBOT_CONFIG_DIR: u };
  assert.deepEqual(findApiKey(env, envFiles(env, r)), { key: 'cb_user', source: join(u, '.env') });
  writeFileSync(join(r, '.env'), 'CLOSEBOT_API_KEY=cb_repo\n');
  assert.equal(findApiKey(env, envFiles(env, r)).key, 'cb_repo');
  assert.equal(findApiKey({ ...env, CLOSEBOT_API_KEY: 'cb_env' }, envFiles(env, r)).source, 'env:CLOSEBOT_API_KEY');
  assert.ok(!envFiles(env, r).includes(join(process.cwd(), '.env')) || process.cwd() === r, 'cwd .env is not a lookup location');
});

test('template bot: env, then repo (.env, cb.config.json), then user dir; source reported', () => {
  const r = tmp('cb-pm-r-'), u = tmp('cb-pm-u-');
  assert.deepEqual(findTemplateBot({}, [r, u]), { id: null, source: null });
  writeFileSync(join(u, 'cb.config.json'), '{"templateBot":"bot_USERCFG"}');
  assert.deepEqual(findTemplateBot({}, [r, u]), { id: 'bot_USERCFG', source: join(u, 'cb.config.json') });
  writeFileSync(join(r, 'cb.config.json'), '{"templateBot":"bot_XXXXXXXXXXXXXXXX"}'); // placeholder = unset
  assert.equal(loadTemplateBot({}, [r, u]), 'bot_USERCFG');
  writeFileSync(join(r, 'cb.config.json'), '{"templateBot":"bot_REPOCFG"}');
  assert.equal(loadTemplateBot({}, [r, u]), 'bot_REPOCFG');
  assert.equal(loadTemplateBot({ CB_TEMPLATE_BOT: 'bot_ENV' }, [r, u]), 'bot_ENV');
});

test('sandboxPath: CB_SANDBOX_FILE, else first existing of repo/user, else the mode-appropriate default', () => {
  const r = tmp('cb-pm-r-'), u = tmp('cb-pm-u-');
  mkdirSync(join(r, 'cli'));
  const env = { CLOSEBOT_CONFIG_DIR: u };
  assert.deepEqual(sandboxCandidates(env, r), [join(r, 'cli', 'sandbox.json'), join(u, 'sandbox.json')]);
  assert.equal(sandboxPath(env, r), join(r, 'cli', 'sandbox.json'));                          // folder default
  assert.equal(sandboxPath({ ...env, CB_PLUGIN_MODE: '1' }, r), join(u, 'sandbox.json'));     // plugin default
  writeFileSync(join(u, 'sandbox.json'), '{"bots":["bot_OK"]}');
  assert.equal(sandboxPath(env, r), join(u, 'sandbox.json'));
  assert.equal(sandboxPath({ ...env, CB_SANDBOX_FILE: '/x.json' }, r), '/x.json');
});

test('init --global writes to the config dir: dir 700, .env 600, sandbox + template there, repo untouched', () => {
  const r = repo(), u = join(tmp('cb-pm-home-'), '.config', 'closebot');
  const res = runInit({ repoDir: r, global: true, configDir: u, sandbox: true, template: 'bot_ABC123' });
  assert.equal(res.ok, true, JSON.stringify(res));
  assert.equal(statSync(u).mode & 0o777, 0o700);
  assert.equal(statSync(join(u, '.env')).mode & 0o777, 0o600);
  assert.ok(existsSync(join(u, 'sandbox.json')));
  assert.equal(JSON.parse(readFileSync(join(u, 'cb.config.json'), 'utf8')).templateBot, 'bot_ABC123');
  assert.equal(existsSync(join(r, '.env')), false);
  assert.equal(existsSync(join(r, 'cli', 'sandbox.json')), false);
  // Second run keeps everything.
  const again = runInit({ repoDir: r, global: true, configDir: u, sandbox: true, template: 'bot_OTHER' });
  assert.deepEqual(again.actions.map(a => a.status), ['kept', 'kept', 'kept']);
});

test('init --global with no home dir fails cleanly', () => {
  const res = runInit({ repoDir: repo(), global: true, configDir: null });
  assert.equal(res.ok, false);
  assert.match(res.actions[0].detail, /CLOSEBOT_CONFIG_DIR/);
});

test('doctor reads the user-level .env and says where the key came from', async () => {
  const r = repo(), u = tmp('cb-pm-u-');
  writeFileSync(join(u, '.env'), 'CLOSEBOT_API_KEY=cb_live_USERLEVELKEY\n'); chmodSync(join(u, '.env'), 0o600);
  const res = await runDoctor({ repoDir: r, env: { CLOSEBOT_CONFIG_DIR: u }, fetchImpl: noNet, overrides, offline: true });
  assert.equal(byName(res, '.env')[0].status, 'ok');
  assert.match(byName(res, 'api key')[0].detail, new RegExp(`found in ${join(u, '.env').replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`));
  assert.ok(!JSON.stringify(res).includes('USERLEVELKEY'));
});

test('doctor fails a world-readable user-level .env', async () => {
  const u = tmp('cb-pm-u-');
  writeFileSync(join(u, '.env'), 'CLOSEBOT_API_KEY=cb_live_abcdef\n'); chmodSync(join(u, '.env'), 0o644);
  const res = await runDoctor({ repoDir: repo(), env: { CLOSEBOT_CONFIG_DIR: u }, fetchImpl: noNet, overrides, offline: true });
  assert.equal(byName(res, '.env')[0].status, 'fail');
  assert.match(byName(res, '.env')[0].detail, /chmod 600/);
});

test('doctor in plugin mode reports the mode and points at cb init --global', async () => {
  const u = tmp('cb-pm-u-');
  const res = await runDoctor({ repoDir: repo(), env: { CLOSEBOT_CONFIG_DIR: u, CB_PLUGIN_MODE: '1' }, fetchImpl: noNet, overrides, offline: true });
  assert.match(byName(res, 'mode')[0].detail, /^plugin install/);
  assert.match(byName(res, '.env')[0].detail, /cb init --global/);
  assert.match(byName(res, 'sandbox')[0].detail, /cb init --global --sandbox/);
});

// End to end through bin/cb from an unrelated cwd, the way the plugin's PATH entry runs it.
function runBin(args, env, cwd) {
  const link = join(cwd, 'cb');
  if (!existsSync(link)) symlinkSync(join(REPO_DIR, 'bin', 'cb'), link);
  return spawnSync(process.execPath, [link, ...args], { cwd, encoding: 'utf8', env: { PATH: process.env.PATH, ...env } });
}

test('bin/cb (symlinked, foreign cwd): root, init --global, doctor --offline, map without a key', () => {
  const cwd = tmp('cb-pm-cwd-'), home = tmp('cb-pm-home-');
  const env = { HOME: home, CB_PLUGIN_MODE: '1', CB_NO_REPO_ENV: '1' };
  assert.equal(runBin(['root'], env, cwd).stdout.trim(), REPO_DIR);

  const init = runBin(['init'], env, cwd);
  assert.equal(init.status, 0, init.stderr);
  assert.match(init.stdout, /Plugin install detected/);
  assert.equal(statSync(join(home, '.config', 'closebot', '.env')).mode & 0o777, 0o600);
  assert.equal(existsSync(join(cwd, '.env')), false, 'never writes into the project');

  const doc = runBin(['doctor', '--offline'], env, cwd);
  assert.equal(doc.status, 2); // placeholder key = [fail]
  assert.doesNotMatch(doc.stderr + doc.stdout, /\n\s+at /, 'no stack trace');
  assert.match(doc.stdout, /plugin install/);

  const map = runBin(['map'], env, cwd);
  assert.equal(map.status, 2);
  assert.match(map.stderr, /cb init --global/);
  assert.doesNotMatch(map.stderr, /\n\s+at /, 'no stack trace');
});
