// Small, dependency-free statistics used by the health checks and the decision.

// Regularised upper incomplete gamma for chi-square survival (df small). Uses series / continued fraction.
function gammaln(x) {
  const c = [76.18009172947146, -86.50532032941677, 24.01409824083091, -1.231739572450155, 0.1208650973866179e-2, -0.5395239384953e-5];
  let y = x;
  const tmp = x + 5.5 - (x + 0.5) * Math.log(x + 5.5);
  let ser = 1.000000000190015;
  for (const ci of c) ser += ci / ++y;
  return -tmp + Math.log((2.5066282746310005 * ser) / x);
}
function gammq(a, x) {
  if (x <= 0) return 1;
  if (x < a + 1) {
    let sum = 1 / a, del = sum, ap = a;
    for (let n = 0; n < 500; n++) { ap++; del *= x / ap; sum += del; if (Math.abs(del) < Math.abs(sum) * 1e-14) break; }
    return 1 - sum * Math.exp(-x + a * Math.log(x) - gammaln(a));
  }
  let b = x + 1 - a, c = 1e300, d = 1 / b, h = d;
  for (let i = 1; i < 500; i++) {
    const an = -i * (i - a); b += 2;
    d = an * d + b; if (Math.abs(d) < 1e-300) d = 1e-300;
    c = b + an / c; if (Math.abs(c) < 1e-300) c = 1e-300;
    d = 1 / d; const del = d * c; h *= del;
    if (Math.abs(del - 1) < 1e-14) break;
  }
  return Math.exp(-x + a * Math.log(x) - gammaln(a)) * h;
}

/** Chi-square goodness-of-fit p-value for observed counts vs expected weights (summing to 1). */
export function srmPValue(observed, weights) {
  const total = observed.reduce((a, b) => a + b, 0);
  if (total === 0) return null;
  let chi = 0;
  observed.forEach((o, i) => { const e = total * weights[i]; if (e > 0) chi += (o - e) ** 2 / e; });
  return gammq((observed.length - 1) / 2, chi / 2);
}

// Beta sampling via two gammas (Marsaglia-Tsang), seeded for reproducible output.
function makeRng(seed = 12345) {
  let s = seed >>> 0;
  return () => ((s = (s * 1664525 + 1013904223) >>> 0) + 0.5) / 2 ** 32;
}
function normal(rng) {
  const u = rng(), v = rng();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}
function gamma(k, rng) {
  if (k < 1) return gamma(k + 1, rng) * rng() ** (1 / k);
  const d = k - 1 / 3, c = 1 / Math.sqrt(9 * d);
  for (;;) {
    let x, v;
    do { x = normal(rng); v = 1 + c * x; } while (v <= 0);
    v = v ** 3;
    const u = rng();
    if (u < 1 - 0.0331 * x ** 4 || Math.log(u) < 0.5 * x * x + d * (1 - v + Math.log(v))) return d * v;
  }
}
/** P(rate_b > rate_a) under Beta(1+x, 1+n-x) posteriors. */
export function chanceToBeat(a, b, draws = 20000, seed = 12345) {
  const rng = makeRng(seed);
  let wins = 0;
  for (let i = 0; i < draws; i++) {
    const ga = gamma(1 + a.x, rng), pa = ga / (ga + gamma(1 + a.n - a.x, rng));
    const gb = gamma(1 + b.x, rng), pb = gb / (gb + gamma(1 + b.n - b.x, rng));
    if (pb > pa) wins++;
  }
  return wins / draws;
}

/** Lehr's rule of thumb: n per arm for 80% power, two-sided 5%. */
export function minSamplePerArm(baseRate, relativeLift) {
  const p2 = baseRate * (1 + relativeLift);
  const pbar = (baseRate + p2) / 2;
  return Math.ceil((16 * pbar * (1 - pbar)) / (p2 - baseRate) ** 2);
}

export function levenshtein(a, b) {
  const dp = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array(b.length).fill(0)]);
  for (let j = 1; j <= b.length; j++) dp[0][j] = j;
  for (let i = 1; i <= a.length; i++)
    for (let j = 1; j <= b.length; j++)
      dp[i][j] = Math.min(dp[i - 1][j] + 1, dp[i][j - 1] + 1, dp[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
  return dp[a.length][b.length];
}
