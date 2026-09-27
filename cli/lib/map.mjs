// cb map — read-only inventory of a whole CloseBot account. Tier 0: GET only.
//
// Operations used (every one is a GET in cli/closebot-cli.spec.json / schema/openapi.json):
//   GET /agency/current              agency name, features (members counted, never listed)
//   GET /agency                      agencies this key can see
//   GET /agency/source               sources, paged (page from 0, pageSize max 100)
//   GET /agency/source/{id}/channels channel names per source
//   GET /bot                         bots with versions, sources, personaIds
//   GET /bot/{id}                    one bot (--bot scope, or the template bot when not listed)
//   GET /bot/{id}/steps?botVersion=  job flow of the edit target version (skipped with --no-steps)
//   GET /persona                     personas + botIds
//   GET /library/files               library files, grouped by attached source
//   GET /smart-faq                   Smart FAQs, counted per source (question text never kept)
//   GET /dashboard, GET /report      names + ids only
//   --metrics only:
//   GET /botMetric/agencySummary     month-over-month agency counters
//   GET /botMetric/messageCount      per source, last 30 days
//   GET /botMetric/actionCount       per bot, last 30 days
//
// No lead data is fetched. Agency members, modifiedBy, access tokens, source keys and
// FAQ text are dropped at the projection step, then everything is passed through
// redact() with overrides.redactFields as a second line of defence.
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { resolveTarget } from './versions.mjs';
import { redact } from './http.mjs';
import { REPO_DIR, loadTemplateBot, isPluginMode } from './config.mjs';
import { printJson, fail } from './output.mjs';

const REST = 'https://api.closebot.com';
export const MAP_OPS = [
  'GET /agency/current', 'GET /agency', 'GET /agency/source', 'GET /agency/source/{id}/channels',
  'GET /bot', 'GET /bot/{id}', 'GET /bot/{id}/steps', 'GET /persona', 'GET /library/files',
  'GET /smart-faq', 'GET /dashboard', 'GET /report',
  'GET /botMetric/agencySummary', 'GET /botMetric/messageCount', 'GET /botMetric/actionCount',
];
// Same readiness rule as `cb kb verify`: live files report "indexed", docs say "ready".
const READY = new Set(['indexed', 'ready']);

export async function pool(items, limit, fn) {
  const out = new Array(items.length); let next = 0;
  const worker = async () => { while (next < items.length) { const i = next++; out[i] = await fn(items[i], i); } };
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return out;
}

// Framework parity, ported from scripts/cb-view-agent.sh §12 (h): the recommended
// agent-node set matched by title intent, not exact name.
export function frameworkParity(steps) {
  const nodes = steps?.nodes || [];
  const methods = nodes.filter(n => n.type === 'Method').map(n => n.data?.Title ?? '');
  const objectives = nodes.filter(n => n.type === 'MultiObjective').flatMap(n => (n.data?.Objectives || []).map(o => o?.Title ?? o?.Name ?? ''));
  const p = {
    has_general_info: methods.some(t => /general info/i.test(t)),
    has_booking_agent: methods.some(t => /booking agent/i.test(t)),
    has_deposit_or_readiness: methods.some(t => /deposit|readiness/i.test(t)),
    has_handle_pricing: objectives.some(t => /pricing/i.test(t)),
  };
  return { ...p, on_framework: Object.values(p).every(Boolean) };
}
const PARITY_LABELS = { has_general_info: 'General Info Collection', has_booking_agent: 'Booking Agent', has_deposit_or_readiness: 'Deposit/Booking-Readiness Agent', has_handle_pricing: 'Handle Pricing MultiObjective' };

export function summarizeSteps(steps) {
  const nodes = steps?.nodes || [], edges = steps?.edges || [];
  const histogram = {};
  for (const n of nodes) histogram[n.type ?? 'unknown'] = (histogram[n.type ?? 'unknown'] || 0) + 1;
  const inbound = new Set(edges.map(e => e.target));
  const orphans = nodes.filter(n => n.type !== 'Source' && !String(n.type).startsWith('Scenario') && !inbound.has(n.id))
    .map(n => n.data?.Title ?? n.data?.name ?? n.id);
  const libraryOff = nodes.filter(n => n.type === 'Method' && n.data?.EnableLibraryContext === false).map(n => n.data?.Title ?? n.id);
  return { nodeCount: nodes.length, edgeCount: edges.length, histogram: Object.fromEntries(Object.entries(histogram).sort()), orphans, libraryOffMethods: libraryOff, framework: frameworkParity(steps) };
}

