import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { sha256, diffManifest, readabilityGaps, kbCommands, parseCsvLine } from '../lib/kb.mjs';

const libraryList = JSON.parse(readFileSync(new URL('./fixtures/library-list.json', import.meta.url)));

// FIFO ctx.call recorder: pops the next canned response for each call (in the exact order
// kb.mjs issues them) and records the full call shape for assertion. Responses default to
// a generic ok:true/data:null when the script runs short (should never happen if the test
// supplies one entry per expected call).
function mockCtx(responses, flags = {}) {
  const queue = [...responses];
  const calls = [];
  const call = async (o) => { calls.push(o); return queue.shift() ?? { ok: true, status: 200, data: null }; };
  // getBot/getSteps (used by kb verify --bot) read via (ctx.read || ctx.call) — alias
  // read to the same recorder so this mock exercises the real production ctx shape.
  const ctx = { flags, call, read: call };
  return { ctx, calls };
}

function makeTmpDir() {
  const dir = mkdtempSync(join(tmpdir(), 'cb-kb-test-'));
  return dir;
}

test('sha256 is stable hex', () => { assert.equal(sha256(Buffer.from('a')).length, 64); });

// Ledger #44: a quoted comma in an FAQ answer is ordinary content, and a naive
// `line.split(',')` silently truncated it into the client's knowledge base.
test('parseCsvLine keeps a quoted comma as part of one field', () => {
  assert.deepEqual(parseCsvLine('What are your hours?,"We are open Mon, Wed, and Fri"'),
    ['What are your hours?', 'We are open Mon, Wed, and Fri']);
});

test('parseCsvLine unescapes doubled quotes inside a quoted field', () => {
  assert.deepEqual(parseCsvLine('Q,"He said ""hi"" to me"'), ['Q', 'He said "hi" to me']);
});

test('parseCsvLine handles a plain unquoted line same as before', () => {
  assert.deepEqual(parseCsvLine('question,answer'), ['question', 'answer']);
});

test('diffManifest classifies added/changed/removed', () => {
  const m = { files: { 'a.txt': { sha256: 'A' }, 'b.txt': { sha256: 'B' } } };
  const local = [{ name: 'a.txt', sha256: 'A' }, { name: 'b.txt', sha256: 'B2' }, { name: 'c.txt', sha256: 'C' }];
  assert.deepEqual(diffManifest(m, local), { added: ['c.txt'], changed: ['b.txt'], removed: [] });
  assert.deepEqual(diffManifest(m, [{ name: 'a.txt', sha256: 'A' }]), { added: [], changed: [], removed: ['b.txt'] });
});

test('readabilityGaps flags Method nodes with EnableLibraryContext off when files are attached', () => {
  const steps = { nodes: [
    { type: 'Method', data: { Title: 'General Info', EnableLibraryContext: false } },
    { type: 'Method', data: { Title: 'Booking Agent', EnableLibraryContext: true } },
    { type: 'End', data: {} } ] };
  assert.deepEqual(readabilityGaps(steps, 2), ['General Info']);
  assert.deepEqual(readabilityGaps(steps, 0), []);
});

