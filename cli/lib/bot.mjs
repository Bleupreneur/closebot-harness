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
export function extractReplies(sse) {
  const messages = [], tools = [];
  for (const line of String(sse).split('\n')) {
    if (!line.startsWith('data:')) continue;
    let j; try { j = JSON.parse(line.slice(5).trim()); } catch { continue; }
    if (j.type === 'message-sent' && j.message) messages.push(j.message);
    if (j.type === 'tool_use' && j.toolName) tools.push(j.toolName);
  }
  return { messages, tools };
}
// spawnImpl is injectable (defaults to the real spawnSync) so botCommands.audit/publish
// can be unit-tested without shelling out to the real cb-view-agent.sh / network.
export function audit(id, json, spawnImpl = spawnSync) {
  return spawnImpl('bash', [join(REPO_DIR, 'scripts', 'cb-view-agent.sh'), id, ...(json ? ['--json'] : [])], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
}

// request()'s AbortController is disarmed (clearTimeout) as soon as fetch() resolves with
// response headers — it does not bound the subsequent body read. The testSession messages
// endpoint is a long-poll: it returns 200 immediately and then holds the SSE stream open,
// so routing it through ctx.call()/request() hangs past maxTimeMs waiting for resp.text().
// Poll here with our own bounded stream read instead (fetchImpl injectable for tests).
export async function pollTestMessages(ctx, botId, leadId, maxTimeMs, fetchImpl = fetch) {
  const url = buildUrl(REST, '/bot/{botId}/testSession/messages/{leadId}', { botId, leadId });
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), maxTimeMs);
  let text = '';
  try {
    const resp = await fetchImpl(url, { method: 'GET', headers: { 'X-CB-KEY': ctx.key }, signal: ctrl.signal });
    const reader = resp.body?.getReader?.();
    if (!reader) { text = await resp.text(); }
    else {
      const decoder = new TextDecoder();
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        text += decoder.decode(value, { stream: true });
      }
    }
  } catch (e) { if (e.name !== 'AbortError') throw e; /* long-poll timeout is expected */ }
  finally { clearTimeout(timer); }
  return text;
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
  async test(ctx, pollImpl = pollTestMessages) {
    const [id, msg] = ctx.pos; if (!id || !msg) fail(2, 'usage: cb bot test <bot_id> "<message>" [--max-time 30] [--lead <leadId>]');
    // Under --dry-run, ctx.call would return the request descriptor as `data` for the
    // testSession POST, so `s.data?.leadId` is undefined and the command falls into a
    // misleading "could not create test session" failure. There's no meaningful dry run
    // of a real ephemeral test session — refuse outright instead of half-running.
    if (ctx.dryRun) fail(2, 'cb bot test cannot be dry-run: it creates and deletes a real ephemeral test session');
    const maxTimeMs = (parseInt(ctx.flags['max-time'], 10) || 30) * 1000;
    // --lead <leadId>: reuse a test session the caller created with
    // `cb bottesting post-testsession` and still owns. Multi-turn probes need the bot's
    // conversation memory to carry across turns, which a fresh session per call can't
    // give. With --lead there is no create and no delete — the caller cleans up with
    // `cb bottesting delete-testsession` when the probe is done.
    const ownLead = typeof ctx.flags?.lead === 'string' && ctx.flags.lead ? ctx.flags.lead : null;
    let leadId = ownLead;
    const s = ownLead ? null : await ctx.call({ method: 'POST', base: REST, path: '/bot/{botId}/testSession', params: { botId: id }, body: {} });
    if (!ownLead) leadId = s.data?.leadId;
    if (!leadId) {
      const st = await ctx.call({ method: 'GET', base: REST, path: '/bot/{botId}/testSession', params: { botId: id } });
      fail(3, `could not create test session (HTTP ${s.status}). Session status: ${JSON.stringify(st.data).slice(0, 400)}\nIf mostRecentFailureReason is "no_persona": assign a persona in the UI (no API path).`);
    }
    // Everything from here on must clean up the ephemeral test lead even on failure — hence
    // the try/finally. Note: fail() calls process.exit(), which does NOT run pending finally
    // blocks (a real process exit, not a throw), so a mid-flight failure is captured into
    // `failure` and only turned into fail(3, …) after the finally's DELETE has already run.
    let failure = null, out = { messages: [], tools: [] };
    try {
      const m = await ctx.call({ method: 'POST', base: REST, path: '/bot/{botId}/testSession/message', params: { botId: id }, body: { leadId, message: msg } });
      if (!m.ok) failure = `POST /bot/${id}/testSession/message → ${m.status}: ${JSON.stringify(m.data).slice(0, 300)}`;
      else {
        const sse = await pollImpl(ctx, id, leadId, maxTimeMs);
        out = extractReplies(sse);
      }
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
    printJson({ leadId, session: ownLead ? 'reused' : 'ephemeral', sent: msg, replies: out.messages.length ? out.messages : ['(no reply within timeout)'], tools: out.tools });
  },
});
