import type { Recipe } from "@prep-cart/catalog";

/**
 * Hidden taste factors, the latent-factor idea behind the Netflix Prize.
 *
 * Everyone's star ratings form a huge, mostly empty table (people by recipes). Low-rank methods
 * (SVD, PCA) explain that table with a handful of hidden "taste components": one might separate
 * spicy, saucy food from plain, lean food, another breakfast-for-dinner people from the rest. Each
 * recipe gets a position on those components, each person a set of weights, and a predicted rating
 * is just how well the two line up.
 *
 * The database never hands out anyone's ratings, only pooled numbers: for each pair of recipes, how
 * alike the people who rated both rated them (a correlation, from 3+ people). PCA of the rating table
 * is the eigen-decomposition of exactly that item-by-item correlation matrix, so the device can find
 * the recipe factors from the pooled numbers alone. Sparsity is handled by shrinkage: a correlation
 * from few people counts for little, and where nobody has rated both recipes yet, how alike they are
 * (cuisine, protein, flavor, ingredients) stands in. As more people rate, the community takes over.
 *
 * A person's own weights are then a small ridge regression of their ratings on the recipe factors.
 */

export interface PairStat { a: string; b: string; sim: number; n: number }

export interface TasteModel {
  ids: string[];
  index: Map<string, number>;
  /** recipe factors, row i = recipe ids[i], k columns */
  factors: Float64Array[];
  /** strength of each factor (eigenvalue), largest first */
  strength: number[];
  /** share of the recipe pairs whose similarity mostly comes from the community, 0..1 */
  communityShare: number;
}

/** co-raters needed before a community correlation counts as much as the recipe-trait stand-in */
export const SHRINK_RATERS = 5;
/** hidden taste components kept */
export const FACTORS = 8;
/** ridge penalty on a person's weights: with few ratings, predictions stay modest */
const RIDGE = 0.8;

const pairKey = (a: string, b: string) => (a < b ? `${a}|${b}` : `${b}|${a}`);

/** Small deterministic random numbers, so the same inputs always give the same factors. */
function rng(seed: number) {
  let s = seed >>> 0;
  return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296 - 0.5; };
}

/** Orthonormalize the columns of Q (n x k, stored as k column vectors) in place. */
function orthonormalize(cols: Float64Array[]): void {
  for (let j = 0; j < cols.length; j++) {
    const v = cols[j]!;
    for (let i = 0; i < j; i++) {
      const u = cols[i]!;
      let d = 0;
      for (let r = 0; r < v.length; r++) d += u[r]! * v[r]!;
      for (let r = 0; r < v.length; r++) v[r]! -= d * u[r]!;
    }
    let norm = 0;
    for (let r = 0; r < v.length; r++) norm += v[r]! * v[r]!;
    norm = Math.sqrt(norm) || 1;
    for (let r = 0; r < v.length; r++) v[r]! /= norm;
  }
}

/**
 * Top-k eigenpairs of a symmetric matrix by subspace (block power) iteration. Plenty for a
 * couple of hundred recipes and runs in a few milliseconds.
 */
export function topEigen(m: Float64Array[], k: number, iterations = 60): { values: number[]; vectors: Float64Array[] } {
  const n = m.length;
  k = Math.min(k, n);
  const rand = rng(7);
  let q: Float64Array[] = Array.from({ length: k }, () => Float64Array.from({ length: n }, rand));
  orthonormalize(q);
  const mul = (v: Float64Array) => {
    const out = new Float64Array(n);
    for (let r = 0; r < n; r++) { const row = m[r]!; let s = 0; for (let c = 0; c < n; c++) s += row[c]! * v[c]!; out[r] = s; }
    return out;
  };
  for (let it = 0; it < iterations; it++) { q = q.map(mul); orthonormalize(q); }
  const pairs = q.map((v) => { const mv = mul(v); let l = 0; for (let r = 0; r < n; r++) l += v[r]! * mv[r]!; return { l, v }; });
  pairs.sort((x, y) => y.l - x.l);
  return { values: pairs.map((p) => p.l), vectors: pairs.map((p) => p.v) };
}

/**
 * Builds the recipe factors from the pooled community correlations, falling back to recipe traits
 * where the community is silent. `traitSim` says how alike two recipes are by what's in them, 0..1.
 */
