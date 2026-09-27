import { createHash } from 'node:crypto';
import { readdirSync, readFileSync, writeFileSync, existsSync, statSync } from 'node:fs';
import { join, basename } from 'node:path';
import { getBot, getSteps } from './bot.mjs';
import { resolveTarget } from './versions.mjs';
import { printJson, fail } from './output.mjs';

const REST = 'https://api.closebot.com';
const EXT = /\.(txt|csv|docx|pdf)$/i;
// FileDto.fileStatus has NO enum in schema/openapi.json (nullable string, any value the
// API feels like sending). Observed live 2026-09-04 on real, attached, working files:
// "indexed" — not "ready". Both count as ready; anything else (e.g. "processing",
// "failed", null/empty) is not-ready. If a new observed-ready value shows up, add it here.
const READY_STATUSES = new Set(['ready', 'indexed']);
export const sha256 = buf => createHash('sha256').update(buf).digest('hex');

export function diffManifest(manifest, local) {
  const known = manifest.files || {};
  const names = new Set(local.map(f => f.name));
  return {
    added: local.filter(f => !known[f.name]).map(f => f.name),
    changed: local.filter(f => known[f.name] && known[f.name].sha256 !== f.sha256).map(f => f.name),
    removed: Object.keys(known).filter(n => !names.has(n)),
  };
}
export function readabilityGaps(steps, attachedFileCount) {
  if (!attachedFileCount) return [];
  return (steps.nodes || []).filter(n => n.type === 'Method' && n.data?.EnableLibraryContext !== true).map(n => n.data?.Title ?? n.id);
}
const manifestPath = dir => join(dir, '.cb-kb-manifest.json');
const loadManifest = dir => existsSync(manifestPath(dir)) ? JSON.parse(readFileSync(manifestPath(dir), 'utf8')) : { files: {}, faqs: [], scrapes: [] };
const saveManifest = (dir, m) => writeFileSync(manifestPath(dir), JSON.stringify(m, null, 2));
const localFiles = dir => readdirSync(dir).filter(n => EXT.test(n) && statSync(join(dir, n)).isFile()).map(n => ({ name: n, path: join(dir, n), sha256: sha256(readFileSync(join(dir, n))) }));

async function upload(ctx, path) {
  const fd = new FormData(); fd.append('file', new Blob([readFileSync(path)]), basename(path));
  const r = await ctx.call({ method: 'POST', base: REST, path: '/library/files', body: fd, multipart: true });
  if (!r.ok) fail(3, `upload ${basename(path)} → ${r.status}`);
  return r.data?.fileId ?? r.data?.id;
}
async function replaceContent(ctx, fileId, path) {
  const fd = new FormData(); fd.append('newFile', new Blob([readFileSync(path)]), basename(path));
  const r = await ctx.call({ method: 'PUT', base: REST, path: '/library/files/{fileId}', params: { fileId }, body: fd, multipart: true });
  if (!r.ok) fail(3, `replace ${basename(path)} → ${r.status} — check PUT /library/files/{fileId} body in schema/openapi.json`);
  return r;
}
// Does NOT fail() on error — callers that create a new file (build's upload, update's
// added files) must be able to persist the manifest with attached:false before deciding
// whether to fail, so the orphaned upload is recorded rather than lost. Callers that
// don't create anything new (update's soft-detach) still check r.ok themselves.
async function attach(ctx, fileId, sourceId, enabled = true) {
  return ctx.call({ method: 'POST', base: REST, path: '/library/files/{fileId}/source/{sourceId}', params: { fileId, sourceId }, body: { tags: [], channels: [], enabled } });
}
async function listAttached(ctx, sourceId) {
  const r = await ctx.call({ method: 'GET', base: REST, path: '/library/files', query: { sourceId } });
  if (!r.ok) fail(3, `GET /library/files → ${r.status}`);
  return r.data;
}

// Minimal CSV field splitter supporting double-quoted fields (RFC4180-ish): a quoted
// comma is ordinary content, not a field separator, and "" inside a quoted field is a
// literal quote. Naively splitting on every comma truncated any FAQ answer containing
// one into the client's knowledge base.
export function parseCsvLine(line) {
  const out = []; let cur = ''; let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (inQuotes) {
      if (c === '"') { if (line[i + 1] === '"') { cur += '"'; i++; } else inQuotes = false; }
      else cur += c;
    } else if (c === '"') inQuotes = true;
    else if (c === ',') { out.push(cur); cur = ''; }
    else cur += c;
  }
  out.push(cur);
  return out;
}

