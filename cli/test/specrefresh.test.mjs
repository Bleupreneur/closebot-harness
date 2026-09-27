import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { diffSpecs, staleOverrides, changelogBlock, refreshSpecFile } from '../lib/specrefresh.mjs';
const fx = n => JSON.parse(readFileSync(new URL(`./fixtures/${n}`, import.meta.url)));

test('diffSpecs finds added/removed/changed bodies', () => {
  assert.deepEqual(diffSpecs(fx('spec-old.json'), fx('spec-new.json')), { added: ['GET /new'], removed: ['DELETE /gone'], changedBodies: ['POST /b'] });
});
test('staleOverrides lists override keys missing from the new spec', () => {
  const ov = { operations: { 'POST /b': {}, 'GET /zzz': {} } };
  assert.deepEqual(staleOverrides(ov, fx('spec-new.json')), ['GET /zzz']);
});
test('changelogBlock is markdown with counts', () => {
  const b = changelogBlock('2026-09-04', { added: ['GET /new'], removed: [], changedBodies: [] });
  assert.match(b, /## 2026-09-04 — spec refresh/); assert.match(b, /\+1 added/); assert.match(b, /GET \/new/);
});

test('refreshSpecFile restores the old bytes and reports failure when build.py exits non-zero', () => {
  const dir = mkdtempSync(join(tmpdir(), 'cb-specrefresh-'));
  const specPath = join(dir, 'openapi.json');
  writeFileSync(specPath, 'OLD_BYTES');
  const spawnImpl = () => ({ status: 1, stdout: '', stderr: 'boom' });
  try {
    const result = refreshSpecFile({ specPath, rawText: 'NEW_BYTES', spawnImpl });
    assert.equal(result.ok, false);
    assert.equal(readFileSync(specPath, 'utf8'), 'OLD_BYTES');
    assert.match(result.message, /restored/i);
    assert.match(result.message, /did not run/i);
    assert.match(result.message, /boom/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('refreshSpecFile writes the new bytes and keeps them when build.py succeeds', () => {
  const dir = mkdtempSync(join(tmpdir(), 'cb-specrefresh-'));
  const specPath = join(dir, 'openapi.json');
  writeFileSync(specPath, 'OLD_BYTES');
  const spawnImpl = () => ({ status: 0, stdout: 'OK · paths=1 · schemas=1\n', stderr: '' });
  try {
    const result = refreshSpecFile({ specPath, rawText: 'NEW_BYTES', spawnImpl });
    assert.equal(result.ok, true);
    assert.equal(result.buildOutput, 'OK · paths=1 · schemas=1');
    assert.equal(readFileSync(specPath, 'utf8'), 'NEW_BYTES');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
