import { INGREDIENTS, RECIPES, type Recipe } from "@prep-cart/catalog";

/**
 * Recommendations from star ratings, in the spirit of Netflix: the recipes you rate tell us what
 * you like, and the ratings of everyone else tell us which recipes go together.
 *
 * Two kinds of similarity between recipes are blended:
 * - community: how alike two recipes were rated by the people who rated both (adjusted cosine over
 *   everyone's ratings, worked out by the database so nobody's own ratings leave it);
 * - content: shared cuisine, protein, flavor, mood and ingredients, so recommendations work from the
 *   first rating, before there are enough raters.
 * The community similarity takes over as more people rate both recipes.
 *
 * For a recipe you haven't rated, the prediction is the similarity-weighted average of how much
 * more or less than usual you liked its nearest rated neighbours, plus a little of how the whole
 * community rated it.
 */

/** Community similarity between two recipes, from the people who rated both. */
export interface Neighbor { a: string; b: string; sim: number; n: number }
/** How the community rated a recipe overall. */
export interface RecipeStat { id: string; avg: number; n: number }
export interface Community { neighbors: Neighbor[]; stats: RecipeStat[] }

export interface Recommendation {
  /** -1 (you'd likely dislike it) .. 1 (you'd likely love it) */
  affinity: number;
  /** Netflix-style match, 0..99 */
  match: number;
  /** the rated recipe that most drives a positive pick */
  because?: string;
  /** what mostly drives it */
  source: "you" | "community" | "popular";
}

const NEUTRAL = 3.5;
/** co-raters needed before the community similarity counts as much as the content similarity */
const COMMUNITY_HALF = 5;
/** raters needed before a recipe's average counts for half its weight */
const POPULAR_HALF = 10;
/** nearest rated recipes used for each prediction */
const K = 8;

const jaccard = (a: readonly string[], b: readonly string[]): number => {
  if (!a.length && !b.length) return 0;
  let both = 0;
  for (const x of a) if (b.includes(x)) both++;
  return both / (a.length + b.length - both);
};

/** Ingredients that say something about taste (pantry staples like oil and salt don't). */
const keyIngredients = (r: Recipe): string[] => r.lines.map((l) => l.ingredientId).filter((id) => !INGREDIENTS[id]?.staple);

/** How alike two recipes are by what's in them, 0..1. */
export function contentSimilarity(a: Recipe, b: Recipe): number {
  if (a.id === b.id) return 1;
  const s =
    0.32 * jaccard(a.cuisines, b.cuisines) +
    0.24 * jaccard(a.proteins, b.proteins) +
    0.14 * jaccard(a.flavors, b.flavors) +
    0.1 * jaccard(a.moods, b.moods) +
    0.2 * jaccard(keyIngredients(a), keyIngredients(b));
  // a breakfast you love says less about dinners
  return a.mealType === b.mealType ? s : s * 0.7;
}

const pairKey = (a: string, b: string) => (a < b ? `${a}|${b}` : `${b}|${a}`);

/**
 * Predicts how much the person will like each recipe they haven't rated yet.
 * Returns nothing until they have rated at least one recipe or the community has rated some.
 */
