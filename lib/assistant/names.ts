/**
 * Fuzzy name matching for speech ("Ambassador", "creater partners", "Meera Ayer").
 * Ignores titles/punctuation, squashes doubled letters, scores each spoken word by
 * exact / prefix / 1 − Levenshtein/length, averages, keeps ≥ 0.74 within 0.06 of best.
 */
const norm = (s: string) =>
  s
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\b(dr|mr|mrs|ms|the|campaign|bet)\b/g, " ")
    .replace(/(.)\1+/g, "$1")
    .split(/\s+/)
    .filter(Boolean);

function lev(a: string, b: string): number {
  const m = a.length;
  const n = b.length;
  const d = Array.from({ length: m + 1 }, (_, i) => [i, ...new Array<number>(n).fill(0)]);
  for (let j = 1; j <= n; j++) d[0]![j] = j;
  for (let i = 1; i <= m; i++)
    for (let j = 1; j <= n; j++) d[i]![j] = Math.min(d[i - 1]![j]! + 1, d[i]![j - 1]! + 1, d[i - 1]![j - 1]! + (a[i - 1] === b[j - 1] ? 0 : 1));
  return d[m]![n]!;
}

function wordScore(w: string, cand: string[]): number {
  let best = 0;
  for (const c of cand) {
    if (w === c) return 1;
    if (w.length >= 3 && (c.startsWith(w) || w.startsWith(c))) best = Math.max(best, 0.92);
    best = Math.max(best, 1 - lev(w, c) / Math.max(w.length, c.length));
  }
  return best;
}

export function matchNames<T>(spoken: string, items: T[], label: (t: T) => string[], min = 0.74): { item: T; score: number }[] {
  const words = norm(spoken);
  if (!words.length) return [];
  const scored = items
    .map((item) => {
      const cand = label(item).flatMap(norm);
      const score = words.reduce((a, w) => a + wordScore(w, cand), 0) / words.length;
      return { item, score };
    })
    .filter((x) => x.score >= min)
    .sort((a, b) => b.score - a.score);
  const top = scored[0]?.score ?? 0;
  return scored.filter((x) => x.score >= top - 0.06);
}
