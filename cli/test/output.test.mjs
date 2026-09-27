import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { printTable } from '../lib/output.mjs';

// Minor 6: printTable on a bare array of strings must not render character-index
// columns (Object.keys("abc") -> "0","1","2") — print one value per line instead.
test('printTable on a string array prints one value per line, not character columns', () => {
  const script = `
    import { printTable } from ${JSON.stringify(fileURLToPath(new URL('../lib/output.mjs', import.meta.url)))};
    printTable(['abc', 'def']);
  `;
  const r = spawnSync('node', ['--input-type=module', '-e', script], { encoding: 'utf8' });
  assert.equal(r.status, 0, r.stderr);
  assert.equal(r.stdout, 'abc\ndef\n');
  assert.doesNotMatch(r.stdout, /^0\s+1\s+2/m);
});

test('printTable on an empty array prints (empty)', () => {
  const script = `
    import { printTable } from ${JSON.stringify(fileURLToPath(new URL('../lib/output.mjs', import.meta.url)))};
    printTable([]);
  `;
  const r = spawnSync('node', ['--input-type=module', '-e', script], { encoding: 'utf8' });
  assert.equal(r.stdout, '(empty)\n');
});

test('printTable on row objects still renders a table (unchanged behavior)', () => {
  const script = `
    import { printTable } from ${JSON.stringify(fileURLToPath(new URL('../lib/output.mjs', import.meta.url)))};
    printTable([{ a: 1, b: 'x' }]);
  `;
  const r = spawnSync('node', ['--input-type=module', '-e', script], { encoding: 'utf8' });
  assert.match(r.stdout, /^a\s+b/m);
});
