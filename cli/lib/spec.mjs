import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { REPO_DIR } from './config.mjs';

export function loadCliSpec(path = join(REPO_DIR, 'cli', 'closebot-cli.spec.json')) {
  return JSON.parse(readFileSync(path, 'utf8'));
}

export function loadOverrides(path = join(REPO_DIR, 'cli', 'overrides.json')) {
  return JSON.parse(readFileSync(path, 'utf8'));
}

export function findCommand(spec, group, cmd) {
  return spec.commands?.[group]?.[cmd] ?? null;
}

export function opKey(method, path) {
  return `${method.toUpperCase()} ${path}`;
}

export function tierOf(method, path, overrides) {
  const m = method.toUpperCase();
  if ((overrides.tier2 || []).includes(opKey(m, path))) return 2;
  if ((overrides.tier2Exempt || []).includes(opKey(m, path))) return 1;
  if (m === 'DELETE') return 2;
  if (m === 'GET') return 0;
  return 1;
}

export function overrideFor(method, path, overrides) {
  return overrides.operations?.[opKey(method, path)] ?? {};
}
