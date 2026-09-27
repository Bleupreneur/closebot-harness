import { test } from 'node:test';
import assert from 'node:assert/strict';
import { writeFileSync, mkdtempSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { summarizeDiff, verifyPublished, extractReplies, pollTestMessages, botCommands } from '../lib/bot.mjs';
import { tierOf, loadOverrides } from '../lib/spec.mjs';

const BOT_LIB = JSON.stringify(fileURLToPath(new URL('../lib/bot.mjs', import.meta.url)));

test('summarizeDiff reports changed fields by node title', () => {
  const live = { nodes: [{ id: 'a', data: { Title: 'Booking Agent', Instructions: 'x' } }, { id: 'gone', data: { Title: 'Old' } }] };
  const tgt = { nodes: [{ id: 'a', data: { Title: 'Booking Agent', Instructions: 'y' } }, { id: 'new', data: { Title: 'New' } }] };
  assert.deepEqual(summarizeDiff(live, tgt), { nodesAdded: ['New'], nodesRemoved: ['Old'], nodesChanged: [{ id: 'a', title: 'Booking Agent', fields: ['Instructions'] }] });
});

test('verifyPublished ignores message:"null" and trusts versions[] only', async () => {
  // verifyPublished reads via (ctx.read || ctx.call) — provide both (aliased to the same
  // mock) so this test exercises the real production ctx shape, not just the fallback.
  const readOrCall = async () => ({ ok: true, status: 200, data: { versions: [{ version: '0.0.9', published: true }], message: 'null' } });
  const ctx = { call: readOrCall, read: readOrCall };
  assert.equal(await verifyPublished(ctx, 'b', '0.0.9'), true);
  assert.equal(await verifyPublished(ctx, 'b', '0.0.10'), false);
});

test('extractReplies parses SSE data lines', () => {
  const sse = 'data: {"type":"message-sent","message":"Hi there"}\n\ndata: {"type":"tool_use","toolName":"CheckAvailability"}\n\ndata: {"type":"message-sent","message":"When works?"}\n';
  assert.deepEqual(extractReplies(sse), { messages: ['Hi there', 'When works?'], tools: ['CheckAvailability'] });
});

test('testSession delete is exempt from Tier 2', () => {
  assert.equal(tierOf('DELETE', '/bot/{botId}/testSession/{leadId}', loadOverrides()), 1);
});

test('pollTestMessages reads a stream that closes and extracts its messages', async () => {
  const encoder = new TextEncoder();
  const fetchImpl = async () => ({
    body: new ReadableStream({
      start(controller) {
        controller.enqueue(encoder.encode('data: {"type":"message-sent","message":"Hi there"}\n\n'));
        controller.enqueue(encoder.encode('data: {"type":"message-sent","message":"When works?"}\n\n'));
        controller.close();
      },
    }),
  });
  const sse = await pollTestMessages({ key: 'k' }, 'bot_x', 'lead_x', 5000, fetchImpl);
  assert.deepEqual(extractReplies(sse), { messages: ['Hi there', 'When works?'], tools: [] });
});

test('pollTestMessages returns within maxTimeMs when the stream never closes (no hang)', async () => {
  // Simulates the real long-poll endpoint: headers arrive, the body stays open. The mock
  // wires the underlying source to the same AbortSignal pollTestMessages creates internally
  // (surfaced to us via fetchImpl's opts.signal) so the pending read() rejects on abort,
  // exactly as a real aborted fetch would — proving the bounded-read fix, not just a mock quirk.
  const fetchImpl = async (url, opts) => ({
    body: new ReadableStream({
      start(controller) {
        opts.signal.addEventListener('abort', () => {
          const e = new Error('aborted'); e.name = 'AbortError';
          controller.error(e);
        }, { once: true });
        // No further enqueue, no close() — the connection just stays open.
      },
    }),
  });
  const t0 = Date.now();
  const sse = await pollTestMessages({ key: 'k' }, 'bot_x', 'lead_x', 200, fetchImpl);
  const elapsed = Date.now() - t0;
  assert.equal(sse, '');
  assert.ok(elapsed < 2000, `expected a bounded return near 200ms, took ${elapsed}ms`);
});

// Report Minor 1 (publish half): cb bot publish --dry-run used to run its pre-flight
// GETs through ctx.call, which under --dry-run returns the request descriptor instead
// of real data — resolveTarget then threw "bot has no versions" on the descriptor
// object. Reads now go through ctx.read (real data always); only the final POST
// /bot/{id}/publish honours --dry-run, and it must never even be reached.
test('publish --dry-run performs real reads via ctx.read, returns the diff, and never touches ctx.call', async () => {
  const spawnImpl = () => ({ status: 0, stdout: JSON.stringify({ framework_parity: { on_framework: true }, red_flags: [] }), stderr: '' });
  const botData = { versions: [{ version: '0.0.1', published: true }, { version: '0.0.2', published: false }] };
  const liveSteps = { nodes: [{ id: 'a', data: { Title: 'Live Title' } }] };
  const targetSteps = { nodes: [{ id: 'a', data: { Title: 'Target Title' } }] };
  const ctx = {
    pos: ['bot_TESTPUBLISH'], confirm: true, dryRun: true, json: false,
    call: async () => { throw new Error('ctx.call must not be reached — --dry-run must stop before the write'); },
    read: async (o) => {
      if (o.path === '/bot/{id}') return { ok: true, status: 200, data: botData };
      if (o.query?.botVersion === '0.0.2') return { ok: true, status: 200, data: targetSteps };
      if (o.query?.botVersion === '0.0.1') return { ok: true, status: 200, data: liveSteps };
      throw new Error(`unexpected read: ${JSON.stringify(o)}`);
    },
  };
  let out = '';
  const origWrite = process.stdout.write.bind(process.stdout);
  process.stdout.write = (s) => { out += s; return true; };
  try {
    await botCommands.publish(ctx, spawnImpl);
  } finally {
    process.stdout.write = origWrite;
  }
  const printed = JSON.parse(out);
  assert.equal(printed.dryRun, true);
  assert.equal(printed.target, '0.0.2');
  assert.equal(printed.live, '0.0.1');
  assert.deepEqual(printed.diff.nodesChanged, [{ id: 'a', title: 'Target Title', fields: ['Title'] }]);
});

// Fix round 1 (2026-09-05): --confirm used to be required even for --dry-run, because
// the confirm gate ran unconditionally before dryRun was ever inspected — a caller who
// only wanted to preview had to pass --confirm too (cb gotcha row 2026-09-05). Confirm
// is now only required on the real (non-dry-run) publish path.
test('publish --dry-run with confirm:false still previews the diff and never touches ctx.call', async () => {
  const spawnImpl = () => ({ status: 0, stdout: JSON.stringify({ framework_parity: { on_framework: true }, red_flags: [] }), stderr: '' });
  const botData = { versions: [{ version: '0.0.1', published: true }, { version: '0.0.2', published: false }] };
  const liveSteps = { nodes: [{ id: 'a', data: { Title: 'Live Title' } }] };
  const targetSteps = { nodes: [{ id: 'a', data: { Title: 'Target Title' } }] };
  const ctx = {
    pos: ['bot_TESTPUBLISH'], confirm: false, dryRun: true, json: false,
    call: async () => { throw new Error('ctx.call must not be reached — --dry-run must stop before the write'); },
    read: async (o) => {
      if (o.path === '/bot/{id}') return { ok: true, status: 200, data: botData };
      if (o.query?.botVersion === '0.0.2') return { ok: true, status: 200, data: targetSteps };
      if (o.query?.botVersion === '0.0.1') return { ok: true, status: 200, data: liveSteps };
      throw new Error(`unexpected read: ${JSON.stringify(o)}`);
    },
  };
  let out = '';
  const origWrite = process.stdout.write.bind(process.stdout);
  process.stdout.write = (s) => { out += s; return true; };
  try {
    await botCommands.publish(ctx, spawnImpl);
  } finally {
    process.stdout.write = origWrite;
  }
  const printed = JSON.parse(out);
  assert.equal(printed.dryRun, true);
  assert.equal(printed.target, '0.0.2');
});

// Fix round 1 (2026-09-05): cb bot push --dry-run used to run the full pushSteps()
// save-then-re-pull dance through ctx.call, which under --dry-run returns a request
// descriptor instead of real save/GET responses — savedVersion came back undefined and
// the "re-pull" compared the descriptor against the original steps, always mismatching,
// so push --dry-run exited 3 with a misleading "UI autosave clobbered" message even
// though nothing was ever sent (cb gotcha row 2026-09-05). push() now short-circuits on
// ctx.dryRun before calling pushSteps at all — one ctx.call for the descriptor, no GET.
test('push --dry-run prints the save descriptor, skips the re-pull, and exits 0', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'cb-push-dryrun-'));
  const file = join(dir, 'steps.json');
  writeFileSync(file, JSON.stringify({ nodes: [{ id: 'a' }, { id: 'b' }], edges: [] }));
  let calls = 0;
  const ctx = {
    pos: ['bot_TESTPUSH', file], dryRun: true, json: false,
    call: async (o) => {
      calls++;
      assert.equal(o.method, 'POST'); assert.equal(o.path, '/bot/{id}/save');
      return { status: 0, ok: true, expected: true, data: { method: 'POST', url: 'https://api.closebot.com/bot/bot_TESTPUSH/save', headers: { 'X-CB-KEY': '***' }, body: o.body } };
    },
    read: async () => { throw new Error('ctx.read must not be reached — --dry-run push never re-pulls'); },
  };
  let out = '';
  const origWrite = process.stdout.write.bind(process.stdout);
  process.stdout.write = (s) => { out += s; return true; };
  try {
    await botCommands.push(ctx);
  } finally {
    process.stdout.write = origWrite;
  }
  assert.equal(calls, 1);
  const printed = JSON.parse(out);
  assert.equal(printed.dryRun, true);
  assert.equal(printed.method, 'POST');
  assert.match(printed.url, /\/bot\/bot_TESTPUSH\/save$/);
  assert.equal(printed.nodes, 2);
});

