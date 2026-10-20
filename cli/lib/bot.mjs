import { readFileSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { join } from 'node:path';
import { resolveTarget } from './versions.mjs';
import { printJson, fail } from './output.mjs';
import { REPO_DIR, isSandbox } from './config.mjs';
import { buildUrl } from './http.mjs';

const REST = 'https://api.closebot.com';
const UI_KEYS = new Set(['position', 'positionAbsolute', 'selected', 'dragging', 'width', 'height', 'deletable']);

// Sorts object keys recursively (arrays keep their order) so JSON.stringify comparison
// is insensitive to key insertion order at any depth, not just the top level.
function sortKeysDeep(v) {
  if (Array.isArray(v)) return v.map(sortKeysDeep);
  if (v && typeof v === 'object') return Object.fromEntries(Object.keys(v).sort().map(k => [k, sortKeysDeep(v[k])]));
  return v;
}

export function canonicalSteps(steps) {
  const nodes = (steps.nodes || []).map(n => Object.fromEntries(Object.entries(n).filter(([k]) => !UI_KEYS.has(k))))
    .sort((a, b) => String(a.id).localeCompare(String(b.id)));
  const edges = [...(steps.edges || [])].sort((a, b) => String(a.id ?? `${a.source}\u0000${a.target}`).localeCompare(String(b.id ?? `${b.source}\u0000${b.target}`)));
  // Every OTHER top-level key (variables, customTools, enabledGlobalToolNames, mcpServers,
  // and anything the API adds later) is compared as-is rather than allowlisted — a server
  // that silently drops or mangles a sibling key like mcpServers must fail the landed
  // check, not pass it because canonicalSteps never looked at it.
  const rest = {};
  for (const k of Object.keys(steps)) if (k !== 'nodes' && k !== 'edges') rest[k] = steps[k];
  return sortKeysDeep({ nodes, edges, ...rest });
}
export function stepsEqual(a, b) { return JSON.stringify(canonicalSteps(a)) === JSON.stringify(canonicalSteps(b)); }

// Reads always use ctx.read (falls back to ctx.call for older/test contexts that only
// define call) rather than ctx.call, so a composite's pre-flight/diff GETs run for real
// even under --dry-run — --dry-run means "don't write", not "don't read". Only the
// mutating POST/DELETE calls (elsewhere in this file) use ctx.call, which is the one
// that actually honours --dry-run by returning the request descriptor unsent.
export async function getBot(ctx, id) {
  const r = await (ctx.read || ctx.call)({ method: 'GET', base: REST, path: '/bot/{id}', params: { id } });
  if (!r.ok) fail(3, `GET /bot/${id} → ${r.status}`);
  return r.data;
}
export async function getSteps(ctx, id, version) {
  const r = await (ctx.read || ctx.call)({ method: 'GET', base: REST, path: '/bot/{id}/steps', params: { id }, query: { botVersion: version } });
  if (!r.ok) fail(3, `GET /bot/${id}/steps?botVersion=${version} → ${r.status} ${r.note ?? ''}`);
  return r.data;
}
export async function pushSteps(ctx, id, steps) {
  const r = await ctx.call({ method: 'POST', base: REST, path: '/bot/{id}/save', params: { id }, body: { botSteps: steps } });
  if (!r.ok) fail(3, `POST /bot/${id}/save → ${r.status}: ${JSON.stringify(r.data).slice(0, 400)}`);
  const { version: savedVersion, invalidPaths = [] } = r.data || {};
  if (invalidPaths.length) return { savedVersion, invalidPaths, landed: false };
  const back = await ctx.call({ method: 'GET', base: REST, path: '/bot/{id}/steps', params: { id }, query: { botVersion: savedVersion } });
  return { savedVersion, invalidPaths, landed: back.ok && stepsEqual(steps, back.data), repullOk: back.ok, repullStatus: back.status };
}

const title = n => n?.data?.Title ?? n?.data?.name ?? n?.id;
export function summarizeDiff(live, tgt) {
  const L = new Map((live.nodes || []).map(n => [n.id, n])), T = new Map((tgt.nodes || []).map(n => [n.id, n]));
  const nodesAdded = [...T.values()].filter(n => !L.has(n.id)).map(title);
  const nodesRemoved = [...L.values()].filter(n => !T.has(n.id)).map(title);
  const nodesChanged = [];
  for (const [id, t] of T) {
    const l = L.get(id); if (!l) continue;
    const fields = [...new Set([...Object.keys(l.data || {}), ...Object.keys(t.data || {})])].filter(k => JSON.stringify(l.data?.[k]) !== JSON.stringify(t.data?.[k]));
    if (fields.length) nodesChanged.push({ id, title: title(t), fields });
  }
  return { nodesAdded, nodesRemoved, nodesChanged };
}
export async function verifyPublished(ctx, id, version) {
  const r = await (ctx.read || ctx.call)({ method: 'GET', base: REST, path: '/bot/{id}', params: { id } });
  return !!(r.ok && (r.data?.versions || []).some(v => v.version === version && v.published === true));
}
// One SSE line -> event object, or null for blank/heartbeat/malformed lines. Shared by
// extractReplies and sendTestTurn so the two can't disagree on what counts as an event.
export function parseSseLine(line) {
  line = line.replace(/\r$/, '');
  if (line === 'event: connected') return { type: 'connected' };
  if (!line.startsWith('data:')) return null;
  const data = line.slice(5).trim();
  if (data === 'connected') return { type: 'connected' };
  try { return JSON.parse(data); } catch { return null; }
}
const isReply = e => e?.type === 'message-sent' && typeof e.message === 'string' && e.message !== '';
export function extractReplies(sse) {
  const messages = [], tools = [];
  for (const line of String(sse).split('\n')) {
    const j = parseSseLine(line);
    if (isReply(j)) messages.push(j.message);
    if (j?.type === 'tool_use' && j.toolName) tools.push(j.toolName);
  }
  return { messages, tools };
}
// spawnImpl is injectable (defaults to the real spawnSync) so botCommands.audit/publish
// can be unit-tested without shelling out to the real cb-view-agent.sh / network.
export function audit(id, json, spawnImpl = spawnSync) {
  return spawnImpl('bash', [join(REPO_DIR, 'scripts', 'cb-view-agent.sh'), id, ...(json ? ['--json'] : [])], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
}

// The testSession SSE endpoint is live-only: subscribing after POST /message loses fast
// replies. Wait for its connected event before sending, then collect every reply bubble
// until the stream is quiet (or the hard deadline). fetchImpl is injectable for tests.
// drainMs > 0 (reused sessions): before sending, wait until no bubble has arrived for
// drainMs, so a late bubble from the previous turn isn't counted as this turn's reply.
export async function sendTestTurn(ctx, botId, leadId, message, maxTimeMs, settleMs = 2500, fetchImpl = fetch, drainMs = 0) {
  const url = buildUrl(REST, '/bot/{botId}/testSession/messages/{leadId}', { botId, leadId });
  const ctrl = new AbortController();
  let readyResolve, readyReject, doneResolve, doneReject;
  const ready = new Promise((resolve, reject) => { readyResolve = resolve; readyReject = reject; });
  const done = new Promise((resolve, reject) => { doneResolve = resolve; doneReject = reject; });
  // A send failure can end the turn before its result is awaited.
  done.catch(() => {});
  const replies = [], tools = [];
  let connected = false, finished = false, sent = false, quietTimer, reader, drainTimer, drainResolve;
  const finish = (error = null) => {
    if (finished) return;
    finished = true;
    drainResolve?.();
    if (!connected) readyReject(error || new Error('test-session SSE closed before connected'));
    if (error) doneReject(error); else doneResolve({ messages: replies, tools });
    ctrl.abort();
  };
  const deadline = setTimeout(() => finish(connected ? null : new Error('test-session SSE did not connect before timeout')), maxTimeMs);
  const onEvent = (event) => {
    if (event?.type === 'connected') {
      if (!connected) { connected = true; readyResolve(); }
      return;
    }
    if (connected && !sent && drainResolve && isReply(event)) {
      clearTimeout(drainTimer);
      drainTimer = setTimeout(drainResolve, drainMs);
    }
    if (!connected || !sent) return;
    if (isReply(event)) replies.push(event.message);
    if (event?.type === 'tool_use' && event.toolName) tools.push(event.toolName);
    if (replies.length) {
      clearTimeout(quietTimer);
      quietTimer = setTimeout(() => finish(), settleMs);
    }
  };
  const stream = (async () => {
    let pending = '';
    const consume = (chunk) => {
      pending += chunk;
      for (;;) {
        const end = pending.indexOf('\n');
        if (end < 0) break;
        const event = parseSseLine(pending.slice(0, end));
        pending = pending.slice(end + 1);
        if (event) onEvent(event);
      }
    };
    try {
      const resp = await fetchImpl(url, { method: 'GET', headers: { 'X-CB-KEY': ctx.key, Accept: 'text/event-stream' }, signal: ctrl.signal });
      if (!resp.ok) throw new Error(`GET test-session SSE → HTTP ${resp.status}`);
      reader = resp.body?.getReader?.();
      if (!reader) throw new Error('GET test-session SSE returned no readable stream');
      const decoder = new TextDecoder();
      while (!finished) {
        const { done: ended, value } = await reader.read();
        if (ended) break;
        consume(decoder.decode(value, { stream: true }));
      }
      consume(decoder.decode());
      // Closed after the send: a turn with no reply (empty result), not a transport error.
      if (!finished) finish(connected && sent ? null : new Error(`test-session SSE closed before ${connected ? 'the message was sent' : 'connected'}`));
    } catch (error) {
      if (!finished) finish(error);
    }
  })();
  try {
    await ready;
    if (drainMs > 0 && !finished) await new Promise(resolve => { drainResolve = resolve; drainTimer = setTimeout(resolve, drainMs); });
    drainResolve = null;
    if (finished) throw new Error('test-session SSE closed before message could be sent');
    // The reply can arrive before POST returns, so begin collecting first.
    sent = true;
    const response = await ctx.call({ method: 'POST', base: REST, path: '/bot/{botId}/testSession/message', params: { botId }, body: { leadId, message } });
    if (!response.ok) throw new Error(`POST /bot/${botId}/testSession/message → ${response.status}: ${JSON.stringify(response.data).slice(0, 300)}`);
    return await done;
  } finally {
    clearTimeout(deadline);
    clearTimeout(quietTimer);
    clearTimeout(drainTimer);
    ctrl.abort();
    reader?.cancel().catch(() => {});
    void stream;
  }
}

export const botCommands = {
  async version(ctx) {
    const [id] = ctx.pos; if (!id) fail(2, 'usage: cb bot version <bot_id>');
    printJson(resolveTarget(await getBot(ctx, id)));
  },
  async pull(ctx) {
    const [id] = ctx.pos; if (!id) fail(2, 'usage: cb bot pull <bot_id> [--version v] [--out file]');
    const v = ctx.flags.version || resolveTarget(await getBot(ctx, id)).target;
    const steps = await getSteps(ctx, id, v);
    if (ctx.flags.out) { writeFileSync(ctx.flags.out, JSON.stringify(steps, null, 2)); printJson({ version: v, out: ctx.flags.out, nodes: steps.nodes?.length }); }
    else printJson(steps);
  },
  async push(ctx) {
    const [id, file] = ctx.pos; if (!id || !file) fail(2, 'usage: cb bot push <bot_id> <steps.json>');
    const steps = JSON.parse(readFileSync(file, 'utf8'));
    // --dry-run: print the save request descriptor (ctx.call's dry-run branch already
    // builds it — method/url/masked-key, no real POST) and stop. Deliberately skips the
    // pre-push getBot() and the whole pushSteps() re-pull/landed dance — there is nothing
    // to verify a landing against when nothing was sent.
    if (ctx.dryRun) {
      const d = await ctx.call({ method: 'POST', base: REST, path: '/bot/{id}/save', params: { id }, body: { botSteps: steps } });
      return printJson({ dryRun: true, method: d.data?.method, url: d.data?.url, nodes: steps.nodes?.length });
    }
    const before = resolveTarget(await getBot(ctx, id));
    const r = await pushSteps(ctx, id, steps);
    if (r.invalidPaths.length) fail(3, `save rejected, invalidPaths: ${JSON.stringify(r.invalidPaths)}`);
    if (!r.repullOk) fail(3, `save returned version ${r.savedVersion} with clean invalidPaths, but the re-pull GET /bot/${id}/steps?botVersion=${r.savedVersion} failed (HTTP ${r.repullStatus}). Cannot verify whether the save landed — retry the re-pull before assuming a clobber.`);
    if (!r.landed) fail(3, `save returned version ${r.savedVersion} with clean invalidPaths but re-pull does not match what was sent. A UI editor autosave clobbered the API save — close the app.closebot.com tab for this bot and push again.`);
    printJson({ savedVersion: r.savedVersion, previousTarget: before.target, landed: true });
  },
};

Object.assign(botCommands, {
  async audit(ctx, spawnImpl = spawnSync) {
    const [id] = ctx.pos; if (!id) fail(2, 'usage: cb bot audit <bot_id> [--json]');
    const r = audit(id, ctx.json, spawnImpl);
    // spawnSync sets r.error (and leaves status null) when the executable itself couldn't
    // be run (missing/non-executable scripts/cb-view-agent.sh) — surface that instead of
    // silently exiting 3 with no explanation.
    if (r.error) process.stderr.write(`cb: audit spawn failed: ${r.error.message}\n`);
    process.stdout.write(r.stdout || ''); process.stderr.write(r.stderr || ''); process.exit(r.status ?? 3);
  },
  async publish(ctx, spawnImpl = spawnSync) {
    const [id] = ctx.pos; if (!id) fail(2, 'usage: cb bot publish <bot_id> --confirm');
    // Sandbox refusal comes before the confirm gate — a --dry-run against the sandbox
    // bot must still exit 4, not silently preview a "publish" of a bot that can never
    // actually go live.
    if (isSandbox(id)) fail(4, `${id} is the [CB-SANDBOX] bot and is never published`);
    // --confirm is only required on the real (non-dry-run) path: --dry-run never sends
    // the POST below regardless of --confirm, so gating the preview on --confirm too
    // just hid the diff from a caller who hadn't decided to publish yet.
    if (!ctx.confirm && !ctx.dryRun) fail(4, 'publish is Tier 2: pass --confirm after the user has approved in this same turn (not required for --dry-run, which never sends the POST)');
    const bot = await getBot(ctx, id); const t = resolveTarget(bot);
    if (t.liveEqualsTarget) fail(2, `nothing to publish: highest version ${t.target} is already live`);
    const a = audit(id, true, spawnImpl); let aj; try { aj = JSON.parse(a.stdout); } catch { fail(2, `pre-flight: cb-view-agent --json did not return JSON:\n${(a.stderr || a.stdout).slice(0, 800)}`); }
    if (aj.framework_parity?.on_framework !== true) fail(2, `pre-flight: FRAMEWORK GAP — bot is not on the canonical framework. Run closebot-apply-template first.`);
    const fails = (aj.red_flags || []).filter(f => f.severity === 'FAIL');
    if (fails.length) fail(2, `pre-flight: ${fails.length} FAIL red flag(s):\n${fails.map(f => ` - ${f.code ?? ''} ${f.message ?? JSON.stringify(f)}`).join('\n')}`);
    const target = await getSteps(ctx, id, t.target);
    const live = t.live ? await getSteps(ctx, id, t.live) : { nodes: [] };
    const diff = summarizeDiff(live, target);
    process.stderr.write(`publishing ${t.target} over live ${t.live ?? '(none)'}\n${JSON.stringify(diff, null, 2)}\n`);
    if (ctx.dryRun) return printJson({ dryRun: true, target: t.target, live: t.live, diff });
    const r = await ctx.call({ method: 'POST', base: REST, path: '/bot/{id}/publish', params: { id } });
    if (!r.ok) fail(3, `POST /bot/${id}/publish → ${r.status}: ${JSON.stringify(r.data).slice(0, 300)}`);
    const ok = await verifyPublished(ctx, id, t.target);
    if (!ok) fail(3, `publish returned ${r.status} but GET /bot/${id} does not show ${t.target} as published — do not trust the response body; investigate before retrying`);
    printJson({ published: t.target, previousLive: t.live, diff });
  },
  async test(ctx, turnImpl = sendTestTurn) {
    const [id, msg] = ctx.pos; if (!id || !msg) fail(2, 'usage: cb bot test <bot_id> "<message>" [--max-time 30] [--settle-ms 2500] [--lead <leadId>]');
    // Under --dry-run, ctx.call would return the request descriptor as `data` for the
    // testSession POST, so `s.data?.leadId` is undefined and the command falls into a
    // misleading "could not create test session" failure. There's no meaningful dry run
    // of a real ephemeral test session — refuse outright instead of half-running.
    if (ctx.dryRun) fail(2, 'cb bot test cannot be dry-run: it creates and deletes a real ephemeral test session');
    const { maxTimeMs, settleMs } = testTiming(ctx.flags);
    // --lead <leadId>: reuse a test session the caller created with
    // `cb bot session-create` and still owns. Multi-turn probes need the bot's
    // conversation memory to carry across turns, which a fresh session per call can't
    // give. With --lead there is no create and no delete — the caller cleans up with
    // `cb bot session-delete` when the probe is done.
    const ownLead = typeof ctx.flags?.lead === 'string' && ctx.flags.lead ? ctx.flags.lead : null;
    const leadId = ownLead ?? await createSession(ctx, id);
    // Everything from here on must clean up the ephemeral test lead even on failure — hence
    // the try/finally. Note: fail() calls process.exit(), which does NOT run pending finally
    // blocks (a real process exit, not a throw), so a mid-flight failure is captured into
    // `failure` and only turned into fail(3, …) after the finally's DELETE has already run.
    let failure = null, out = { messages: [], tools: [] };
    try {
      out = await turnImpl(ctx, id, leadId, msg, maxTimeMs, settleMs, undefined, ownLead ? settleMs : 0);
    } catch (e) {
      failure = e.message;
    } finally {
      if (ownLead) { /* caller-owned session: never delete it here */ }
      else try {
        const d = await ctx.call({ method: 'DELETE', base: REST, path: '/bot/{botId}/testSession/{leadId}', params: { botId: id, leadId } });
        if (!d.ok) process.stderr.write(`cb: warning: failed to delete ephemeral test session leadId=${leadId} (HTTP ${d.status}) — clean up manually\n`);
      } catch (de) {
        process.stderr.write(`cb: warning: failed to delete ephemeral test session leadId=${leadId}: ${de.message} — clean up manually\n`);
      }
    }
    if (failure) fail(3, failure);
    const timedOut = out.messages.length === 0;
    printJson({ leadId, session: ownLead ? 'reused' : 'ephemeral', sent: msg, replies: out.messages, tools: out.tools, timedOut, status: timedOut ? 'no_reply' : 'replied' });
    if (timedOut) process.exitCode = 3;
  },
  async 'session-create'(ctx) {
    const [id] = ctx.pos;
    if (!id) fail(2, 'usage: cb bot session-create <bot_id> [--source <sourceId>]');
    if (ctx.dryRun) fail(2, 'cb bot session-create cannot be dry-run: it must return a real leadId');
    const source = ctx.flags.source;
    if (source && typeof source !== 'string') fail(2, '--source requires a source ID');
    const leadId = await createSession(ctx, id);
    if (source) {
      try {
        const updated = await ctx.call({ method: 'PUT', base: REST, path: '/bot/{botId}/testSession/{leadId}', params: { botId: id, leadId }, body: { mimicSourceId: source } });
        if (!updated.ok) throw new Error(`PUT /bot/${id}/testSession/${leadId} → ${updated.status}: ${JSON.stringify(updated.data).slice(0, 300)}`);
      } catch (error) {
        try {
          const cleanup = await ctx.call({ method: 'DELETE', base: REST, path: '/bot/{botId}/testSession/{leadId}', params: { botId: id, leadId } });
          if (!cleanup.ok) process.stderr.write(`cb: warning: test session leadId=${leadId} may need manual cleanup (HTTP ${cleanup.status})\n`);
        } catch { process.stderr.write(`cb: warning: test session leadId=${leadId} may need manual cleanup\n`); }
        throw error;
      }
    }
    printJson({ botId: id, leadId, sourceId: source ?? null, session: 'persistent' });
  },
  async 'session-say'(ctx, turnImpl = sendTestTurn) {
    const [id, leadId, message] = ctx.pos;
    if (!id || !leadId || !message) fail(2, 'usage: cb bot session-say <bot_id> <lead_id> "<message>" [--max-time 30] [--settle-ms 2500]');
    if (ctx.dryRun) fail(2, 'cb bot session-say cannot be dry-run: it sends a real test-session message');
    const { maxTimeMs, settleMs } = testTiming(ctx.flags);
    const out = await turnImpl(ctx, id, leadId, message, maxTimeMs, settleMs, undefined, settleMs);
    const timedOut = out.messages.length === 0;
    printJson({ botId: id, leadId, sent: message, replies: out.messages, tools: out.tools, timedOut, status: timedOut ? 'no_reply' : 'replied' });
    if (timedOut) process.exitCode = 3;
  },
  async 'session-delete'(ctx) {
    const [id, leadId] = ctx.pos;
    if (!id || !leadId) fail(2, 'usage: cb bot session-delete <bot_id> <lead_id>');
    if (ctx.dryRun) fail(2, 'cb bot session-delete cannot be dry-run: no session would be deleted');
    const deleted = await ctx.call({ method: 'DELETE', base: REST, path: '/bot/{botId}/testSession/{leadId}', params: { botId: id, leadId } });
    if (!deleted.ok) fail(3, `DELETE /bot/${id}/testSession/${leadId} → ${deleted.status}: ${JSON.stringify(deleted.data).slice(0, 300)}`);
    printJson({ botId: id, leadId, deleted: true });
  },
});

// POST /bot/{id}/testSession -> leadId. On failure, reads the session status so the
// error names the real cause; the persona hint appears only when it is the cause.
async function createSession(ctx, id) {
  const created = await ctx.call({ method: 'POST', base: REST, path: '/bot/{botId}/testSession', params: { botId: id }, body: {} });
  const leadId = created.data?.leadId;
  if (created.ok && leadId) return leadId;
  const st = await (ctx.read || ctx.call)({ method: 'GET', base: REST, path: '/bot/{botId}/testSession', params: { botId: id } });
  const detail = JSON.stringify(st.data ?? created.data).slice(0, 400);
  const persona = /no_persona/.test(JSON.stringify([created.data, st.data])) ? '\nThe bot has no usable persona: assign one in the CloseBot UI (no API path).' : '';
  fail(3, `could not create test session: POST /bot/${id}/testSession → HTTP ${created.status}. Session status: ${detail}${persona}`);
}

function testTiming(flags = {}) {
  if (flags['max-time'] !== undefined && typeof flags['max-time'] !== 'string') fail(2, '--max-time requires a value in seconds');
  if (flags['settle-ms'] !== undefined && typeof flags['settle-ms'] !== 'string') fail(2, '--settle-ms requires a value in milliseconds');
  const seconds = flags['max-time'] === undefined ? 30 : Number(flags['max-time']);
  const settleMs = flags['settle-ms'] === undefined ? 2500 : Number(flags['settle-ms']);
  if (!Number.isFinite(seconds) || seconds < 1 || seconds > 120) fail(2, '--max-time must be between 1 and 120 seconds');
  if (!Number.isFinite(settleMs) || settleMs < 100 || settleMs > 10000) fail(2, '--settle-ms must be between 100 and 10000 milliseconds');
  return { maxTimeMs: seconds * 1000, settleMs };
}
