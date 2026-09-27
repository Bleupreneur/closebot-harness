import { test } from 'node:test';
import assert from 'node:assert/strict';
import { cmpSemver, resolveTarget } from '../lib/versions.mjs';

test('cmpSemver is numeric, not lexical', () => {
  assert.equal(cmpSemver('0.0.9', '0.0.13'), -1);
  assert.equal(cmpSemver('0.0.13', '0.0.13'), 0);
});

test('resolveTarget picks highest semver even when a stale draft exists (stale-draft trap)', () => {
  const bot = { versions: [
    { version: '0.0.4', published: false },   // abandoned draft
    { version: '0.0.12', published: true },
    { version: '0.0.13', published: true },   // live head
  ] };
  assert.deepEqual(resolveTarget(bot), { target: '0.0.13', targetPublished: true, live: '0.0.13', liveEqualsTarget: true });
});

test('resolveTarget with an unpublished head returns it as the draft', () => {
  const bot = { versions: [{ version: '0.0.6', published: true }, { version: '0.0.7', published: false }] };
  assert.deepEqual(resolveTarget(bot), { target: '0.0.7', targetPublished: false, live: '0.0.6', liveEqualsTarget: false });
});

test('resolveTarget with no versions throws a clear error', () => {
  assert.throws(() => resolveTarget({ versions: [] }), /no versions/);
});
