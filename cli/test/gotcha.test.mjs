import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { recordSurprise, addGotcha, listUnreviewed, markReviewed } from '../lib/gotcha.mjs';

const HEADER = '# Gotchas\n\n| Date | Skill | Gotcha | Fix |\n|------|-------|--------|-----|\n| 2026-01-01 | old | **old** | x |\n';

test('addGotcha inserts newest-first under the header', () => {
  const d = mkdtempSync(join(tmpdir(), 'g-')); const p = join(d, 'GOTCHAS.md'); writeFileSync(p, HEADER);
  addGotcha({ skill: 'closebot-edit-job-flow', symptom: 'save clobbered', cause: 'UI autosave', fix: 'close tab' }, p);
  const lines = readFileSync(p, 'utf8').split('\n');
  assert.equal(lines[3], '|------|-------|--------|-----|');
  assert.match(lines[4], /^\| \d{4}-\d{2}-\d{2} \| closebot-edit-job-flow \| \*\*save clobbered\*\* UI autosave \| close tab \|$/);
  assert.match(lines[5], /old/);
});

test('recordSurprise appends jsonl; listUnreviewed/markReviewed round-trip', () => {
  const d = mkdtempSync(join(tmpdir(), 'g-')); const p = join(d, 'auto.jsonl'); writeFileSync(p, '');
  recordSurprise({ opKey: 'POST /x', status: 400, requestShape: 'object', bodyExcerpt: { e: 'bad' } }, p);
  recordSurprise({ opKey: 'GET /y', status: 500, requestShape: null, bodyExcerpt: {} }, p);
  assert.equal(listUnreviewed(p).length, 2);
  markReviewed([0], p);
  assert.equal(listUnreviewed(p).length, 1);
  assert.equal(listUnreviewed(p)[0].opKey, 'GET /y');
});

test('listUnreviewed skips a corrupt line and keeps line-position indices; markReviewed preserves it verbatim', () => {
  const d = mkdtempSync(join(tmpdir(), 'g-')); const p = join(d, 'auto.jsonl');
  const good1 = JSON.stringify({ ts: '2026-01-01T00:00:00.000Z', opKey: 'GET /a', status: 200, requestShape: null, bodyExcerpt: {}, reviewed: false });
  const corrupt = '{not valid json';
  const good2 = JSON.stringify({ ts: '2026-01-02T00:00:00.000Z', opKey: 'GET /b', status: 200, requestShape: null, bodyExcerpt: {}, reviewed: false });
  writeFileSync(p, [good1, corrupt, good2].join('\n') + '\n');

  const before = listUnreviewed(p);
  assert.equal(before.length, 2);
  assert.equal(before[0].i, 0);
  assert.equal(before[1].i, 2);

  markReviewed([2], p);
  const lines = readFileSync(p, 'utf8').split('\n').filter(Boolean);
  assert.equal(lines[1], corrupt);

  const after = listUnreviewed(p);
  assert.equal(after.length, 1);
  assert.equal(after[0].i, 0);
});
