import { test } from 'node:test';
import assert from 'node:assert/strict';
import { writeFileSync, mkdtempSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { summarizeDiff, verifyPublished, extractReplies, sendTestTurn, botCommands } from '../lib/bot.mjs';
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

test('sendTestTurn subscribes before POST and collects fast multi-bubble replies', async () => {
  const encoder = new TextEncoder();
  let streamOpened = false;
  let controller;
  const fetchImpl = async () => ({
    ok: true, status: 200,
    body: new ReadableStream({
      start(c) {
        streamOpened = true;
        controller = c;
        // Deliberately split a JSON event across network chunks.
        c.enqueue(encoder.encode('data: {"type":"connec'));
        c.enqueue(encoder.encode('ted"}\r\n\r\n'));
      },
    }),
  });
  const ctx = { key: 'k', call: async (o) => {
    assert.equal(streamOpened, true);
    assert.equal(o.body.leadId, 'lead_x');
    controller.enqueue(encoder.encode('data: {"type":"message-sent","message":"Hi there"}\n\n'));
    controller.enqueue(encoder.encode('data: {"type":"tool_use","toolName":"Calendar"}\n\n'));
    controller.enqueue(encoder.encode('data: {"type":"message-sent","message":"When works?"}\n\n'));
    return { ok: true, status: 200, data: {} };
  } };
  const out = await sendTestTurn(ctx, 'bot_x', 'lead_x', 'hello', 1000, 100, fetchImpl);
  assert.deepEqual(out, { messages: ['Hi there', 'When works?'], tools: ['Calendar'] });
});

test('sendTestTurn refuses to send when SSE never emits connected', async () => {
  const fetchImpl = async (url, opts) => ({
    ok: true, status: 200,
    body: new ReadableStream({
      start(controller) {
        opts.signal.addEventListener('abort', () => {
          const e = new Error('aborted'); e.name = 'AbortError';
          controller.error(e);
        }, { once: true });
      },
    }),
  });
  const t0 = Date.now();
  await assert.rejects(sendTestTurn({ key: 'k', call: async () => { throw new Error('POST should not run'); } }, 'bot_x', 'lead_x', 'hello', 100, 100, fetchImpl), /did not connect/);
  const elapsed = Date.now() - t0;
  assert.ok(elapsed < 2000, `expected a bounded return near 100ms, took ${elapsed}ms`);
});

test('sendTestTurn bounds a connected stream with no reply', async () => {
  const encoder = new TextEncoder();
  const fetchImpl = async () => ({ ok: true, status: 200, body: new ReadableStream({ start(c) { c.enqueue(encoder.encode('data: {"type":"connected"}\n\n')); } }) });
  let sent = false;
  const out = await sendTestTurn({ key: 'k', call: async () => { sent = true; return { ok: true, status: 200, data: {} }; } }, 'bot_x', 'lead_x', 'hello', 100, 50, fetchImpl);
  assert.equal(sent, true);
  assert.deepEqual(out, { messages: [], tools: [] });
});

test('sendTestTurn resolves with no replies when the stream closes after the send', async () => {
  const encoder = new TextEncoder();
  let controller;
  const fetchImpl = async () => ({ ok: true, status: 200, body: new ReadableStream({ start(c) { controller = c; c.enqueue(encoder.encode('data: {"type":"connected"}\n\n')); } }) });
  const out = await sendTestTurn({ key: 'k', call: async () => { controller.close(); return { ok: true, status: 200, data: {} }; } }, 'bot_x', 'lead_x', 'hello', 1000, 50, fetchImpl);
  assert.deepEqual(out, { messages: [], tools: [] });
});

test('sendTestTurn ignores an empty message-sent event', async () => {
  const encoder = new TextEncoder();
  let controller;
  const fetchImpl = async () => ({ ok: true, status: 200, body: new ReadableStream({ start(c) { controller = c; c.enqueue(encoder.encode('data: {"type":"connected"}\n\n')); } }) });
  const out = await sendTestTurn({ key: 'k', call: async () => {
    controller.enqueue(encoder.encode('data: {"type":"message-sent","message":""}\n\n'));
    controller.enqueue(encoder.encode('data: {"type":"message-sent","message":"Real reply"}\n\n'));
    return { ok: true, status: 200, data: {} };
  } }, 'bot_x', 'lead_x', 'hello', 1000, 50, fetchImpl);
  assert.deepEqual(out.messages, ['Real reply']);
});

test('sendTestTurn with drainMs does not count a late bubble from the previous turn', async () => {
  const encoder = new TextEncoder();
  let controller, sentAt = 0;
  const fetchImpl = async () => ({ ok: true, status: 200, body: new ReadableStream({ start(c) {
    controller = c;
    c.enqueue(encoder.encode('data: {"type":"connected"}\n\n'));
    // The previous turn's third bubble lands just after this turn subscribes.
    setTimeout(() => c.enqueue(encoder.encode('data: {"type":"message-sent","message":"old bubble"}\n\n')), 20);
  } }) });
  const out = await sendTestTurn({ key: 'k', call: async () => {
    sentAt = Date.now();
    controller.enqueue(encoder.encode('data: {"type":"message-sent","message":"new reply"}\n\n'));
    return { ok: true, status: 200, data: {} };
  } }, 'bot_x', 'lead_x', 'hello', 2000, 50, fetchImpl, 80);
  assert.ok(sentAt > 0);
  assert.deepEqual(out.messages, ['new reply']);
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
const TURN_ONE = { messages: ['yo'], tools: [] };

test('bot test --lead reuses the given session: no create, no delete, message carries the leadId', async () => {
  const calls = [];
  const ctx = {
    pos: ['bot_X', 'hello'], flags: { lead: 'lead_OWNED' }, dryRun: false,
    call: async (o) => { calls.push(o); return { ok: true, status: 200, data: {} }; },
  };
  const printed = await captureStdout(() => botCommands.test(ctx, async (_ctx, botId, leadId, msg) => {
    assert.deepEqual([botId, leadId, msg], ['bot_X', 'lead_OWNED', 'hello']);
    return TURN_ONE;
  }));
  assert.deepEqual(calls, []);
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
  const printed = await captureStdout(() => botCommands.test(ctx, async () => TURN_ONE));
  assert.deepEqual(calls.map((c) => `${c.method} ${c.path}`), [
    'POST /bot/{botId}/testSession', 'DELETE /bot/{botId}/testSession/{leadId}',
  ]);
  assert.equal(calls[1].params.leadId, 'lead_EPH');
  assert.equal(printed.session, 'ephemeral');
});

test('persistent session lifecycle applies source mimic before first turn and leaves cleanup to caller', async () => {
  const calls = [];
  const ctx = {
    pos: ['bot_X'], flags: { source: 'src_REAL' }, dryRun: false,
    call: async (o) => {
      calls.push(o);
      return { ok: true, status: 200, data: o.path === '/bot/{botId}/testSession' ? { leadId: 'lead_PERSIST' } : {} };
    },
  };
  const created = await captureStdout(() => botCommands['session-create'](ctx));
  assert.equal(created.leadId, 'lead_PERSIST');
  assert.deepEqual(calls.map(o => `${o.method} ${o.path}`), ['POST /bot/{botId}/testSession', 'PUT /bot/{botId}/testSession/{leadId}']);
  assert.deepEqual(calls[1].body, { mimicSourceId: 'src_REAL' });
  const said = await captureStdout(() => botCommands['session-say']({ ...ctx, pos: ['bot_X', 'lead_PERSIST', 'hello'], flags: {} }, async () => TURN_ONE));
  assert.deepEqual(said.replies, ['yo']);
  assert.equal(said.status, 'replied');
  assert.equal(calls.length, 2);
  const deleted = await captureStdout(() => botCommands['session-delete']({ ...ctx, pos: ['bot_X', 'lead_PERSIST'], flags: {} }));
  assert.equal(deleted.deleted, true);
  assert.equal(calls.at(-1).method, 'DELETE');
});

test('session-create removes the fresh lead when source mimic fails', async () => {
  const calls = [];
  const ctx = {
    pos: ['bot_X'], flags: { source: 'src_X' }, dryRun: false,
    call: async (o) => {
      calls.push(o);
      if (o.method === 'POST') return { ok: true, status: 200, data: { leadId: 'lead_NEW' } };
      if (o.method === 'PUT') return { ok: false, status: 400, data: { error: 'bad source' } };
      return { ok: true, status: 200, data: {} };
    },
  };
  await assert.rejects(botCommands['session-create'](ctx), /PUT.*400/);
  assert.deepEqual(calls.map(o => o.method), ['POST', 'PUT', 'DELETE']);
  assert.equal(calls[2].params.leadId, 'lead_NEW');
});

test('session-say prints no-reply JSON and exits 3 after a bounded timeout', () => {
  const script = `
    import { botCommands } from ${BOT_LIB};
    await botCommands['session-say'](
      {pos:['bot_X','lead_X','hello'],flags:{},dryRun:false},
      async () => ({messages:[],tools:[]})
    );
  `;
  const r = spawnSync('node', ['--input-type=module', '-e', script], { encoding: 'utf8' });
  assert.equal(r.status, 3, r.stderr);
  assert.deepEqual(JSON.parse(r.stdout), {
    botId: 'bot_X', leadId: 'lead_X', sent: 'hello', replies: [], tools: [], timedOut: true, status: 'no_reply',
  });
});

test('bot test with no reply prints no_reply and exits 3, like session-say', () => {
  const script = `
    import { botCommands } from ${BOT_LIB};
    await botCommands.test(
      {pos:['bot_X','hello'],flags:{lead:'lead_X'},dryRun:false,call:async()=>({ok:true,status:200,data:{}})},
      async () => ({messages:[],tools:[]})
    );
  `;
  const r = spawnSync('node', ['--input-type=module', '-e', script], { encoding: 'utf8' });
  assert.equal(r.status, 3, r.stderr);
  const out = JSON.parse(r.stdout);
  assert.deepEqual(out.replies, []);
  assert.equal(out.status, 'no_reply');
});

test('session-create blames the persona only when the session status says no_persona', () => {
  const runCreate = (status) => spawnSync('node', ['--input-type=module', '-e', `
    import { botCommands } from ${BOT_LIB};
    await botCommands['session-create']({pos:['bot_X'],flags:{},dryRun:false,
      call:async(o)=>o.method==='POST'?{ok:false,status:${status === 'no_persona' ? 200 : 401},data:null}:{ok:true,status:200,data:{mostRecentFailureReason:${JSON.stringify(status)}}}});
  `], { encoding: 'utf8' });
  const persona = runCreate('no_persona');
  assert.equal(persona.status, 3);
  assert.match(persona.stderr, /persona/);
  const auth = runCreate(null);
  assert.equal(auth.status, 3);
  assert.doesNotMatch(auth.stderr, /persona/);
  assert.match(auth.stderr, /HTTP 401/);
});
