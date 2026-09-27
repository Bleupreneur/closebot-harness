import { CbValidationError } from './output.mjs';

export function parseSemver(v) { return String(v).split('.').map(n => parseInt(n, 10) || 0); }
export function cmpSemver(a, b) {
  const A = parseSemver(a), B = parseSemver(b);
  for (let i = 0; i < Math.max(A.length, B.length); i++) {
    const d = (A[i] || 0) - (B[i] || 0);
    if (d !== 0) return d < 0 ? -1 : 1;
  }
  return 0;
}
export function resolveTarget(bot) {
  const vs = bot?.versions || [];
  if (!vs.length) throw new CbValidationError('bot has no versions');
  const sorted = [...vs].sort((x, y) => cmpSemver(x.version, y.version));
  const head = sorted.at(-1);
  const live = [...sorted].reverse().find(v => v.published) || null;
  return { target: head.version, targetPublished: !!head.published, live: live?.version ?? null, liveEqualsTarget: live?.version === head.version };
}