export const kbCommands = {
  async build(ctx) {
    const { source, from } = ctx.flags; if (!source || !from) fail(2, 'usage: cb kb build --source <src_id> --from <dir> [--faq-csv f] [--url u]');
    const m = loadManifest(from); m.sourceId = source;
    for (const f of localFiles(from)) {
      if (m.files[f.name]?.sha256 === f.sha256) continue;
      const fileId = await upload(ctx, f.path);
      // Record the upload BEFORE attaching: if attach fails, the file already exists in
      // the library and must not be silently forgotten (the next `cb kb build` would
      // otherwise re-upload it as a duplicate, having no memory of fileId).
      m.files[f.name] = { fileId, sha256: f.sha256, uploadedAt: new Date().toISOString(), attached: false }; saveManifest(from, m);
      const r = await attach(ctx, fileId, source);
      if (!r.ok) fail(3, `${f.name} uploaded as ${fileId} but attach → ${source} failed (HTTP ${r.status}). The file exists in the library, unattached — recorded in the manifest as attached:false; do NOT delete it, re-run cb kb build to retry the attach.`);
      m.files[f.name].attached = true; saveManifest(from, m);
    }
    for (const url of [].concat(ctx.flags.url || [])) {
      // A bare `--url` with no value parses to boolean true (parseArgs' valueless-flag
      // convention) — refuse it instead of silently sending `scrapeUrl: true`.
      if (url === true) fail(2, '--url needs a value');
      const r = await ctx.call({ method: 'POST', base: REST, path: '/library/webscrape', body: { scrapeUrl: url, maxBreadth: 1, maxDepth: 1 } });
      const fileId = r.data?.fileId ?? r.data?.id; if (!fileId) fail(3, `webscrape ${url} → ${r.status}`);
      m.scrapes.push({ fileId, url, attached: false }); saveManifest(from, m);
      const ar = await attach(ctx, fileId, source);
      if (!ar.ok) fail(3, `scrape ${url} landed as ${fileId} but attach → ${source} failed (HTTP ${ar.status}). Recorded in the manifest as attached:false; do NOT delete it, re-run to retry the attach.`);
      m.scrapes.at(-1).attached = true; saveManifest(from, m);
    }
    if (ctx.flags['faq-csv']) {
      const rows = readFileSync(ctx.flags['faq-csv'], 'utf8').split('\n').slice(1).filter(Boolean).map(l => { const [q, ...a] = parseCsvLine(l); return { question: (q ?? '').trim(), answer: a.join(',').trim() }; });
      for (const { question, answer } of rows) {
        const r = await ctx.call({ method: 'POST', base: REST, path: '/smart-faq', body: { sourceId: source, question, answer } });
        m.faqs.push({ id: r.data?.id ?? null, question }); saveManifest(from, m);
      }
    }
    await kbCommands.verify({ ...ctx, flags: { ...ctx.flags, source } });
  },
  async update(ctx) {
    const { from } = ctx.flags; if (!from) fail(2, 'usage: cb kb update --from <dir>');
    const m = loadManifest(from); if (!m.sourceId) fail(2, 'no manifest in that dir; run cb kb build first');
    const d = diffManifest(m, localFiles(from));
    for (const n of d.changed) {
      const p = join(from, n); const fileId = m.files[n].fileId;
      await replaceContent(ctx, fileId, p);
      m.files[n].sha256 = sha256(readFileSync(p)); m.files[n].uploadedAt = new Date().toISOString(); saveManifest(from, m);
    }
    for (const n of d.added) {
      const p = join(from, n); const fileId = await upload(ctx, p);
      m.files[n] = { fileId, sha256: sha256(readFileSync(p)), uploadedAt: new Date().toISOString(), attached: false }; saveManifest(from, m);
      const r = await attach(ctx, fileId, m.sourceId);
      if (!r.ok) fail(3, `${n} uploaded as ${fileId} but attach → ${m.sourceId} failed (HTTP ${r.status}). Recorded in the manifest as attached:false; do NOT delete it, re-run cb kb update to retry the attach.`);
      m.files[n].attached = true; saveManifest(from, m);
    }
    for (const n of d.removed) {
      const r = await attach(ctx, m.files[n].fileId, m.sourceId, false);
      if (!r.ok) fail(3, `detach ${m.files[n].fileId} (${n}) from ${m.sourceId} failed (HTTP ${r.status}); manifest entry left in place, retry cb kb update`);
      delete m.files[n]; saveManifest(from, m);
    }
    printJson(d);
    return d;
  },
  async verify(ctx) {
    const { source, bot, from } = ctx.flags; if (!source) fail(2, 'usage: cb kb verify --source <src_id> [--bot <bot_id>] [--from <dir>]');
    const files = await listAttached(ctx, source);
    const notReady = files.filter(f => f.fileStatus && !READY_STATUSES.has(f.fileStatus)).map(f => ({ fileId: f.fileId, fileName: f.fileName, fileStatus: f.fileStatus }));
    const out = { sourceId: source, attached: files.length, notReady };
    if (from) {
      const m = loadManifest(from);
      out.orphaned = Object.entries(m.files || {}).filter(([, v]) => v.attached === false).map(([name, v]) => ({ name, fileId: v.fileId }))
        .concat((m.scrapes || []).filter(s => s.attached === false).map(s => ({ url: s.url, fileId: s.fileId })));
    }
    if (bot) {
      const b = await getBot(ctx, bot);
      const t = resolveTarget(b);
      out.bot = bot; out.version = t.target;
      out.methodsThatCannotReadLibrary = readabilityGaps(await getSteps(ctx, bot, t.target), files.length);
      // Live gotcha 2026-09-05: `cb bot post-source` with the schema-minimum body writes
      // every declared flow variable as "", which overrides the variable's defaultValue
      // (e.g. hours reverted to blank after attach). Surface it here so a `kb verify`
      // right after an attach catches it, not just a full `cb bot audit`.
      const src = (b.sources || []).find((s) => s.id === source);
      const empty = Object.entries(src?.flowVariableValues || {}).filter(([, v]) => v === '').map(([k]) => k);
      if (empty.length) out.emptyFlowVariables = empty;
    }
    printJson(out);
    return out;
  },
};
