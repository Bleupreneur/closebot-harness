// cb doctor — first-run health check. Tier 0: local file checks plus two GETs
// (GET /agency/current to validate the key, GET /bot/{id} for the template bot) and an
// optional unauthenticated fetch of CloseBot's public Swagger spec for drift.
// Never prints the key: only where it was found and its length.
import { existsSync, statSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { REPO_DIR, findApiKey, findTemplateBot, isPlaceholderId, isPluginMode, userConfigDir, configDirs, envFiles, sandboxPath, sandboxCandidates } from './config.mjs';
import { request } from './http.mjs';
import { opsOf } from './specrefresh.mjs';
import { loadOverrides } from './spec.mjs';

const REST = 'https://api.closebot.com';
// Same URL `cb spec refresh` pulls from (cli/lib/specrefresh.mjs UPSTREAM).
export const SWAGGER_URL = 'https://megastream25-api.closebot.com/swagger/v1/swagger.json';
const KEY_URL = 'https://app.closebot.com/settings?tab=keys';

export async function runDoctor({ repoDir = REPO_DIR, env = process.env, fetchImpl = fetch, nodeVersion = process.versions.node, offline = false, overrides } = {}) {
  const checks = [];
  const add = (status, name, detail) => checks.push({ status, name, detail });
  const ov = overrides ?? loadOverrides(join(repoDir, 'cli', 'overrides.json'));

  const major = parseInt(String(nodeVersion).split('.')[0], 10);
  add(major >= 22 ? 'ok' : 'fail', 'node', major >= 22 ? `Node ${nodeVersion}` : `Node ${nodeVersion} found; cb needs Node 22 or newer`);

  const plugin = isPluginMode(env, repoDir);
  const initCmd = plugin ? 'cb init --global' : 'cb init';
  const userDir = userConfigDir(env);
  add('ok', 'mode', plugin
    ? `plugin install (${repoDir}); config from ${userDir ?? '(no home dir; set CLOSEBOT_CONFIG_DIR)'}`
    : `folder (${repoDir})${userDir ? `; also reads ${userDir}` : ''}`);

  // Every .env cb would read, in lookup order. Each one that exists must be private.
  const files = envFiles(env, repoDir);
  const present = files.filter(f => existsSync(f));
  const fromEnvVar = !!env.CLOSEBOT_API_KEY;
  if (!present.length) {
    add(fromEnvVar ? 'warn' : 'fail', '.env', fromEnvVar ? 'no .env file (key comes from the CLOSEBOT_API_KEY env var)' : `no .env file (looked in ${files.join(', ')}). Run: ${initCmd}`);
  } else {
    for (const f of present) {
      const mode = statSync(f).mode & 0o777;
      if (mode & 0o077) add('fail', '.env', `${f} is mode ${mode.toString(8)}; other users can read it. Run: chmod 600 ${f}`);
      else add('ok', '.env', `${f} present, mode ${mode.toString(8)}`);
    }
  }

  const { key, source } = findApiKey(env, files);
  const where = source === 'env:CLOSEBOT_API_KEY' ? 'env var CLOSEBOT_API_KEY' : source;
  if (!key) add('fail', 'api key', `CLOSEBOT_API_KEY not set. Create a key at ${KEY_URL} and paste it into .env (${initCmd} creates one)`);
  else if (/paste|your[_-]?key|x{6,}/i.test(key)) add('fail', 'api key', `CLOSEBOT_API_KEY in ${source === 'env:CLOSEBOT_API_KEY' ? 'the environment' : source} is still the placeholder`);
  else add('ok', 'api key', `found in ${where} (${key.length} chars, value hidden)`);

  let keyValid = false;
  if (checks.at(-1).status === 'ok') {
    try {
      const r = await request({ method: 'GET', base: REST, path: '/agency/current', key, overrides: ov, fetchImpl, maxTimeMs: 15000 });
      if (r.ok) {
        keyValid = true;
        add('ok', 'key valid', 'GET /agency/current → 200');
        add(r.data?.name ? 'ok' : 'warn', 'agency', r.data?.name ? `${r.data.name}` : 'agency has no name');
      } else if (r.status === 401 || r.status === 403) add('fail', 'key valid', `GET /agency/current → ${r.status}: key rejected. Create a new one at ${KEY_URL}`);
      else add('fail', 'key valid', `GET /agency/current → HTTP ${r.status}`);
    } catch (e) { add('fail', 'key valid', `GET /agency/current failed: ${e.message}`); }
  } else add('fail', 'key valid', 'skipped (no usable key)');

  let localOps = null;
  try { localOps = opsOf(JSON.parse(readFileSync(join(repoDir, 'schema', 'openapi.json'), 'utf8'))); }
  catch (e) { add('fail', 'spec', `schema/openapi.json unreadable: ${e.message}`); }
  if (localOps) {
    if (offline) add('warn', 'spec drift', `${localOps.size} ops locally; live check skipped (--offline)`);
    else {
      try {
        const ctrl = new AbortController(); const t = setTimeout(() => ctrl.abort(), 15000);
        let live;
        try { const r = await fetchImpl(SWAGGER_URL, { signal: ctrl.signal }); if (!r.ok) throw new Error(`HTTP ${r.status}`); live = opsOf(JSON.parse(await r.text())); }
        finally { clearTimeout(t); }
        const added = [...live.keys()].filter(k => !localOps.has(k)), removed = [...localOps.keys()].filter(k => !live.has(k));
        if (!added.length && !removed.length) add('ok', 'spec drift', `local spec matches live (${localOps.size} ops)`);
        else add('warn', 'spec drift', `local ${localOps.size} ops vs live ${live.size}: +${added.length} added, -${removed.length} removed upstream. Run: cb spec refresh --dry-run`);
      } catch (e) { add('warn', 'spec drift', `${localOps.size} ops locally; could not reach live Swagger (${e.message})`); }
    }
  }

  const sbPath = sandboxPath(env, repoDir);
  if (!existsSync(sbPath)) add('warn', 'sandbox', `no sandbox.json (looked in ${sandboxCandidates(env, repoDir).join(', ')}; optional, needed only for write-mode tests). Run: ${initCmd} --sandbox`);
  else {
    try {
      const sb = JSON.parse(readFileSync(sbPath, 'utf8'));
      const ids = [...(sb.bots || []), ...(sb.sources || [])];
      if (!ids.length || ids.some(isPlaceholderId)) add('warn', 'sandbox', `${sbPath} still has placeholder ids; put your sandbox bot/source ids in it`);
      else add('ok', 'sandbox', `${(sb.bots || []).length} sandbox bot(s), ${(sb.sources || []).length} source(s) from ${sbPath}`);
    } catch (e) { add('fail', 'sandbox', `${sbPath} is not valid JSON: ${e.message}`); }
  }

  const { id: tpl, source: tplSource } = findTemplateBot(env, configDirs(env, repoDir).map(d => d.dir));
  if (!tpl) add('warn', 'template bot', `not configured (optional; used by framework-parity checks). Run: ${initCmd} --template <bot_id>`);
  else if (!keyValid) add('warn', 'template bot', `${tpl} configured; not verified (key not valid)`);
  else {
    try {
      const r = await request({ method: 'GET', base: REST, path: '/bot/{id}', params: { id: tpl }, key, overrides: ov, fetchImpl, maxTimeMs: 15000 });
      if (r.ok) add('ok', 'template bot', `${tpl} (${r.data?.name ?? 'unnamed'}) from ${tplSource}`);
      else add('warn', 'template bot', `${tpl} configured but GET /bot/{id} → HTTP ${r.status}; check the id`);
    } catch (e) { add('warn', 'template bot', `${tpl} could not be verified: ${e.message}`); }
  }

  return { ok: !checks.some(c => c.status === 'fail'), checks };
}

export function formatDoctor(res) {
  const w = Math.max(...res.checks.map(c => c.name.length));
  const lines = res.checks.map(c => `[${c.status}]${' '.repeat(5 - c.status.length)} ${c.name.padEnd(w)}  ${c.detail}`);
  lines.push('', res.ok ? 'All required checks passed. Next: cb map' : 'Some checks failed. Fix the [fail] lines above and re-run cb doctor.');
  return lines.join('\n') + '\n';
}

export const DOCTOR_HELP = `cb doctor — check that cb is ready to use (read-only)

Usage: cb doctor [--json] [--offline]

Checks: Node >= 22; mode (folder or plugin install) and config dirs; every .env cb reads
(<repo>/.env, ~/.config/closebot/.env) present and mode 600; API key present and where it
came from (value never printed); key valid (GET /agency/current) and agency name; local spec
vs live Swagger op count (--offline skips; network failure is a warning); sandbox.json;
template bot.
Markers: [ok] [warn] [fail]. Exits 2 if any check is [fail], 0 otherwise.`;

export async function doctorCommand({ flags }) {
  const res = await runDoctor({ offline: !!flags.offline });
  if (flags.json) process.stdout.write(JSON.stringify(res, null, 2) + '\n');
  else process.stdout.write(formatDoctor(res));
  process.exit(res.ok ? 0 : 2);
}