// C1 fix (2026-09-05): cb-view-agent.sh --json now emits red_flags[]; the pre-flight
// filter in botCommands.publish (which already existed but was permanently inert
// because the field never appeared) is now live. Run through a real subprocess so
// fail()'s process.exit(2) actually terminates the process being asserted on, rather
// than the test runner itself.
test('publish pre-flight: a FAIL red flag blocks a real (non-dry-run, confirmed) publish with exit 2', () => {
  const script = `
    import { botCommands } from ${BOT_LIB};
    const spawnImpl = () => ({ status: 0, stdout: JSON.stringify({
      framework_parity: { on_framework: true },
      red_flags: [{ code: 'MISSING_CALENDAR', severity: 'FAIL', message: 'Method "Booking Agent" has EnableGhlBooking=true but no GhlBookingCalendarId' }],
    }), stderr: '' });
    const botData = { versions: [{ version: '0.0.1', published: true }, { version: '0.0.2', published: false }] };
    const ctx = {
      pos: ['bot_TESTPUBLISH'], confirm: true, dryRun: false, json: false,
      call: async () => { throw new Error('ctx.call must not be reached — a FAIL red flag must stop pre-flight before any write'); },
      read: async (o) => {
        if (o.path === '/bot/{id}') return { ok: true, status: 200, data: botData };
        throw new Error('unexpected read: ' + JSON.stringify(o));
      },
    };
    await botCommands.publish(ctx, spawnImpl);
  `;
  const r = spawnSync('node', ['--input-type=module', '-e', script], { encoding: 'utf8' });
  assert.equal(r.status, 2, r.stderr);
  assert.match(r.stderr, /MISSING_CALENDAR/);
  assert.match(r.stderr, /FAIL red flag/);
});