export function slugify(s) { return String(s || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60) || 'agency'; }

// --- the build -------------------------------------------------------------------------

export async function buildMap(ctx, opts = {}) {
  const { botId = null, steps: withSteps = true, metrics = false, templateBot = null, concurrency = 4, now = new Date() } = opts;
  const read = ctx.read || ctx.call;
  const errors = [];
  // GET /agency/source is projected to 4 fields by overrides.json for plain CLI use; the map
  // needs bots/connected/topicsEnabled, so drop only that projection (redaction still runs)
  // and project to safe fields here instead.
  const ov = ctx.overrides || {};
  const sourceOverrides = { ...ov, operations: Object.fromEntries(Object.entries(ov.operations || {}).filter(([k]) => k !== 'GET /agency/source' && k !== 'GET /agency/source/{id}')) };
  const get = async (path, { params, query, overrides } = {}) => {
    const op = `GET ${path}`;
    try {
      const r = await read({ method: 'GET', base: REST, path, params, query, ...(overrides ? { overrides } : {}) });
      if (!r.ok) { errors.push({ op, params: params ?? null, status: r.status, message: r.note ?? `HTTP ${r.status}` }); return null; }
      return r.data;
    } catch (e) { errors.push({ op, params: params ?? null, status: 0, message: e.message }); return null; }
  };

  // Agency-level reads are independent — run them together.
  const [current, agencies, botsRaw, personasRaw, filesRaw, faqsRaw, dashboardsRaw, reportsRaw] = await Promise.all([
    get('/agency/current'), get('/agency'),
    botId ? get('/bot/{id}', { params: { id: botId } }).then(b => b ? [b] : []) : get('/bot'),
    get('/persona'), get('/library/files'), get('/smart-faq'), get('/dashboard'), get('/report'),
  ]);

  const sourcesRaw = [];
  for (let page = 0; page < 100; page++) {
    const d = await get('/agency/source', { query: { page, pageSize: 100 }, overrides: sourceOverrides });
    const rows = Array.isArray(d) ? d : d?.results;
    if (!Array.isArray(rows) || !rows.length) break;
    sourcesRaw.push(...rows);
    if (Array.isArray(d) || (typeof d.total === 'number' && sourcesRaw.length >= d.total) || rows.length < 100) break;
  }

  const agency = current ? {
    id: current.id ?? null, name: current.name ?? null, betaTester: current.betaTester ?? null,
    features: current.features || [], memberCount: (current.members || []).length,
  } : null;

  const files = Array.isArray(filesRaw) ? filesRaw : [];
  const faqs = Array.isArray(faqsRaw) ? faqsRaw : [];
  const personas = (Array.isArray(personasRaw) ? personasRaw : []).map(p => ({
    id: p.id, name: p.personaName ?? null, default: !!p.default,
    botIds: [...new Set([...(p.botIds || []), ...(p.bots || []).map(b => b.id)])],
  }));
  const personaName = new Map(personas.map(p => [p.id, p.name]));

  const kbFor = sourceId => {
    const f = files.filter(x => (x.sources || []).some(s => s?.id === sourceId));
    const q = faqs.filter(x => x.sourceId === sourceId);
    return {
      libraryFiles: f.length,
      libraryNotReady: f.filter(x => !READY.has(String(x.fileStatus ?? '').toLowerCase())).length,
      fileTypes: Object.fromEntries(Object.entries(f.reduce((a, x) => ((a[x.fileType ?? 'unknown'] = (a[x.fileType ?? 'unknown'] || 0) + 1), a), {})).sort()),
      smartFaqs: q.length,
      smartFaqsUnanswered: q.filter(x => !x.answer).length,
    };
  };

  let sources = sourcesRaw.map(s => ({
    id: s.sourceId, name: s.name ?? null, category: s.category ?? null, timezone: s.timezone ?? null,
    connected: s.connected ?? null, topicsEnabled: s.topicsEnabled ?? null,
    bots: (s.bots || []).map(b => ({ id: b.id, name: b.botName ?? null, enabled: b.enabled ?? null, channels: b.channels || [] })),
    channels: null, knowledge: kbFor(s.sourceId),
  }));
  await pool(sources, concurrency, async s => {
    const ch = await get('/agency/source/{id}/channels', { params: { id: s.id } });
    s.channels = Array.isArray(ch) ? ch.map(c => c?.name ?? c?.id).filter(Boolean) : null;
  });

  let bots = (Array.isArray(botsRaw) ? botsRaw : []).map(b => {
    let v = null;
    try { v = resolveTarget(b); } catch { /* no versions: leave null, flagged below */ }
    const sourceIds = (b.sources || []).map(s => s.id);
    const personaIds = [...new Set([...(b.personaIds || []), ...personas.filter(p => p.botIds.includes(b.id)).map(p => p.id)])];
    return {
      id: b.id, name: b.name ?? null, category: b.category ?? null, modifiedAt: b.modifiedAt ?? null,
      versions: (b.versions || []).map(x => ({ version: x.version, published: !!x.published, modifiedAt: x.modifiedAt ?? null })),
      target: v?.target ?? null, targetPublished: v?.targetPublished ?? null, live: v?.live ?? null,
      sources: (b.sources || []).map(s => ({ id: s.id, name: s.name ?? null, category: s.category ?? null, enabled: s.enabled ?? null, channels: s.channelList || [] })),
      personas: personaIds.map(id => ({ id, name: personaName.get(id) ?? null })),
      knowledge: sourceIds.reduce((a, id) => { const k = kbFor(id); a.libraryFiles += k.libraryFiles; a.smartFaqs += k.smartFaqs; return a; }, { libraryFiles: 0, smartFaqs: 0 }),
      tools: (b.tools || []).filter(t => t?.enabled !== false).map(t => t?.type).filter(Boolean),
      followUpActive: b.followUpActive ?? null,
      steps: null, metrics: null,
    };
  });

  // Template bot: include its node histogram as the reference even when it's out of scope.
  let template = null;
  if (templateBot) {
    let tb = bots.find(b => b.id === templateBot);
    if (!tb && withSteps) {
      const raw = await get('/bot/{id}', { params: { id: templateBot } });
      if (raw) { try { const t = resolveTarget(raw); tb = { id: raw.id, name: raw.name ?? null, target: t.target, outOfScope: true }; } catch { /* no versions */ } }
    }
    template = { id: templateBot, name: tb?.name ?? null, found: !!tb, histogram: null, framework: null };
    if (tb && tb.outOfScope) {
      const st = await get('/bot/{id}/steps', { params: { id: tb.id }, query: { botVersion: tb.target } });
      if (st) { const s = summarizeSteps(st); template.histogram = s.histogram; template.framework = s.framework; }
    }
  }

  if (withSteps) {
    await pool(bots.filter(b => b.target), concurrency, async b => {
      const st = await get('/bot/{id}/steps', { params: { id: b.id }, query: { botVersion: b.target } });
      if (st) b.steps = { version: b.target, ...summarizeSteps(st) };
    });
    if (template && !template.histogram) {
      const tb = bots.find(b => b.id === templateBot);
      if (tb?.steps) { template.histogram = tb.steps.histogram; template.framework = tb.steps.framework; }
    }
  }

  let metricsOut = null;
  if (metrics) {
    const end = now.toISOString(), start = new Date(now.getTime() - 30 * 864e5).toISOString();
    const summary = await get('/botMetric/agencySummary');
    await pool(sources, concurrency, async s => {
      const n = await get('/botMetric/messageCount', { query: { sourceId: s.id, start, end } });
      s.messages30d = typeof n === 'number' ? n : null;
    });
    await pool(bots, concurrency, async b => {
      const n = await get('/botMetric/actionCount', { query: { botId: b.id, start, end } });
      b.metrics = { actions30d: typeof n === 'number' ? n : null };
    });
    metricsOut = { window: { start, end }, agencySummary: summary && typeof summary === 'object' ? summary : null };
  }

  if (botId) {
    // Scoped run: keep only the sources this bot is attached to.
    const keep = new Set(bots.flatMap(b => b.sources.map(s => s.id)));
    sources = sources.filter(s => keep.has(s.id) || s.bots.some(x => x.id === botId));
  }

  const map = {
    generatedAt: now.toISOString(),
    scope: botId ? { bot: botId } : 'account',
    options: { steps: withSteps, metrics },
    agency,
    agencies: (Array.isArray(agencies) ? agencies : []).map(a => ({ id: a.id, name: a.name ?? null })),
    counts: {
      sources: sources.length, bots: bots.length, personas: personas.length,
      libraryFiles: files.length, smartFaqs: faqs.length,
      dashboards: Array.isArray(dashboardsRaw) ? dashboardsRaw.length : null,
      reports: Array.isArray(reportsRaw) ? reportsRaw.length : null,
    },
    sources, bots,
    personas: personas.map(p => {
      const botIds = [...new Set([...p.botIds, ...bots.filter(b => b.personas.some(x => x.id === p.id)).map(b => b.id)])];
      return { ...p, botIds, botCount: botIds.length };
    }),
    dashboards: (Array.isArray(dashboardsRaw) ? dashboardsRaw : []).map(d => ({ id: d.id, name: d.name ?? null })),
    reports: (Array.isArray(reportsRaw) ? reportsRaw : []).map(r => ({ id: r.id, name: r.name ?? null })),
    template,
    metrics: metricsOut,
    issues: [],
    errors,
    opsUsed: MAP_OPS.filter(k => metrics || !k.startsWith('GET /botMetric')),
  };
  map.issues = findIssues(map);
  return redact(map, ov.redactFields || []);
}