export function buildTasteModel(recipes: readonly Recipe[], pairs: readonly PairStat[], traitSim: (a: Recipe, b: Recipe) => number, k = FACTORS): TasteModel {
  const ids = recipes.map((r) => r.id);
  const index = new Map(ids.map((id, i) => [id, i]));
  const n = ids.length;
  const m = Array.from({ length: n }, () => new Float64Array(n));
  // trait similarity is all positive; centre it so "about as alike as any two recipes" means 0,
  // the way a correlation does, then scale it down: it's a stand-in, not evidence
  let sum = 0; let cnt = 0;
  for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) { const s = traitSim(recipes[i]!, recipes[j]!); m[i]![j] = s; sum += s; cnt++; }
  const mean = cnt ? sum / cnt : 0;
  const byPair = new Map<string, PairStat>();
  for (const p of pairs) if (Number.isFinite(p.sim) && p.n > 0) byPair.set(pairKey(p.a, p.b), p);
  let fromCommunity = 0;
  for (let i = 0; i < n; i++) {
    m[i]![i] = 1;
    for (let j = i + 1; j < n; j++) {
      const prior = (m[i]![j]! - mean) * 1.2;
      const p = byPair.get(pairKey(ids[i]!, ids[j]!));
      const w = p ? p.n / (p.n + SHRINK_RATERS) : 0;
      if (w > 0.5) fromCommunity++;
      const s = p ? w * Math.max(-1, Math.min(1, p.sim)) + (1 - w) * prior : prior;
      m[i]![j] = s; m[j]![i] = s;
    }
  }
  const { values, vectors } = topEigen(m, k);
  const keep = values.map((v, i) => [v, i] as const).filter(([v]) => v > 1e-6);
  const factors = Array.from({ length: n }, (_, r) => Float64Array.from(keep.map(([v, i]) => vectors[i]![r]! * Math.sqrt(v))));
  return { ids, index, factors, strength: keep.map(([v]) => v), communityShare: cnt ? fromCommunity / cnt : 0 };
}

/** Solve a small dense system A x = b (Gaussian elimination with partial pivoting). */
function solveSmall(a: number[][], b: number[]): number[] {
  const n = b.length;
  const m = a.map((row, i) => [...row, b[i]!]);
  for (let c = 0; c < n; c++) {
    let p = c;
    for (let r = c + 1; r < n; r++) if (Math.abs(m[r]![c]!) > Math.abs(m[p]![c]!)) p = r;
    [m[c], m[p]] = [m[p]!, m[c]!];
    const d = m[c]![c]! || 1e-12;
    for (let r = 0; r < n; r++) {
      if (r === c) continue;
      const f = m[r]![c]! / d;
      if (f) for (let k = c; k <= n; k++) m[r]![k]! -= f * m[c]![k]!;
    }
  }
  return m.map((row, i) => row[n]! / (row[i]! || 1e-12));
}

/**
 * A person's weights on the hidden taste components, from their ratings. `deviations` maps a recipe
 * to how much more (+) or less (-) than usual they liked it, about -1..1.
 */
export function tasteWeights(model: TasteModel, deviations: Record<string, number>): number[] {
  const k = model.strength.length;
  if (!k) return [];
  const ata = Array.from({ length: k }, (_, i) => Array.from({ length: k }, (_, j) => (i === j ? RIDGE : 0)));
  const atb = new Array<number>(k).fill(0);
  for (const [id, d] of Object.entries(deviations)) {
    const i = model.index.get(id);
    if (i == null) continue;
    const v = model.factors[i]!;
    for (let a = 0; a < k; a++) { atb[a]! += v[a]! * d; for (let b = 0; b < k; b++) ata[a]![b]! += v[a]! * v[b]!; }
  }
  return solveSmall(ata, atb);
}

/** Predicted deviation for one recipe, about -1..1, from a person's weights. */
export function tastePredict(model: TasteModel, weights: number[], id: string): number {
  const i = model.index.get(id);
  if (i == null || !weights.length) return 0;
  const v = model.factors[i]!;
  let s = 0;
  for (let a = 0; a < weights.length; a++) s += weights[a]! * v[a]!;
  return Math.max(-1, Math.min(1, s));
}
