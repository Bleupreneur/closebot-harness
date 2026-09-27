import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { join } from 'node:path';
import { REPO_DIR } from './config.mjs';
import { printJson, fail } from './output.mjs';

const UPSTREAM = 'https://megastream25-api.closebot.com/swagger/v1/swagger.json';
const MCP = 'https://developers.closebot.com/mcp';
const METHODS = new Set(['get', 'post', 'put', 'delete', 'patch']);

export function opsOf(spec) {
  const out = new Map();
  for (const [p, v] of Object.entries(spec.paths || {})) for (const [m, op] of Object.entries(v)) if (METHODS.has(m)) out.set(`${m.toUpperCase()} ${p}`, op);
  return out;
}
export function diffSpecs(oldSpec, newSpec) {
  const O = opsOf(oldSpec), N = opsOf(newSpec);
  const added = [...N.keys()].filter(k => !O.has(k)).sort();
  const removed = [...O.keys()].filter(k => !N.has(k)).sort();
  const changedBodies = [...N.keys()].filter(k => O.has(k) && JSON.stringify(O.get(k).requestBody ?? null) !== JSON.stringify(N.get(k).requestBody ?? null)).sort();
  return { added, removed, changedBodies };
}
export function staleOverrides(overrides, newSpec) { const N = opsOf(newSpec); return Object.keys(overrides.operations || {}).filter(k => !N.has(k)); }
export function changelogBlock(date, d) {
  const list = (t, xs) => xs.length ? `\n**${t}**\n${xs.map(x => `- \`${x}\``).join('\n')}\n` : '';
  return `## ${date} — spec refresh\n\n+${d.added.length} added · -${d.removed.length} removed · ${d.changedBodies.length} request bodies changed\n${list('Added', d.added)}${list('Removed', d.removed)}${list('Changed bodies', d.changedBodies)}\n`;
}

// Fetched as TEXT and kept verbatim — scripts/smoke.sh byte-compares schema/openapi.json
// against a fresh download of this same URL, so writing a re-serialized JSON.stringify
// would show up as permanent "drift" even right after a refresh. The raw text is what
// gets written to disk; a parsed copy is used only for diffing/building.
async function fetchUpstream() {
  const r = await fetch(UPSTREAM);
  if (!r.ok) throw new Error(`upstream ${r.status}`);
  const rawText = await r.text();
  return { rawText, parsed: JSON.parse(rawText) };
}
async function fetchViaMcp() {
  const call = async (method, params, id, sid) => {
    const r = await fetch(MCP, { method: 'POST', headers: { 'Content-Type': 'application/json', Accept: 'application/json, text/event-stream', ...(sid ? { 'Mcp-Session-Id': sid } : {}) }, body: JSON.stringify({ jsonrpc: '2.0', id, method, params }) });
    const text = await r.text(); const sidOut = r.headers.get('Mcp-Session-Id');
    const msgs = text.split('\n').filter(l => l.startsWith('data:')).map(l => JSON.parse(l.slice(5)));
    return { msgs: msgs.length ? msgs : [JSON.parse(text)], sid: sidOut || sid };
  };
  const init = await call('initialize', { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 'cb', version: '1' } }, 1);
  const res = await call('tools/call', { name: 'query_docs_filesystem_close_bot_api', arguments: { command: 'cat /openapi/api-reference/openapi.json' } }, 2, init.sid);
  const text = res.msgs.flatMap(m => m.result?.content || []).map(c => c.text).join('');
  const parsed = JSON.parse(text);
  // Fallback path only — untested live. No verbatim-upstream-bytes guarantee here since
  // the MCP tool re-serializes; write pretty-printed JSON.
  return { rawText: JSON.stringify(parsed, null, 2), parsed };
}

// Writes rawText over specPath and runs build.py. If build.py fails, restores the
// original bytes so a half-refreshed repo is never left on disk — a re-run would
// otherwise diff new-vs-new and silently look like nothing changed. Injectable
// spawnImpl/readFileImpl/writeFileImpl/buildScriptPath make this unit-testable
// without touching the real schema file or shelling out to python3.
export function refreshSpecFile({ specPath, rawText, spawnImpl = spawnSync, readFileImpl = readFileSync, writeFileImpl = writeFileSync, buildScriptPath = join(REPO_DIR, 'scripts', 'build.py') }) {
  const oldBytes = readFileImpl(specPath, 'utf8');
  writeFileImpl(specPath, rawText);
  const b = spawnImpl('python3', [buildScriptPath], { encoding: 'utf8' });
  if (b.status !== 0) {
    writeFileImpl(specPath, oldBytes);
    return { ok: false, message: `build.py failed — spec restored to its previous version, regen did not run:\n${b.stderr}` };
  }
  return { ok: true, buildOutput: (b.stdout || '').trim() };
}

export const specCommands = {
  async refresh(ctx) {
    const src = ctx.flags.source || 'upstream';
    const { rawText, parsed: newSpec } = src === 'mcp' ? await fetchViaMcp() : await fetchUpstream();
    const specPath = join(REPO_DIR, 'schema', 'openapi.json');
    const oldSpec = JSON.parse(readFileSync(specPath, 'utf8'));
    const d = diffSpecs(oldSpec, newSpec);
    process.stderr.write(JSON.stringify(d, null, 2) + '\n');
    const allowRemovals = !!ctx.flags['allow-removals'];
    if (ctx.dryRun) return printJson({ dryRun: true, ...d, wouldRefuse: d.removed.length > 0 && !allowRemovals });
    if (d.removed.length && !allowRemovals) fail(2, `${d.removed.length} operation(s) would be removed; partial upstream fetches look like this. Re-run with --allow-removals only if you verified the removals are real.`);
    const result = refreshSpecFile({ specPath, rawText });
    if (!result.ok) fail(3, result.message);
    const nd = await ctx.call({ method: 'GET', base: 'https://api.closebot.com', path: '/bot/nodeDescriptors' });
    if (nd.ok) writeFileSync(join(REPO_DIR, 'schema', 'node-descriptors.json'), JSON.stringify(nd.data, null, 2));
    else process.stderr.write(`warn: node-descriptors refresh skipped (HTTP ${nd.status})\n`);
    for (const k of staleOverrides(ctx.overrides, newSpec)) process.stderr.write(`warn: override for ${k} targets an operation no longer in the spec\n`);
    const clPath = join(REPO_DIR, 'CHANGELOG.md'); const cl = (existsSync(clPath) ? readFileSync(clPath, 'utf8') : '# Changelog\n').split('\n');
    cl.splice(1, 0, '', changelogBlock(new Date().toISOString().slice(0, 10), d));
    writeFileSync(clPath, cl.join('\n'));
    printJson({ ...d, buildOutput: result.buildOutput });
  },
};