export function findIssues(map) {
  const out = [];
  const add = (severity, code, subject, message) => out.push({ severity, code, subject, message });
  const botIdsOnSources = new Set(map.sources.flatMap(s => s.bots.map(b => b.id)));
  for (const b of map.bots) {
    const who = `${b.name ?? b.id} (${b.id})`;
    if (!b.versions.length) add('WARN', 'NO_VERSIONS', who, 'bot has no versions');
    if (b.target && !b.live) add('WARN', 'NEVER_PUBLISHED', who, `no published version; draft ${b.target} has never gone live`);
    if (b.target && b.live && !b.targetPublished) add('INFO', 'DRAFT_NEWER_THAN_LIVE', who, `unpublished draft ${b.target} is newer than live ${b.live} (publish via closebot-publish-safely, or discard)`);
    if (!b.personas.length) add('FAIL', 'NO_PERSONA', who, 'no persona assigned: test sessions fail with no_persona (assign one in the UI)');
    if (!b.sources.length && !botIdsOnSources.has(b.id)) add('INFO', 'NO_SOURCE', who, 'not attached to any source, so it never talks to a lead');
    if (b.sources.length && b.knowledge.libraryFiles === 0 && b.knowledge.smartFaqs === 0) add('WARN', 'NO_KB', who, 'none of its sources has library files or Smart FAQs (closebot-attach-knowledge)');
    if (b.steps) {
      if (!b.steps.framework.on_framework) {
        const missing = Object.entries(PARITY_LABELS).filter(([k]) => !b.steps.framework[k]).map(([, v]) => v);
        add('WARN', 'FRAMEWORK_GAP', who, `missing recommended agent node(s): ${missing.join(', ')} (closebot-apply-template)`);
      }
      if (b.steps.orphans.length) add('FAIL', 'ORPHAN_NODE', who, `unreachable node(s): ${b.steps.orphans.join(', ')}`);
      if (b.steps.libraryOffMethods.length && b.knowledge.libraryFiles > 0) add('WARN', 'LIBRARY_OFF', who, `library files attached but EnableLibraryContext=false on: ${b.steps.libraryOffMethods.join(', ')}`);
      if (map.template?.histogram && map.template.id !== b.id) {
        const gaps = Object.keys(map.template.histogram).filter(t => !b.steps.histogram[t]);
        if (gaps.length) add('INFO', 'NODE_TYPE_GAP', who, `node types in template ${map.template.id} but not here: ${gaps.join(', ')}`);
      }
    }
  }
  for (const s of map.sources) {
    const who = `${s.name ?? s.id} (${s.id})`;
    const attached = s.bots.length || map.bots.some(b => b.sources.some(x => x.id === s.id));
    if (!attached) add('INFO', 'SOURCE_NO_BOT', who, 'no bot attached to this source');
    if (s.connected === false) add('WARN', 'SOURCE_DISCONNECTED', who, 'source reports connected=false (reconnect in the CloseBot UI)');
    if (s.knowledge.libraryNotReady) add('WARN', 'KB_NOT_READY', who, `${s.knowledge.libraryNotReady} library file(s) not indexed yet`);
  }
  if (map.template && !map.template.found) add('WARN', 'TEMPLATE_NOT_FOUND', map.template.id, 'configured template bot was not found with this key');
  const rank = { FAIL: 0, WARN: 1, INFO: 2 };
  return out.sort((a, b) => rank[a.severity] - rank[b.severity]);
}