test('publish pre-flight: WARN-only red flags do not block — a --dry-run publish still reaches the diff', () => {
  const script = `
    import { botCommands } from ${BOT_LIB};
    const spawnImpl = () => ({ status: 0, stdout: JSON.stringify({
      framework_parity: { on_framework: true },
      red_flags: [{ code: 'TITLE_COLLISION', severity: 'WARN', message: 'title "Transfer Message" appears 3x' }],
    }), stderr: '' });
    const botData = { versions: [{ version: '0.0.1', published: true }, { version: '0.0.2', published: false }] };
    const liveSteps = { nodes: [{ id: 'a', data: { Title: 'Live Title' } }] };
    const targetSteps = { nodes: [{ id: 'a', data: { Title: 'Target Title' } }] };
    const ctx = {
      pos: ['bot_TESTPUBLISH'], confirm: true, dryRun: true, json: false,
      call: async () => { throw new Error('ctx.call must not be reached under --dry-run'); },
      read: async (o) => {
        if (o.path === '/bot/{id}') return { ok: true, status: 200, data: botData };
        if (o.query?.botVersion === '0.0.2') return { ok: true, status: 200, data: targetSteps };
        if (o.query?.botVersion === '0.0.1') return { ok: true, status: 200, data: liveSteps };
        throw new Error('unexpected read: ' + JSON.stringify(o));
      },
    };
    await botCommands.publish(ctx, spawnImpl);
  `;
  const r = spawnSync('node', ['--input-type=module', '-e', script], { encoding: 'utf8' });
  assert.equal(r.status, 0, r.stderr);
  const printed = JSON.parse(r.stdout);
  assert.equal(printed.dryRun, true);
  assert.equal(printed.target, '0.0.2');
});

