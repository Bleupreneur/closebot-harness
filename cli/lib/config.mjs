import { readFileSync, existsSync } from 'node:fs';
import { join, dirname, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

// The harness root: the cloned repo in folder mode, the plugin's installed copy in plugin mode.
export const REPO_DIR = join(dirname(fileURLToPath(import.meta.url)), '..', '..');

// Plugin mode = running from a Claude Code plugin install. The installed copy is replaced on
// every plugin update, so nothing user-owned (key, sandbox ids, template bot) may live there.
// CLAUDE_PLUGIN_ROOT is exported to plugin hooks/MCP servers but NOT to the Bash tool, so the
// install path (~/.claude/plugins/cache|marketplaces/...) is the signal that works for `cb`.
export function isPluginMode(env = process.env, repoDir = REPO_DIR) {
  if (env.CB_PLUGIN_MODE === '1' || env.CLAUDE_PLUGIN_ROOT) return true;
  return /\/\.claude\/plugins\/(cache|marketplaces)\//.test(repoDir.split(sep).join('/') + '/');
}

// User-level config dir: $CLOSEBOT_CONFIG_DIR, else ~/.config/closebot. Holds .env,
// cb.config.json and sandbox.json for plugin installs (or anyone who wants one key for every
// project). Derived only from the env passed in (null when it has no home), so tests that
// pass env={} never touch the real home directory.
export function userConfigDir(env = process.env) {
  if (env.CLOSEBOT_CONFIG_DIR) return env.CLOSEBOT_CONFIG_DIR;
  const home = env.HOME || env.USERPROFILE;
  return home ? join(home, '.config', 'closebot') : null;
}

// Where config is looked up, in order: the harness root (folder mode), then the user config
// dir. A project's own ./.env is never read — it belongs to that project, not to cb.
export function configDirs(env = process.env, repoDir = REPO_DIR) {
  const user = userConfigDir(env);
  return [{ kind: 'repo', dir: repoDir }, ...(user ? [{ kind: 'user', dir: user }] : [])];
}
// CB_NO_REPO_ENV=1 (tests) skips <repo>/.env so a developer's real key can't leak into a run.
export function envFiles(env = process.env, repoDir = REPO_DIR) {
  return configDirs(env, repoDir).filter(d => !(env.CB_NO_REPO_ENV && d.kind === 'repo')).map(d => join(d.dir, '.env'));
}

export const SETUP_HINT =
  'CLOSEBOT_API_KEY not found. Run: cb init (plugin install: cb init --global, which writes ~/.config/closebot/.env), ' +
  'then paste your key (create at https://app.closebot.com/settings?tab=keys — shown once). Header is X-CB-KEY.';

export function parseEnvFile(text) {
  const out = {};
  for (const line of text.split('\n')) {
    const m = line.match(/^\s*(?:export\s+)?([A-Z0-9_]+)\s*=\s*(.*)$/);
    if (!m) continue;
    let v = m[2].trim();
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
    out[m[1]] = v;
  }
  return out;
}

// Key resolution: CLOSEBOT_API_KEY env var, then <repo>/.env, then <user config dir>/.env.
// Returns where the key came from (never the key itself in any printed form) so `cb doctor`
// can report the source.
export function findApiKey(env = process.env, files = envFiles(env)) {
  if (env.CLOSEBOT_API_KEY) return { key: env.CLOSEBOT_API_KEY, source: 'env:CLOSEBOT_API_KEY' };
  for (const f of files) {
    if (!existsSync(f)) continue;
    const k = parseEnvFile(readFileSync(f, 'utf8')).CLOSEBOT_API_KEY;
    if (k) return { key: k, source: f };
  }
  return { key: null, source: null };
}

export function loadApiKey(env = process.env, files) {
  return findApiKey(env, files ?? envFiles(env)).key;
}

// Template bot = the reference the framework-parity checks compare against. Same resolution
// order as scripts/cb-view-agent.sh: CB_TEMPLATE_BOT (env), then per config dir (repo, then
// user): .env CB_TEMPLATE_BOT, then cb.config.json -> templateBot. The shipped placeholder
// (bot_XXXX...) counts as unset. `dirs` is one directory (string) or a list of them.
export function isPlaceholderId(id) { return !id || /X{8,}/.test(id); }
export function findTemplateBot(env = process.env, dirs = configDirs(env).map(d => d.dir)) {
  if (!isPlaceholderId(env.CB_TEMPLATE_BOT)) return { id: env.CB_TEMPLATE_BOT, source: 'env:CB_TEMPLATE_BOT' };
  for (const dir of [].concat(dirs)) {
    const envFile = join(dir, '.env');
    if (existsSync(envFile)) {
      const id = parseEnvFile(readFileSync(envFile, 'utf8')).CB_TEMPLATE_BOT;
      if (!isPlaceholderId(id)) return { id, source: envFile };
    }
    const cfg = join(dir, 'cb.config.json');
    if (existsSync(cfg)) {
      let id; try { id = JSON.parse(readFileSync(cfg, 'utf8')).templateBot; } catch { /* malformed config = unset */ }
      if (!isPlaceholderId(id)) return { id, source: cfg };
    }
  }
  return { id: null, source: null };
}
export function loadTemplateBot(env = process.env, dirs) {
  return findTemplateBot(env, dirs ?? configDirs(env).map(d => d.dir)).id;
}

// Sandbox allowlist: CB_SANDBOX_FILE, else <repo>/cli/sandbox.json (folder mode), else
// <user config dir>/sandbox.json. sandboxPath returns the first that exists, or the path to
// create when none does (the user dir in plugin mode, where the repo copy gets replaced).
export function sandboxCandidates(env = process.env, repoDir = REPO_DIR) {
  if (env.CB_SANDBOX_FILE) return [env.CB_SANDBOX_FILE];
  const user = userConfigDir(env);
  return [join(repoDir, 'cli', 'sandbox.json'), ...(user ? [join(user, 'sandbox.json')] : [])];
}
export function sandboxPath(env = process.env, repoDir = REPO_DIR) {
  const c = sandboxCandidates(env, repoDir);
  return c.find(p => existsSync(p)) ?? (isPluginMode(env, repoDir) ? c.at(-1) : c[0]);
}

// cli/sandbox.json (or the user-level sandbox.json) is optional and gitignored (template:
// cli/sandbox.example.json). Absent file = no sandbox ids.
export function isSandbox(id, path = sandboxPath()) {
  if (!existsSync(path)) return false;
  const j = JSON.parse(readFileSync(path, 'utf8'));
  return (j.bots || []).includes(id) || (j.sources || []).includes(id);
}

// `key` is accepted (not just documented) so a future caller wanting partial masking
// (e.g. last 4 chars) can be added without changing the call sites; today it always
// returns the fixed mask regardless of the argument.
export function mask(key) { return '***'; }