test('build: uploads + attaches new local files, then verifies; a second build with no changes only re-verifies', async () => {
  const dir = makeTmpDir();
  try {
    writeFileSync(join(dir, 'a.txt'), 'hello');
    const expectedSha = sha256(Buffer.from('hello'));

    const { ctx, calls } = mockCtx([
      { ok: true, status: 200, data: { id: 'file_1', fileId: 'file_1' } }, // upload
      { ok: true, status: 200, data: null },                              // attach
      { ok: true, status: 200, data: [] },                                // verify's GET /library/files
    ], { source: 'src_A', from: dir });

    await kbCommands.build(ctx);

    assert.equal(calls.length, 3);
    assert.equal(calls[0].method, 'POST'); assert.equal(calls[0].path, '/library/files'); assert.equal(calls[0].multipart, true);
    assert.ok(calls[0].body instanceof FormData);
    const filePart = calls[0].body.get('file');
    assert.equal(filePart.name, 'a.txt');

    assert.equal(calls[1].method, 'POST'); assert.equal(calls[1].path, '/library/files/{fileId}/source/{sourceId}');
    assert.deepEqual(calls[1].params, { fileId: 'file_1', sourceId: 'src_A' });
    assert.deepEqual(calls[1].body, { tags: [], channels: [], enabled: true });

    assert.equal(calls[2].method, 'GET'); assert.equal(calls[2].path, '/library/files');
    assert.equal(calls[2].query.sourceId, 'src_A');

    const manifest = JSON.parse(readFileSync(join(dir, '.cb-kb-manifest.json'), 'utf8'));
    assert.equal(manifest.files['a.txt'].fileId, 'file_1');
    assert.equal(manifest.files['a.txt'].sha256, expectedSha);
    assert.equal(manifest.files['a.txt'].attached, true);

    // Second build on the unchanged dir: manifest sha matches local sha, so no upload/attach —
    // only the trailing verify GET fires.
    const second = mockCtx([
      { ok: true, status: 200, data: [] }, // verify's GET /library/files
    ], { source: 'src_A', from: dir });
    await kbCommands.build(second.ctx);
    assert.equal(second.calls.length, 1);
    assert.equal(second.calls[0].method, 'GET'); assert.equal(second.calls[0].path, '/library/files');
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

// I3: attach() used to call fail() (process.exit) before the manifest write ever ran, so
// a failed attach left the uploaded file unknown to the manifest — the next `cb kb build`
// would re-upload a duplicate. fail() exits the process, so this drives the real CLI
// entry point (kb.mjs's fail import) as a subprocess rather than calling kbCommands
// in-process, which would kill the test runner.
test('build: attach failure leaves the upload recorded as attached:false and exits 3 naming the fileId (never DELETEs)', () => {
  const dir = makeTmpDir();
  try {
    writeFileSync(join(dir, 'a.txt'), 'hello');
    const kbPath = fileURLToPath(new URL('../lib/kb.mjs', import.meta.url));
    const script = `
      import { kbCommands } from ${JSON.stringify(kbPath)};
      const ctx = { flags: { source: 'src_A', from: ${JSON.stringify(dir)} },
        call: async (o) => {
          if (o.method === 'POST' && o.path === '/library/files') return { ok: true, status: 200, data: { id: 'file_1', fileId: 'file_1' } };
          if (o.method === 'POST' && o.path === '/library/files/{fileId}/source/{sourceId}') return { ok: false, status: 500, data: null };
          return { ok: true, status: 200, data: [] };
        } };
      await kbCommands.build(ctx);
    `;
    const scriptPath = join(dir, 'run.mjs');
    writeFileSync(scriptPath, script);
    const r = spawnSync('node', [scriptPath], { encoding: 'utf8' });

    assert.equal(r.status, 3);
    assert.match(r.stderr, /file_1/);
    assert.match(r.stderr, /attach.*failed/i);
    assert.doesNotMatch(r.stderr, /DELETE/);

    const manifest = JSON.parse(readFileSync(join(dir, '.cb-kb-manifest.json'), 'utf8'));
    assert.equal(manifest.files['a.txt'].fileId, 'file_1');
    assert.equal(manifest.files['a.txt'].attached, false);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('build: --faq-csv with a quoted comma in the answer sends the whole answer, not just the part before the comma', async () => {
  const dir = makeTmpDir(); // --from: no KB files here, so localFiles(dir) is empty
  const csvDir = makeTmpDir(); // faq.csv lives outside --from: kb.mjs also treats any
  // .csv file inside --from as a knowledge file to upload, so co-locating them would
  // consume the mocked upload/attach responses meant for the FAQ call.
  try {
    const csv = 'question,answer\n"Hours?","We are open Mon, Wed, and Fri"\n';
    writeFileSync(join(csvDir, 'faq.csv'), csv);
    const { ctx, calls } = mockCtx([
      { ok: true, status: 200, data: null },  // POST /smart-faq
      { ok: true, status: 200, data: [] },    // verify's GET /library/files
    ], { source: 'src_A', from: dir, 'faq-csv': join(csvDir, 'faq.csv') });
    await kbCommands.build(ctx);
    const faqCall = calls.find(c => c.path === '/smart-faq');
    assert.equal(faqCall.body.question, 'Hours?');
    assert.equal(faqCall.body.answer, 'We are open Mon, Wed, and Fri');
  } finally { rmSync(dir, { recursive: true, force: true }); rmSync(csvDir, { recursive: true, force: true }); }
});

// Minor 4: parseArgs turns a valueless `--url` into boolean true, which used to be sent
// straight through as scrapeUrl: true.
test('build: a bare --url with no value is refused (exit 2), not sent as scrapeUrl:true', () => {
  const dir = makeTmpDir();
  try {
    const kbPath = fileURLToPath(new URL('../lib/kb.mjs', import.meta.url));
    const script = `
      import { kbCommands } from ${JSON.stringify(kbPath)};
      const ctx = { flags: { source: 'src_A', from: ${JSON.stringify(dir)}, url: true },
        call: async () => { throw new Error('ctx.call must not be reached for a bare --url'); } };
      await kbCommands.build(ctx);
    `;
    const scriptPath = join(dir, 'run.mjs');
    writeFileSync(scriptPath, script);
    const r = spawnSync('node', [scriptPath], { encoding: 'utf8' });
    assert.equal(r.status, 2);
    assert.match(r.stderr, /--url needs a value/);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('update: replaces changed files (multipart newFile), uploads+attaches added files, soft-detaches removed files, never DELETEs', async () => {
  const dir = makeTmpDir();
  try {
    writeFileSync(join(dir, 'a.txt'), 'new content'); // changed vs manifest's stale sha
    writeFileSync(join(dir, 'c.txt'), 'brand new');    // added
    // b.txt intentionally absent from disk → removed
    const manifest = {
      sourceId: 'src_A',
      files: {
        'a.txt': { fileId: 'file_1', sha256: 'STALE_SHA', uploadedAt: '2026-01-01T00:00:00.000Z' },
        'b.txt': { fileId: 'file_2', sha256: sha256(Buffer.from('anything')), uploadedAt: '2026-01-01T00:00:00.000Z' },
      },
      faqs: [], scrapes: [],
    };
    writeFileSync(join(dir, '.cb-kb-manifest.json'), JSON.stringify(manifest, null, 2));

    const { ctx, calls } = mockCtx([
      { ok: true, status: 200, data: null },                              // PUT replace a.txt
      { ok: true, status: 200, data: { id: 'file_3', fileId: 'file_3' } }, // upload c.txt
      { ok: true, status: 200, data: null },                              // attach c.txt
      { ok: true, status: 200, data: null },                              // attach b.txt enabled:false (removal)
    ], { from: dir });

    const result = await kbCommands.update(ctx);

    assert.deepEqual(result, { added: ['c.txt'], changed: ['a.txt'], removed: ['b.txt'] });
    assert.equal(calls.length, 4);

    assert.equal(calls[0].method, 'PUT'); assert.equal(calls[0].path, '/library/files/{fileId}'); assert.equal(calls[0].multipart, true);
    assert.deepEqual(calls[0].params, { fileId: 'file_1' });
    assert.ok(calls[0].body instanceof FormData);
    assert.equal(calls[0].body.get('newFile').name, 'a.txt');

    assert.equal(calls[1].method, 'POST'); assert.equal(calls[1].path, '/library/files'); assert.equal(calls[1].multipart, true);
    assert.equal(calls[1].body.get('file').name, 'c.txt');

    assert.equal(calls[2].method, 'POST'); assert.equal(calls[2].path, '/library/files/{fileId}/source/{sourceId}');
    assert.deepEqual(calls[2].params, { fileId: 'file_3', sourceId: 'src_A' });
    assert.deepEqual(calls[2].body, { tags: [], channels: [], enabled: true });

    assert.equal(calls[3].method, 'POST'); assert.equal(calls[3].path, '/library/files/{fileId}/source/{sourceId}');
    assert.deepEqual(calls[3].params, { fileId: 'file_2', sourceId: 'src_A' });
    assert.deepEqual(calls[3].body, { tags: [], channels: [], enabled: false });

    assert.ok(!calls.some(c => c.method === 'DELETE'), 'update must never issue a DELETE');

    const saved = JSON.parse(readFileSync(join(dir, '.cb-kb-manifest.json'), 'utf8'));
    assert.equal(saved.files['a.txt'].fileId, 'file_1');
    assert.equal(saved.files['a.txt'].sha256, sha256(Buffer.from('new content')));
    assert.equal(saved.files['c.txt'].fileId, 'file_3');
    assert.equal(saved.files['c.txt'].sha256, sha256(Buffer.from('brand new')));
    assert.equal('b.txt' in saved.files, false);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('verify: reports attached count + notReady files, and with --bot flags EnableLibraryContext gaps', async () => {
  // Simulate the client-side sourceId filter that request()'s clientFilter override performs
  // (covered separately in http.test.mjs) — only the src_A row from the fixture, plus one
  // not-ready row, is what a filtered GET /library/files would return for src_A.
  const filtered = [libraryList[0], { fileId: 'file_9', fileName: 'x.pdf', fileType: 'pdf', fileStatus: 'processing', sources: [{ id: 'src_A' }] }];
  assert.equal(libraryList[0].sources[0].id, 'src_A');

  const { ctx: ctxNoBot } = mockCtx([{ ok: true, status: 200, data: filtered }], { source: 'src_A' });
  const out = await kbCommands.verify(ctxNoBot);
  assert.equal(out.sourceId, 'src_A');
  assert.equal(out.attached, 2);
  assert.deepEqual(out.notReady, [{ fileId: 'file_9', fileName: 'x.pdf', fileStatus: 'processing' }]);

  const { ctx: ctxWithBot, calls } = mockCtx([
    { ok: true, status: 200, data: filtered },                                                            // GET /library/files
    { ok: true, status: 200, data: { versions: [{ version: '0.0.1', published: true }, { version: '0.0.2', published: false }] } }, // getBot
    { ok: true, status: 200, data: { nodes: [{ type: 'Method', data: { Title: 'General Info', EnableLibraryContext: false } }] } }, // getSteps
  ], { source: 'src_A', bot: 'bot_1' });
  const outWithBot = await kbCommands.verify(ctxWithBot);
  assert.equal(outWithBot.bot, 'bot_1');
  assert.equal(outWithBot.version, '0.0.2');
  assert.deepEqual(outWithBot.methodsThatCannotReadLibrary, ['General Info']);
  const stepsCall = calls.find(c => c.path === '/bot/{id}/steps');
  assert.equal(stepsCall.query.botVersion, '0.0.2');
});

// Live gotcha 2026-09-05: `cb bot post-source` with the schema-minimum body writes every
// declared flow variable as "", overriding its default. `kb verify --bot` should surface
// that on the SAME source being verified right after an attach, not require a full audit.
test('verify: --bot flags empty flowVariableValues on the source being verified', async () => {
  const { ctx } = mockCtx([
    { ok: true, status: 200, data: [] }, // GET /library/files
    { ok: true, status: 200, data: {     // getBot
      versions: [{ version: '0.0.1', published: false }],
      sources: [
        { id: 'src_A', name: 'Testing', flowVariableValues: { 'source.office_hours': '', 'source.website': 'https://x.example.com' } },
        { id: 'src_OTHER', flowVariableValues: { 'source.office_hours': '' } },
      ],
    } },
    { ok: true, status: 200, data: { nodes: [] } }, // getSteps
  ], { source: 'src_A', bot: 'bot_1' });
  const out = await kbCommands.verify(ctx);
  assert.deepEqual(out.emptyFlowVariables, ['source.office_hours']);
});

test('verify: --bot omits emptyFlowVariables when the source has none empty', async () => {
  const { ctx } = mockCtx([
    { ok: true, status: 200, data: [] },
    { ok: true, status: 200, data: { versions: [{ version: '0.0.1', published: false }], sources: [{ id: 'src_A', flowVariableValues: { 'source.website': 'https://x.example.com' } }] } },
    { ok: true, status: 200, data: { nodes: [] } },
  ], { source: 'src_A', bot: 'bot_1' });
  const out = await kbCommands.verify(ctx);
  assert.equal(out.emptyFlowVariables, undefined);
});

// Carried CLI fix (2026-09-05): FileDto.fileStatus has no enum in schema/openapi.json.
// verify() used to treat any status !== 'ready' as notReady, but the API reports
// "indexed" (not "ready") on real, attached, working files — a false positive in the
// conservative direction. Both "ready" and "indexed" now count as ready; "processing"
// (or anything else) still does not.
test('verify: fileStatus "indexed" counts as ready; "processing" still counts as notReady', async () => {
  const files = [
    { fileId: 'file_ready', fileName: 'a.txt', fileStatus: 'ready', sources: [{ id: 'src_A' }] },
    { fileId: 'file_indexed', fileName: 'b.pdf', fileStatus: 'indexed', sources: [{ id: 'src_A' }] },
    { fileId: 'file_processing', fileName: 'c.docx', fileStatus: 'processing', sources: [{ id: 'src_A' }] },
  ];
  const { ctx } = mockCtx([{ ok: true, status: 200, data: files }], { source: 'src_A' });
  const out = await kbCommands.verify(ctx);
  assert.equal(out.attached, 3);
  assert.deepEqual(out.notReady, [{ fileId: 'file_processing', fileName: 'c.docx', fileStatus: 'processing' }]);
});

test('verify: --from surfaces manifest entries still attached:false from a prior partial build/update', async () => {
  const dir = makeTmpDir();
  try {
    writeFileSync(join(dir, '.cb-kb-manifest.json'), JSON.stringify({
      sourceId: 'src_A',
      files: { 'a.txt': { fileId: 'file_1', sha256: 'X', attached: true }, 'b.txt': { fileId: 'file_2', sha256: 'Y', attached: false } },
      faqs: [], scrapes: [{ fileId: 'file_3', url: 'https://x.example.com', attached: false }],
    }, null, 2));
    const { ctx } = mockCtx([{ ok: true, status: 200, data: [] }], { source: 'src_A', from: dir });
    const out = await kbCommands.verify(ctx);
    assert.deepEqual(out.orphaned, [{ name: 'b.txt', fileId: 'file_2' }, { url: 'https://x.example.com', fileId: 'file_3' }]);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});
