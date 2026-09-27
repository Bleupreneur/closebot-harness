// cb init — non-interactive first-run setup. Creates local, gitignored files from their
// shipped examples. Never overwrites an existing file and never reads or prints a key.
// Folder mode writes into the repo; --global (the default in plugin mode) writes into the
// user config dir (~/.config/closebot, or $CLOSEBOT_CONFIG_DIR), dir mode 700.
import { existsSync, copyFileSync, chmodSync, readFileSync, writeFileSync, statSync, mkdirSync, constants } from 'node:fs';
import { join } from 'node:path';
import { REPO_DIR, isPluginMode, userConfigDir } from './config.mjs';
import { fail } from './output.mjs';

const KEY_URL = 'https://app.closebot.com/settings?tab=keys';

export function runInit({ repoDir = REPO_DIR, sandbox = false, template = null, global = false, configDir = null } = {}) {
  const actions = [];
  const add = (status, file, detail) => actions.push({ status, file, detail });

  let dir = repoDir, envName = '.env', sbName = join('cli', 'sandbox.json'), cfgName = 'cb.config.json';
  if (global) {
    if (!configDir) return { ok: false, global, dir: null, actions: [{ status: 'error', file: '(config dir)', detail: 'no home directory; set CLOSEBOT_CONFIG_DIR' }] };
    dir = configDir;
    // Labels are absolute paths for global files so the user knows exactly where they went.
    envName = join(dir, '.env'); sbName = join(dir, 'sandbox.json'); cfgName = join(dir, 'cb.config.json');
    if (!existsSync(dir)) { mkdirSync(dir, { recursive: true, mode: 0o700 }); chmodSync(dir, 0o700); add('created', dir, 'config dir, mode 700'); }
    else {
      const m = statSync(dir).mode & 0o777;
      if (m & 0o077) add('kept', dir, `config dir exists with mode ${m.toString(8)}; run chmod 700 ${dir}`);
    }
  }
  const at = name => (global ? name : join(dir, name));

  const env = at(envName), envEx = join(repoDir, '.env.example');
  if (existsSync(env)) {
    const mode = statSync(env).mode & 0o777;
    add('kept', envName, mode & 0o077 ? `already exists (mode ${mode.toString(8)}; run chmod 600 ${env})` : 'already exists, left untouched');
  } else if (!existsSync(envEx)) {
    add('error', envName, `.env.example is missing from ${repoDir}; create ${envName} with CLOSEBOT_API_KEY=<your key>`);
  } else {
    // COPYFILE_EXCL: fail rather than clobber if .env appears between the check and the copy.
    copyFileSync(envEx, env, constants.COPYFILE_EXCL);
    chmodSync(env, 0o600);
    add('created', envName, `copied from .env.example, mode 600. Paste your key after CLOSEBOT_API_KEY= (create one at ${KEY_URL}; it is shown once)`);
  }

  if (sandbox) {
    const sb = at(sbName), sbEx = join(repoDir, 'cli', 'sandbox.example.json');
    if (existsSync(sb)) add('kept', sbName, 'already exists, left untouched');
    else if (!existsSync(sbEx)) add('error', sbName, 'cli/sandbox.example.json is missing');
    else { copyFileSync(sbEx, sb, constants.COPYFILE_EXCL); add('created', sbName, 'copied from the example; replace the placeholder bot/source ids with your sandbox ids'); }
  }

  if (template !== null) {
    const cfg = at(cfgName), cfgEx = join(repoDir, 'cb.config.example.json');
    if (typeof template !== 'string' || !/^bot_[A-Za-z0-9]+$/.test(template)) add('error', cfgName, `--template needs a bot id like bot_ABC123, got ${JSON.stringify(template)}`);
    else if (existsSync(cfg)) add('kept', cfgName, `already exists, left untouched (edit "templateBot" yourself to set ${template})`);
    else {
      let base = {};
      if (existsSync(cfgEx)) { try { base = JSON.parse(readFileSync(cfgEx, 'utf8')); } catch { base = {}; } }
      writeFileSync(cfg, JSON.stringify({ ...base, templateBot: template }, null, 2) + '\n', { flag: 'wx' });
      add('created', cfgName, `templateBot = ${template}`);
    }
  }
  return { ok: !actions.some(a => a.status === 'error'), global, dir, actions };
}

export const INIT_HELP = `cb init — first-run setup (no network, never overwrites)

Usage: cb init [--global] [--sandbox] [--template <bot_id>] [--json]

  (always)            create .env from .env.example with mode 600 if it does not exist
  --global            write to the user config dir (~/.config/closebot, or $CLOSEBOT_CONFIG_DIR;
                      dir mode 700) instead of the repo. Default when cb runs from a Claude Code
                      plugin install, whose files are replaced on every plugin update.
  --sandbox           create sandbox.json (cli/sandbox.json, or <config dir>/sandbox.json)
  --template <id>     create cb.config.json with "templateBot": "<id>"

Key lookup order: CLOSEBOT_API_KEY env var, <repo>/.env, <config dir>/.env.
Existing files are left untouched. Next: paste your key into .env, then run cb doctor.`;

export function initCommand({ flags, env = process.env }) {
  const plugin = isPluginMode(env);
  const global = !!flags.global || plugin;
  const res = runInit({ sandbox: !!flags.sandbox, template: flags.template === undefined ? null : flags.template, global, configDir: userConfigDir(env) });
  if (flags.json) process.stdout.write(JSON.stringify(res, null, 2) + '\n');
  else {
    if (plugin && !flags.global) process.stdout.write('Plugin install detected: writing to the user config dir (the plugin folder is replaced on update).\n');
    for (const a of res.actions) process.stdout.write(`[${a.status}] ${a.file}: ${a.detail}\n`);
    const envPath = global ? join(res.dir ?? '~/.config/closebot', '.env') : '.env';
    process.stdout.write(`\nNext: put your key in ${envPath} (${KEY_URL}), then run cb doctor\n`);
  }
  if (!res.ok) fail(2, 'init finished with errors (see above)');
}
