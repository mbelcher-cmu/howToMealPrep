"use client";
import { RECIPES_BY_ID } from "@prep-cart/catalog";
import { hardRejection, topPicks, type Recommendation } from "@prep-cart/planner";
import { useApp } from "@/lib/store";
import { useHydrated } from "@/lib/use-planner";
import { useCommunity, useRecommendations } from "@/lib/recommend";
import { Rail, RecipeCard } from "./food";

/** Why a recipe is recommended, in a few words. */
export function whyText(rec: Recommendation): string {
  const liked = rec.because ? RECIPES_BY_ID[rec.because]?.name : undefined;
  if (liked) return `Because you liked ${liked}`;
  return rec.source === "popular" ? "Rated highly by other cooks" : "Popular with people who share your taste";
}

/**
 * "Picked for you": the best recommendations that fit the person's rules, Netflix style. With no
 * ratings yet, and prompt set, it asks for a few instead.
 */
export function PicksRail({ prompt = false }: { prompt?: boolean }) {
  const hydrated = useHydrated();
  const prefs = useApp((s) => s.prefs);
  const { on, recs, rated } = useRecommendations();
  const crowd = useCommunity((s) => !!s.data?.neighbors.length || !!s.data?.stats.length);
  if (!hydrated || !on) return null;
  const picks = topPicks(recs, 12, (id) => { const r = RECIPES_BY_ID[id]; return !!r && !hardRejection(r, prefs); });
  if (!picks.length) {
    if (!prompt) return null;
    return (
      <p className="card mb-5 p-4 text-sm">
        <span className="font-semibold">Get recipes picked for you.</span>{" "}
        <span className="text-muted">{rated ? "Rate a few more recipes" : "Open a recipe you've tried and give it stars"}. The more you rate, the better the picks, and people with similar taste help too.</span>
      </p>
    );
  }
  return (
    <div className="mb-6">
      <Rail title="Picked for you" lead={rated ? `From your ${rated === 1 ? "rating" : `${rated} ratings`}${crowd ? " and what people with similar taste enjoyed" : ""}.` : "What other cooks rate highly. Rate recipes you've tried to make these yours."}>
        {picks.map(({ id, rec }) => (
          <RecipeCard key={id} recipe={RECIPES_BY_ID[id]!} eyebrow={<span className="text-accent">{rec.match}% match</span>}
            footer={<p className="line-clamp-2 text-xs text-muted">{whyText(rec)}</p>} />
        ))}
      </Rail>
    </div>
  );
}

/** On a recipe page: the match for someone who hasn't rated it, and what others thought. */
export function MatchLine({ id }: { id: string }) {
  const { on, recs } = useRecommendations();
  const stat = useCommunity((s) => s.data?.stats.find((x) => x.id === id));
  const mine = useApp((s) => s.ratings[id]);
  if (!on) return null;
  const rec = mine ? undefined : recs[id];
  const showMatch = rec && Math.abs(rec.affinity) >= 0.1;
  if (!showMatch && !stat) return null;
  return (
    <p className="text-sm text-muted">
      {showMatch && <><span className="font-semibold text-accent">{rec.match}% match</span>{rec.affinity > 0 ? ` · ${whyText(rec)}` : ""}</>}
      {showMatch && stat && " · "}
      {stat && <span className="num">★ {stat.avg.toFixed(1)} from {stat.n} cooks</span>}
    </p>
  );
}
