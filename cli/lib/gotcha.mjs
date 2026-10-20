import { readFileSync, writeFileSync, appendFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { REPO_DIR, isPluginMode, userConfigDir } from './config.mjs';
import { printJson, printTable, fail } from './output.mjs';

// Local, gitignored log of API surprises (contains excerpts of your own account's responses).
// Plugin installs keep it in the user config dir: the plugin folder is replaced on update.
const AUTO = process.env.CB_GOTCHA_LOG
  || (isPluginMode() && userConfigDir() ? join(userConfigDir(), 'gotchas.auto.jsonl') : join(REPO_DIR, 'gotchas', 'auto.jsonl'));
export function gotchasPath() {
  const root = join(REPO_DIR, 'GOTCHAS.md');
  return existsSync(root) ? root : join(REPO_DIR, '.claude', 'skills', 'GOTCHAS.md');
}
const today = () => new Date().toISOString().slice(0, 10);
const cell = s => String(s ?? '').replace(/\|/g, '\\|').replace(/\r?\n/g, ' ').trim();

export function recordSurprise(s, path = AUTO) {
  try { appendFileSync(path, JSON.stringify({ ts: new Date().toISOString(), ...s, reviewed: false }) + '\n'); } catch { /* never break a CLI call over logging */ }
}
export function addGotcha({ skill, symptom, cause, fix }, path = gotchasPath()) {
  const row = `| ${today()} | ${cell(skill)} | **${cell(symptom)}** ${cell(cause)} | ${cell(fix)} |`;
  const lines = readFileSync(path, 'utf8').split('\n');
  const i = lines.findIndex(l => /^\|-+\|-+\|-+\|-+\|$/.test(l.replace(/\s/g, '')));
  if (i < 0) throw new Error(`no gotcha table header in ${path}`);
  lines.splice(i + 1, 0, row);
  writeFileSync(path, lines.join('\n'));
  return row;
}
function readEntries(path) {
  if (!existsSync(path)) return [];
  return readFileSync(path, 'utf8').split('\n').filter(Boolean).map((raw, idx) => {
    try { return { raw, obj: JSON.parse(raw) }; }
    catch { process.stderr.write(`cb: ${path} line ${idx + 1} unparsable, skipped\n`); return { raw, obj: null }; }
  });
}
export function listUnreviewed(path = AUTO) {
  return readEntries(path)
    .map((e, i) => ({ i, e }))
    .filter(({ e }) => e.obj && !e.obj.reviewed)
    .map(({ i, e }) => ({ i, ...e.obj }));
}
export function markReviewed(indices, path = AUTO) {
  const entries = readEntries(path);
  for (const i of indices) if (entries[i]?.obj) entries[i].obj.reviewed = true;
  const out = entries.map(e => e.obj ? JSON.stringify(e.obj) : e.raw).join('\n');
  writeFileSync(path, out + (entries.length ? '\n' : ''));
}

export const gotchaCommands = {
  async add(ctx) {
    const f = ctx.flags; for (const k of ['skill', 'symptom', 'cause', 'fix']) if (!f[k] || f[k] === true) fail(2, `--${k} is required`);
    const row = addGotcha({ skill: f.skill, symptom: f.symptom, cause: f.cause, fix: f.fix });
    printJson({ file: gotchasPath(), row });
  },
  async review(ctx) {
    if (ctx.flags.mark) { markReviewed(String(ctx.flags.mark).split(',').map(Number)); }
    const rows = listUnreviewed();
    if (ctx.json) printJson(rows); else printTable(rows.map(r => ({ i: r.i, ts: r.ts, op: r.opKey, status: r.status, shape: r.requestShape, excerpt: JSON.stringify(r.bodyExcerpt ?? null).slice(0, 80) })));
  },
};