export function recommend(ratings: Record<string, number>, community: Community | null = null, recipes: readonly Recipe[] = RECIPES): Record<string, Recommendation> {
  const byId = new Map(recipes.map((r) => [r.id, r]));
  const rated = Object.entries(ratings).filter(([id, s]) => byId.has(id) && s >= 1 && s <= 5);
  // the person's usual rating, pulled toward neutral while they've rated only a few
  const mean = (rated.reduce((t, [, s]) => t + s, 0) + NEUTRAL * 2) / (rated.length + 2);
  const pairs = new Map<string, Neighbor>();
  for (const nb of community?.neighbors ?? []) if (Number.isFinite(nb.sim) && nb.n > 0) pairs.set(pairKey(nb.a, nb.b), nb);
  const stats = new Map((community?.stats ?? []).filter((s) => s.n > 0).map((s) => [s.id, s]));

  const out: Record<string, Recommendation> = {};
  for (const r of recipes) {
    if (ratings[r.id]) continue;
    const near: { id: string; sim: number; dev: number; community: number }[] = [];
    for (const [id, stars] of rated) {
      const content = contentSimilarity(r, byId.get(id)!);
      const nb = pairs.get(pairKey(r.id, id));
      const w = nb ? nb.n / (nb.n + COMMUNITY_HALF) : 0;
      const sim = nb ? w * nb.sim + (1 - w) * content * 0.8 : content;
      // only lookalikes count; weak or opposite similarities are mostly noise at this size
      if (sim > 0.12) near.push({ id, sim, dev: Math.max(-1, Math.min(1, (stars - mean) / 2)), community: nb ? w * nb.sim : 0 });
    }
    near.sort((x, y) => y.sim - x.sim);
    const top = near.slice(0, K);
    const simSum = top.reduce((t, x) => t + x.sim, 0);
    // a single weak neighbour shouldn't decide much: the +0.6 shrinks thin evidence toward neutral
    const personal = simSum ? top.reduce((t, x) => t + x.sim * x.dev, 0) / (simSum + 0.6) : 0;
    const st = stats.get(r.id);
    const popular = st ? ((st.avg - NEUTRAL) / 1.5) * (st.n / (st.n + POPULAR_HALF)) : 0;
    const affinity = Math.max(-1, Math.min(1, personal + 0.3 * popular));
    if (!top.length && !st) continue;

    const lead = top.filter((x) => x.dev > 0).sort((x, y) => y.sim * y.dev - x.sim * x.dev)[0];
    const fromCommunity = top.reduce((t, x) => t + x.community * Math.abs(x.dev), 0);
    const fromContent = top.reduce((t, x) => t + (x.sim - x.community) * Math.abs(x.dev), 0);
    const source: Recommendation["source"] = Math.abs(personal) < Math.abs(0.3 * popular) ? "popular" : fromCommunity > fromContent ? "community" : "you";
    out[r.id] = { affinity, match: matchPercent(affinity), ...(lead && affinity > 0 ? { because: lead.id } : {}), source };
  }
  return out;
}

/** Netflix-style "% match" from an affinity: neutral shows as 50%, a sure thing as 99%. */
export function matchPercent(affinity: number): number {
  return Math.max(0, Math.min(99, Math.round(50 + 49 * affinity)));
}

/** The best unrated picks, highest affinity first. Only clear positives make the list. */
export function topPicks(recs: Record<string, Recommendation>, n = 12, ok: (id: string) => boolean = () => true): { id: string; rec: Recommendation }[] {
  return Object.entries(recs)
    .filter(([id, rec]) => rec.affinity >= 0.15 && ok(id))
    .sort(([, a], [, b]) => b.affinity - a.affinity)
    .slice(0, n)
    .map(([id, rec]) => ({ id, rec }));
}

/** Fewest raters behind any community number, so no one person's ratings can be read back out. */
export const MIN_RATERS = 3;

/**
 * The community numbers from raw ratings. The database does the same in recipe_community()
 * (supabase/migrations); this copy keeps the two in step in tests and works offline.
 */
export function communityFromRatings(rows: { user: string; recipe: string; stars: number }[]): Community {
  const byUser = new Map<string, Map<string, number>>();
  for (const r of rows) {
    if (!byUser.has(r.user)) byUser.set(r.user, new Map());
    byUser.get(r.user)!.set(r.recipe, r.stars);
  }
  const acc = new Map<string, { a: string; b: string; dot: number; aa: number; bb: number; n: number }>();
  const tot = new Map<string, { sum: number; n: number }>();
  for (const m of byUser.values()) {
    const mean = [...m.values()].reduce((t, s) => t + s, 0) / m.size;
    const items = [...m.entries()].sort(([x], [y]) => (x < y ? -1 : 1));
    for (const [id, s] of items) { const t = tot.get(id) ?? { sum: 0, n: 0 }; t.sum += s; t.n++; tot.set(id, t); }
    for (let i = 0; i < items.length; i++) for (let j = i + 1; j < items.length; j++) {
      const [a, sa] = items[i]!; const [b, sb] = items[j]!;
      const k = `${a}|${b}`;
      const e = acc.get(k) ?? { a, b, dot: 0, aa: 0, bb: 0, n: 0 };
      e.dot += (sa - mean) * (sb - mean); e.aa += (sa - mean) ** 2; e.bb += (sb - mean) ** 2; e.n++;
      acc.set(k, e);
    }
  }
  const neighbors: Neighbor[] = [];
  for (const e of acc.values()) if (e.n >= MIN_RATERS && e.aa > 0 && e.bb > 0) neighbors.push({ a: e.a, b: e.b, sim: e.dot / Math.sqrt(e.aa * e.bb), n: e.n });
  const stats: RecipeStat[] = [...tot.entries()].filter(([, t]) => t.n >= MIN_RATERS).map(([id, t]) => ({ id, avg: t.sum / t.n, n: t.n }));
  return { neighbors, stats };
}