// --- renderers -------------------------------------------------------------------------

const cell = v => String(v ?? '-').replace(/\|/g, '\\|').replace(/\n/g, ' ');
function table(headers, rows) {
  if (!rows.length) return '_none_\n';
  return `| ${headers.join(' | ')} |\n|${headers.map(() => '---').join('|')}|\n${rows.map(r => `| ${r.map(cell).join(' | ')} |`).join('\n')}\n`;
}
const hist = h => Object.entries(h || {}).map(([k, v]) => `${k}×${v}`).join(', ');

export function renderMarkdown(map) {
  const a = map.agency;
  const L = [];
  L.push(`# CloseBot system map: ${a?.name ?? 'unknown agency'}`, '');
  L.push(`Generated ${map.generatedAt} by \`cb map\` (read-only). Scope: ${map.scope === 'account' ? 'whole account' : `bot ${map.scope.bot}`}.${map.options.steps ? '' : ' Job-flow steps skipped (--no-steps).'}`, '');
  L.push('## Summary', '');
  L.push(table(['Agency', 'Sources', 'Bots', 'Personas', 'Library files', 'Smart FAQs', 'Dashboards', 'Reports', 'Issues', 'Errors'],
    [[a?.name, map.counts.sources, map.counts.bots, map.counts.personas, map.counts.libraryFiles, map.counts.smartFaqs, map.counts.dashboards, map.counts.reports,
      `${map.issues.filter(i => i.severity === 'FAIL').length} fail / ${map.issues.filter(i => i.severity === 'WARN').length} warn`, map.errors.length]]));
  if (map.agencies.length > 1) L.push(`Agencies visible to this key: ${map.agencies.map(x => x.name ?? x.id).join(', ')}`, '');

  L.push('## Sources', '');
  L.push(table(['Source', 'Category', 'Connected', 'Topics', 'Channels', 'Bots', 'Library', 'FAQs', ...(map.metrics ? ['Msgs 30d'] : [])],
    map.sources.map(s => [`${s.name} \`${s.id}\``, s.category, s.connected, s.topicsEnabled, (s.channels || []).join(', ') || '-',
      s.bots.map(b => b.name ?? b.id).join(', ') || '-', s.knowledge.libraryFiles, s.knowledge.smartFaqs, ...(map.metrics ? [s.messages30d] : [])])));

  L.push('## Bots', '');
  L.push(table(['Bot', 'Live', 'Edit target', 'Sources', 'Persona', 'Nodes', 'KB files/FAQs', 'Framework', ...(map.metrics ? ['Actions 30d'] : [])],
    map.bots.map(b => [`${b.name} \`${b.id}\``, b.live ?? 'never', b.target ? `${b.target}${b.targetPublished ? '' : ' (draft)'}` : '-',
      b.sources.length, b.personas.map(p => p.name ?? p.id).join(', ') || 'NONE', b.steps?.nodeCount ?? '-',
      `${b.knowledge.libraryFiles}/${b.knowledge.smartFaqs}`, b.steps ? (b.steps.framework.on_framework ? 'ok' : 'gap') : '-',
      ...(map.metrics ? [b.metrics?.actions30d] : [])])));

  L.push('## Personas', '');
  L.push(table(['Persona', 'Default', 'Bots'], map.personas.map(p => [p.name ?? p.id, p.default ? 'yes' : '', p.botCount])));

  if (map.dashboards.length || map.reports.length) {
    L.push('## Dashboards and reports', '');
    L.push(table(['Kind', 'Name', 'Id'], [...map.dashboards.map(d => ['dashboard', d.name, d.id]), ...map.reports.map(r => ['report', r.name, r.id])]));
  }
  if (map.metrics?.agencySummary) {
    L.push('## Metrics', '', `Window: ${map.metrics.window.start} to ${map.metrics.window.end}`, '');
    L.push(table(['Metric', 'Value'], Object.entries(map.metrics.agencySummary).map(([k, v]) => [k, v])));
  }
  if (map.template) {
    L.push('## Template', '', `Template bot \`${map.template.id}\`${map.template.name ? ` (${map.template.name})` : ''}${map.template.found ? '' : ' was NOT found'}. ${map.template.histogram ? `Node types: ${hist(map.template.histogram)}.` : ''}`, '');
  }

  L.push('## Flagged issues', '');
  L.push(table(['Severity', 'Code', 'Subject', 'Detail'], map.issues.map(i => [i.severity, i.code, i.subject, i.message])));

  L.push('## Per-bot detail', '');
  for (const b of map.bots) {
    L.push(`### ${b.name ?? b.id}`, '');
    L.push(`- Id: \`${b.id}\``);
    L.push(`- Versions: ${b.versions.map(v => `${v.version}${v.published ? '*' : ''}`).join(', ') || 'none'} (\\* = published). Live: ${b.live ?? 'never'}. Edit target: ${b.target ?? '-'}`);
    L.push(`- Sources: ${b.sources.map(s => `${s.name ?? s.id}${s.channels.length ? ` [${s.channels.join(', ')}]` : ''}${s.enabled === false ? ' (disabled)' : ''}`).join('; ') || 'none'}`);
    L.push(`- Personas: ${b.personas.map(p => p.name ?? p.id).join(', ') || 'NONE'}`);
    L.push(`- Knowledge via sources: ${b.knowledge.libraryFiles} library file(s), ${b.knowledge.smartFaqs} Smart FAQ(s)`);
    if (b.tools.length) L.push(`- Tools enabled: ${b.tools.join(', ')}`);
    if (b.steps) {
      L.push(`- Job flow (${b.steps.version}): ${b.steps.nodeCount} nodes, ${b.steps.edgeCount} edges. ${hist(b.steps.histogram)}`);
      L.push(`- Recommended agent-node set: ${b.steps.framework.on_framework ? 'present' : `missing ${Object.entries(PARITY_LABELS).filter(([k]) => !b.steps.framework[k]).map(([, v]) => v).join(', ')}`}`);
    }
    const mine = map.issues.filter(i => i.subject.includes(b.id));
    if (mine.length) L.push(`- Issues: ${mine.map(i => `${i.severity} ${i.code}`).join(', ')}`);
    L.push('');
  }
  if (map.errors.length) {
    L.push('## Errors (map continued past these)', '');
    L.push(table(['Operation', 'Params', 'Status', 'Message'], map.errors.map(e => [e.op, e.params ? JSON.stringify(e.params) : '-', e.status, e.message])));
  }
  L.push('## Next steps', '',
    '- FAIL / FRAMEWORK_GAP / NODE_TYPE_GAP: `cb bot audit <bot_id>` for the full per-bot report, then closebot-apply-template or closebot-edit-job-flow.',
    '- NO_KB / LIBRARY_OFF / KB_NOT_READY: closebot-attach-knowledge.',
    '- DRAFT_NEWER_THAN_LIVE / NEVER_PUBLISHED: review the draft, then closebot-publish-safely (publishing always needs your confirmation).',
    '- Conversation quality: closebot-quality-audit.', '');
  return L.join('\n');
}

