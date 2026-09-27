import { overrideFor, opKey } from './spec.mjs';
import { mask } from './config.mjs';

export function buildUrl(base, pathTemplate, params = {}, query = {}) {
  let p = pathTemplate.replace(/\{(\w+)\}/g, (_, k) => encodeURIComponent(params[k] ?? `{${k}}`));
  const qs = new URLSearchParams(Object.entries(query).filter(([, v]) => v !== undefined && v !== null && v !== ''));
  const q = qs.toString();
  return `${base}${p}${q ? `?${q}` : ''}`;
}

export function redact(value, fields) {
  const set = new Set(fields.map(f => f.toLowerCase()));
  const walk = v => {
    if (Array.isArray(v)) return v.map(walk);
    if (v && typeof v === 'object') {
      const o = {};
      for (const [k, x] of Object.entries(v)) o[k] = set.has(k.toLowerCase()) ? '***' : walk(x);
      return o;
    }
    return v;
  };
  return walk(value);
}

export function projectList(items, fields) {
  return (items || []).map(it => Object.fromEntries(fields.map(f => [f, it?.[f] ?? null])));
}

function parseBody(text) { try { return JSON.parse(text); } catch { return text; } }

export async function request(opts) {
  const { method, base, path, params = {}, query = {}, key, overrides, fetchImpl = fetch,
    dryRun = false, onSurprise = null, unsafeRaw = false, maxTimeMs = 30000 } = opts;
  let body = opts.body;
  const M = method.toUpperCase();
  const ov = overrideFor(M, path, overrides);
  const isLive = base.includes('closebot.ai');

  for (const rq of ov.requiredQuery || []) {
    if (!query[rq]) return { status: 0, ok: false, expected: true, data: null, note: `${rq} is required for ${opKey(M, path)} (spec marks it optional; API returns 400 without it)` };
  }
  if (!opts.multipart && ov.bodyShape === 'array' && body && !Array.isArray(body)) body = [body];

  const url = buildUrl(base, path, params, query);
  const headers = opts.multipart ? { 'X-CB-KEY': key } : { 'X-CB-KEY': key, 'Content-Type': 'application/json' };
  if (dryRun) {
    const dryBody = opts.multipart ? '<multipart FormData>' : (body ?? null);
    return { status: 0, ok: true, expected: true, data: { method: M, url, headers: { ...headers, 'X-CB-KEY': mask() }, body: dryBody } };
  }

  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), maxTimeMs);
  let text, status;
  try {
    // The abort timer must cover the body read (resp.text()), not just the initial
    // fetch() — a slow or long-poll response can resolve fetch() immediately with
    // headers and then hang while streaming the body, past maxTimeMs, if the timer
    // is cleared before the body is read.
    const resp = await fetchImpl(url, { method: M, headers, body: opts.multipart ? body : (body === undefined || M === 'GET' ? undefined : JSON.stringify(body)), signal: ctrl.signal });
    status = resp.status;
    text = await resp.text();
  } finally { clearTimeout(timer); }
  let data = parseBody(text);
  let expected = status < 300;
  let note;

  if (isLive && overrides.liveMessageStatuses?.[status]) { expected = true; note = overrides.liveMessageStatuses[status]; }
  if (ov.expectedStatus?.[status]) { expected = true; note = ov.expectedStatus[status]; }
  if (ov.expect && status === ov.expect) expected = true;

  const hint = typeof data === 'object' ? JSON.stringify(data) : String(data);
  const shapeHint = status === 400 && /could not be converted|field is required/i.test(hint);
  if ((!expected || shapeHint) && onSurprise) {
    // Redact first (removes secret fields entirely), THEN cap to 300 chars — capping
    // an unredacted object before stringifying would leave string bodies bounded but
    // object bodies unbounded, and gotchas/auto.jsonl holds account data (gitignored, local only).
    const redacted = redact(typeof data === 'object' && data !== null ? data : { text: hint }, overrides.redactFields);
    const bodyExcerpt = (typeof redacted === 'object' && redacted !== null ? JSON.stringify(redacted) : String(redacted)).slice(0, 300);
    onSurprise({ opKey: opKey(M, path), status, requestShape: body === undefined ? null : (Array.isArray(body) ? 'array' : typeof body), bodyExcerpt });
  }

  if (status < 300 || expected) {
    if (ov.clientFilter && query[ov.clientFilter.query]) {
      if (Array.isArray(data)) {
        const want = query[ov.clientFilter.query];
        data = data.filter(it => (it?.[ov.clientFilter.arrayPath] || []).some(s => s?.[ov.clientFilter.field] === want));
      } else {
        // Fails open otherwise: silently returning the whole account's data as if it
        // were already filtered by sourceId (etc.) would make e.g. `kb verify` count
        // every file in the account as attached to the source and report success.
        note = `clientFilter for ${opKey(M, path)} expected an array response but got ${data === null ? 'null' : typeof data} — results are UNFILTERED, do not trust them`;
      }
    }
    if (ov.followUp && status < 300) {
      const fu = ov.followUp;
      const fuParams = fu.idFromResponse ? { id: data?.[fu.idFromResponse] } : {};
      const fuQuery = Object.fromEntries((fu.queryFromBody || []).map(k => [k, (Array.isArray(body) ? body[0] : body)?.[k]]));
      const r2 = await request({ ...opts, method: fu.method, path: fu.path, params: fuParams, query: fuQuery, body: undefined });
      if (fu.matchField && Array.isArray(r2.data)) {
        const sent = (Array.isArray(body) ? body[0] : body)?.[fu.matchField];
        data = r2.data.filter(x => x?.[fu.matchField] === sent).at(-1) ?? r2.data;
      } else data = r2.data;
    }
    if (ov.project === 'sources' && !unsafeRaw) {
      const list = ov.envelope ? data?.[ov.envelope] : (Array.isArray(data) ? data : [data]);
      data = projectList(list, overrides.projectSources);
    }
  }
  // Redact everywhere except the case just handled above (already projected to safe
  // fields) so error bodies (4xx/5xx, or unexpected statuses) never leak secrets either.
  if (!unsafeRaw && !(ov.project === 'sources' && (status < 300 || expected))) {
    data = redact(data, overrides.redactFields);
  }
  return { status, ok: status < 300 || expected, expected, data, note };
}