// --lead <leadId> (2026-09-05): multi-turn probes (closebot-quality-audit's
// multi-offer-probe.sh) need one session across turns. With --lead, cb bot test must
// neither create nor delete a session — the caller owns it.
function captureStdout(fn) {
  let out = '';
  const orig = process.stdout.write.bind(process.stdout);
  process.stdout.write = (s) => { out += s; return true; };
  return fn().finally(() => { process.stdout.write = orig; }).then(() => JSON.parse(out));
}
const SSE_ONE = 'data: {"type":"message-sent","message":"yo"}\n\n';

test('bot test --lead reuses the given session: no create, no delete, message carries the leadId', async () => {
  const calls = [];
  const ctx = {
    pos: ['bot_X', 'hello'], flags: { lead: 'lead_OWNED' }, dryRun: false,
    call: async (o) => { calls.push(o); return { ok: true, status: 200, data: {} }; },
  };
  const printed = await captureStdout(() => botCommands.test(ctx, async () => SSE_ONE));
  assert.deepEqual(calls.map((c) => `${c.method} ${c.path}`), ['POST /bot/{botId}/testSession/message']);
  assert.equal(calls[0].body.leadId, 'lead_OWNED');
  assert.equal(printed.leadId, 'lead_OWNED');
  assert.equal(printed.session, 'reused');
  assert.deepEqual(printed.replies, ['yo']);
});

test('bot test without --lead keeps the ephemeral lifecycle: create, message, delete', async () => {
  const calls = [];
  const ctx = {
    pos: ['bot_X', 'hello'], flags: {}, dryRun: false,
    call: async (o) => { calls.push(o); return { ok: true, status: 200, data: o.method === 'POST' && o.path === '/bot/{botId}/testSession' ? { leadId: 'lead_EPH' } : {} }; },
  };
  const printed = await captureStdout(() => botCommands.test(ctx, async () => SSE_ONE));
  assert.deepEqual(calls.map((c) => `${c.method} ${c.path}`), [
    'POST /bot/{botId}/testSession', 'POST /bot/{botId}/testSession/message', 'DELETE /bot/{botId}/testSession/{leadId}',
  ]);
  assert.equal(calls[2].params.leadId, 'lead_EPH');
  assert.equal(printed.session, 'ephemeral');
});
