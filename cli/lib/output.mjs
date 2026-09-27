export function printJson(v) { process.stdout.write(JSON.stringify(v, null, 2) + '\n'); }
export function printTable(rows) {
  if (!Array.isArray(rows) || !rows.length) { process.stdout.write('(empty)\n'); return; }
  // A bare array of primitives (e.g. a generated GET that returns ["a","b"]) is not
  // row-shaped: Object.keys("abc") would print character-index columns (0,1,2). Print
  // one value per line instead of pretending it's tabular.
  if (rows.some(r => r === null || typeof r !== 'object')) {
    for (const r of rows) process.stdout.write(String(r) + '\n');
    return;
  }
  const cols = [...new Set(rows.flatMap(r => Object.keys(r)))];
  const w = cols.map(c => Math.max(c.length, ...rows.map(r => String(r[c] ?? '').length)));
  const line = r => cols.map((c, i) => String(r[c] ?? '').padEnd(w[i])).join('  ');
  process.stdout.write(line(Object.fromEntries(cols.map(c => [c, c]))) + '\n');
  process.stdout.write(cols.map((_, i) => '-'.repeat(w[i])).join('  ') + '\n');
  for (const r of rows) process.stdout.write(line(r) + '\n');
}
export function fail(code, msg) { process.stderr.write(`cb: ${msg}\n`); process.exit(code); }

// Marks a thrown error as a validation refusal (exit 2) rather than a genuine API/network
// failure (exit 3) when it propagates up to main().catch in cli/cb, uncaught by fail().
export class CbValidationError extends Error {}