const mmdLabel = s => String(s ?? '').replace(/["[\]{}()<>|]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 60);
export function renderMermaid(map) {
  const L = ['graph LR', `  A["${mmdLabel(map.agency?.name ?? 'Agency')}"]`];
  const sid = new Map(map.sources.map((s, i) => [s.id, `S${i}`]));
  const bid = new Map(map.bots.map((b, i) => [b.id, `B${i}`]));
  for (const s of map.sources) {
    const n = sid.get(s.id);
    L.push(`  ${n}["${mmdLabel(s.name)}<br/>${mmdLabel(s.category)}"]`, `  A --> ${n}`);
    if (s.knowledge.libraryFiles || s.knowledge.smartFaqs) L.push(`  K${n}[("KB: ${s.knowledge.libraryFiles} files, ${s.knowledge.smartFaqs} FAQs")]`, `  ${n} -.-> K${n}`);
  }
  for (const b of map.bots) L.push(`  ${bid.get(b.id)}{{"${mmdLabel(b.name)}<br/>live ${mmdLabel(b.live ?? 'never')}"}}`);
  const edges = new Set();
  for (const s of map.sources) for (const x of s.bots) if (bid.has(x.id)) edges.add(`  ${sid.get(s.id)} --> ${bid.get(x.id)}`);
  for (const b of map.bots) for (const x of b.sources) if (sid.has(x.id)) edges.add(`  ${sid.get(x.id)} --> ${bid.get(b.id)}`);
  L.push(...edges);
  for (const b of map.bots) if (!b.sources.length && ![...edges].some(e => e.endsWith(` ${bid.get(b.id)}`))) L.push(`  A -.-> ${bid.get(b.id)}`);
  return L.join('\n') + '\n';
}

export function writeMap(map, dir) {
  mkdirSync(dir, { recursive: true });
  // The map holds your account's names and ids; keep it out of whatever repo it lands in.
  writeFileSync(join(dir, '.gitignore'), '*\n');
  writeFileSync(join(dir, 'map.json'), JSON.stringify(map, null, 2) + '\n');
  writeFileSync(join(dir, 'MAP.md'), renderMarkdown(map));
  writeFileSync(join(dir, 'map.mmd'), renderMermaid(map));
  return dir;
}

export const MAP_HELP = `cb map — read-only inventory of your whole CloseBot account (Tier 0, GET only)

Usage: cb map [--bot <bot_id>] [--no-steps] [--metrics] [--json] [--out <dir>] [--concurrency 4]

  --bot <id>      map one bot and the sources it is attached to
  --no-steps      skip the per-bot job-flow fetch (faster; no node counts or framework check)
  --metrics       add last-30-day message/action counts and the agency summary
  --json          print map.json to stdout and write nothing
  --out <dir>     output directory (default: map/<agency-slug>-<YYYY-MM-DD>/ in the repo;
                  plugin install: under the current directory)

Writes map.json, MAP.md (tables, per-bot sections, flagged issues) and map.mmd
(mermaid: agency -> sources -> bots -> KB). No lead data is fetched; keys, tokens
and member emails are never written. map/ is local output — do not commit it.
Per-call failures are recorded in "errors" and the map keeps going.`;

export async function mapCommand(ctx) {
  const f = ctx.flags;
  if (f.bot === true) fail(2, 'usage: cb map --bot <bot_id>');
  const conc = Math.max(1, Math.min(16, parseInt(f.concurrency, 10) || 4));
  const map = await buildMap(ctx, { botId: f.bot || null, steps: !f['no-steps'], metrics: !!f.metrics, templateBot: loadTemplateBot(), concurrency: conc });
  if (!map.agency && !map.bots.length && !map.sources.length && map.errors.length) {
    fail(3, `map failed: every read errored. First error: ${map.errors[0].op} → ${map.errors[0].status} ${map.errors[0].message}. Run cb doctor.`);
  }
  if (ctx.json) return printJson(map);
  // Plugin installs write under the current project, not into the plugin folder (replaced on update).
  const base = isPluginMode() ? process.cwd() : REPO_DIR;
  const dir = typeof f.out === 'string' ? f.out : join(base, 'map', `${slugify(map.agency?.name)}-${map.generatedAt.slice(0, 10)}`);
  writeMap(map, dir);
  const fails = map.issues.filter(i => i.severity === 'FAIL').length, warns = map.issues.filter(i => i.severity === 'WARN').length;
  process.stdout.write(`map written to ${dir}\n  ${map.counts.sources} sources, ${map.counts.bots} bots, ${map.counts.personas} personas, ${map.counts.libraryFiles} library files, ${map.counts.smartFaqs} Smart FAQs\n  issues: ${fails} fail, ${warns} warn; errors: ${map.errors.length}\n  open ${join(dir, 'MAP.md')}\n`);
}
