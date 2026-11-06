"use client";
import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, ArrowRight, Check, Search, Shuffle, ShoppingCart, Star, X } from "lucide-react";
import { PREP_PACKS, RECIPES, RECIPES_BY_ID, type MealType } from "@prep-cart/catalog";
import { fitsBreakfastMode, freshBreakfast } from "@/lib/shop-day";
import { buildPriceTable, pickedDay, pickerGoals, pickerRows, searchPicks, servingCost, surprisePick, type PickCard, type PickerInput, type Picks } from "@prep-cart/planner";
import type { Recipe } from "@prep-cart/catalog";
import { RecipeArt } from "@/components/food";
import { periodBudget, useApp } from "@/lib/store";
import { useCommunity, useRecommendations } from "@/lib/recommend";
import { rankingsOf } from "@/lib/use-planner";
import { track } from "@/lib/telemetry";
import { cx, money } from "@/lib/format";

const TITLES: Record<MealType, string> = { breakfast: "Breakfast", main: "Lunch and dinner", snack: "Snacks" };
const NOUN: Record<MealType, [string, string]> = { breakfast: ["breakfast", "breakfasts"], main: ["lunch and dinner", "lunches and dinners"], snack: ["snack", "snacks"] };
const FEATURED = PREP_PACKS.flatMap((p) => [p.breakfast, ...p.mains, p.snack]);

/** The picks already in the plan, by kind of meal, so coming back to the picker starts where you left off. */
function picksFromLocked(locked: string[]): Picks {
  const out: Picks = {};
  for (const id of locked) {
    const r = RECIPES_BY_ID[id];
    if (r) (out[r.mealType] ??= []).push(id);
  }
  return out;
}

/**
 * Choose the week's food Netflix style: one meal at a time from rows of community picks, your
 * favorites and recommendations (or let it surprise you). After each pick the next meal is aimed
 * at what's left of your calories and macros, and every card shows the portion that fits.
 * Breakfast first, then lunch and dinner, then snacks; then it builds your cart.
 */
export function MealPicker({ onDone }: { onDone?: () => void }) {
  const router = useRouter();
  const s = useApp();
  const { recs } = useRecommendations();
  const statsRaw = useCommunity((c) => c.data?.stats);
  const stats = useMemo(() => statsRaw ?? [], [statsRaw]);
  const goalsBase = useMemo(() => pickerGoals(s.targets, s.occasions, s.variety), [s.targets, s.occasions, s.variety]);
  const [counts, setCounts] = useState<Partial<Record<MealType, number>>>(() => Object.fromEntries(goalsBase.map((g) => [g.slot, g.picks])));
  const goals = useMemo(() => goalsBase.map((g) => ({ ...g, picks: counts[g.slot] ?? g.picks })), [goalsBase, counts]);
  const [picks, setPicks] = useState<Picks>(() => {
    const p = picksFromLocked(s.locked);
    for (const g of goalsBase) if ((p[g.slot]?.length ?? 0) > g.picks) p[g.slot] = p[g.slot]!.slice(0, g.picks);
    return p;
  });
  const firstOpen = goals.findIndex((g) => (picks[g.slot]?.length ?? 0) < g.picks);
  const [at, setAt] = useState(firstOpen < 0 ? goals.length : firstOpen);
  const goal = goals[at];
  const affinity = useMemo(() => Object.fromEntries(Object.entries(recs).map(([id, r]) => [id, r.affinity])), [recs]);
  // what one serving costs at the cheapest of the person's stores, and what a meal can cost within budget
  const prices = useMemo(() => buildPriceTable(s.priceOverrides), [s.priceOverrides]);
  const costOf = useMemo(() => {
    const memo = new Map<string, number | null>();
    return (r: Recipe) => {
      if (!memo.has(r.id)) {
        const per = s.stores.map((c) => servingCost(r, prices, [c], new Set())).filter((x) => x > 0 && Number.isFinite(x));
        memo.set(r.id, per.length ? Math.min(...per) : null);
      }
      return memo.get(r.id)!;
    };
  }, [prices, s.stores]);
  const total = periodBudget(s);
  const input: PickerInput | null = goal ? {
    servingCost: costOf, budget: { total, days: s.days },
    goals, picks, slot: goal.slot, prefs: s.prefs, ratings: s.ratings ?? {}, rankings: rankingsOf(s.favorites), affinity, stats, featured: FEATURED, recipes: RECIPES.filter((r) => fitsBreakfastMode(r, freshBreakfast(s.occasions))),
  } : null;
  const rows = useMemo(() => (input ? pickerRows(input) : null), [input?.slot, picks, goals, s.prefs, s.ratings, s.favorites, affinity, stats, costOf, total, s.days]); // eslint-disable-line react-hooks/exhaustive-deps
  const [query, setQuery] = useState("");
  const found = useMemo(() => (input && query.trim() ? searchPicks(input, query) : null), [input?.slot, query, picks, goals, s.prefs, s.ratings, s.favorites, affinity, stats, costOf, total, s.days]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!goals.length) return <p className="card p-4 text-sm text-muted">Mark at least one meal as prepped in Goals to pick recipes.</p>;

  const add = (id: string, how: string) => {
    if (!goal) return;
    const list = [...(picks[goal.slot] ?? []), id];
    const next = { ...picks, [goal.slot]: list };
    setPicks(next);
    track("picker_pick", { slot: goal.slot, how });
    setQuery("");
    if (list.length >= goal.picks) { setAt(at + 1); window.scrollTo({ top: 0, behavior: "smooth" }); }
  };
  const remove = (slot: MealType, id: string) => {
    setPicks({ ...picks, [slot]: (picks[slot] ?? []).filter((x) => x !== id) });
    const i = goals.findIndex((g) => g.slot === slot);
    if (i >= 0 && i < at) setAt(i);
  };
  const surprise = () => { if (!input) return; const c = surprisePick(input); if (c) add(c.id, "surprise"); };
  const setCount = (slot: MealType, n: number) => {
    setCounts({ ...counts, [slot]: n });
    if ((picks[slot]?.length ?? 0) > n) setPicks({ ...picks, [slot]: picks[slot]!.slice(0, n) });
  };
  const finish = () => {
    const ids = goals.flatMap((g) => picks[g.slot] ?? []);
    const variety = { ...s.variety };
    for (const g of goals) variety[g.slot] = Math.max(1, picks[g.slot]?.length ?? g.picks);
    s.set({ pickerDone: true, locked: ids, variety, held: [], prefs: { ...s.prefs, excludeRecipes: (s.prefs.excludeRecipes ?? []).filter((x) => !ids.includes(x)) } });
    track("picker_done", { recipes: ids.length });
    if (onDone) onDone(); else router.push("/groceries/");
  };

  const day = pickedDay(goals, picks, RECIPES_BY_ID);
  const done = !goal;

  return (
    <div className="grid gap-5">
      {/* where you are: one chip per kind of meal */}
      <ol className="flex flex-wrap gap-2" aria-label="Steps">
        {goals.map((g, i) => {
          const n = picks[g.slot]?.length ?? 0;
          return (
            <li key={g.slot}>
              <button type="button" onClick={() => setAt(i)} aria-current={i === at ? "step" : undefined}
                className={cx("inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-sm font-semibold", i === at ? "border-ink bg-ink text-bg" : "border-line bg-surface")}>
                {n >= g.picks && <Check size={14} aria-hidden />}{TITLES[g.slot]} <span className="num opacity-70">{n}/{g.picks}</span>
              </button>
            </li>
          );
        })}
        <li>
          <button type="button" onClick={() => setAt(goals.length)} aria-current={done ? "step" : undefined}
            className={cx("inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-sm font-semibold", done ? "border-ink bg-ink text-bg" : "border-line bg-surface")}>
            <ShoppingCart size={14} aria-hidden /> Cart
          </button>
        </li>
      </ol>

      <DayBar got={day.got} want={day.want} />

      {goal && rows ? (
        <>
          <header className="grid gap-2">
            <div className="flex flex-wrap items-end justify-between gap-3">
              <div>
                <h2 className="font-display text-2xl font-bold">
                  Pick {goal.picks === 1 ? `your ${NOUN[goal.slot][0]}` : `${NOUN[goal.slot][0]} ${(picks[goal.slot]?.length ?? 0) + 1} of ${goal.picks}`}
                </h2>
                <p className="num text-sm text-muted">
                  Aiming for about {Math.round(rows.target.kcal)} kcal and {Math.round(rows.target.protein)}g protein a {goal.slot === "snack" ? "snack" : "meal"}{(picks[goal.slot]?.length || at > 0) ? ", adjusted for what you've picked" : ""}.
                  {rows.budget && (rows.budget.left > 0
                    ? <> You have about {money(rows.budget.left)} left for {rows.budget.mealsLeft} meals, so about {money(rows.budget.perMeal)} for this one.</>
                    : <> Your picks so far use up the budget, so the cheapest fits come first.</>)}
                </p>
              </div>
              <button type="button" className="btn btn-sm" onClick={surprise}><Shuffle size={15} aria-hidden /> Surprise me</button>
            </div>
            <label className="flex items-center gap-2 text-sm text-muted">
              Different {NOUN[goal.slot][1]} this week
              <select className="rounded-md border border-line bg-surface px-2 py-1 text-ink" value={goal.picks} onChange={(e) => setCount(goal.slot, Number(e.target.value))}>
                {[1, 2, 3, 4].map((n) => <option key={n} value={n}>{n}</option>)}
              </select>
            </label>
            <Tray slot={goal.slot} ids={picks[goal.slot] ?? []} onRemove={remove} />
            <div className="relative">
              <Search size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted" aria-hidden />
              <input type="search" className="input rounded-full bg-surface pl-9" placeholder={`Search ${NOUN[goal.slot][1]}`}
                value={query} onChange={(e) => setQuery(e.target.value)} aria-label={`Search ${NOUN[goal.slot][1]}`} />
            </div>
          </header>

          {found ? (
            <section className="min-w-0" aria-label="Search results">
              <h3 className="font-display text-xl font-bold">Results</h3>
              <p className="mb-2 text-sm text-muted" aria-live="polite">
                {found.length ? `${found.length === 1 ? "1 match" : `${found.length} matches`}, best for you first.` : `No ${NOUN[goal.slot][1]} match "${query.trim()}". Try another word.`}
              </p>
              {found.length > 0 && <Cards cards={found} onPick={(id) => add(id, "search")} badge={(c) => <MatchBadge taste={c.taste} />} grid />}
            </section>
          ) : (
            <>
              <Row title="Recommended for you" lead={Object.keys(s.ratings ?? {}).length ? "Best for you first, from your ratings, people with similar taste and what's left of your budget." : "Best for you first, by your macros and what's left of your budget. Rate recipes you've cooked and these get more personal."}
                cards={rows.recommended} onPick={(id) => add(id, "recommended")} badge={(c) => <MatchBadge taste={c.taste} />} />
              {rows.favorites.length > 0 && <Row title="Your favorites" lead="Recipes you rated highly or ranked at setup." cards={rows.favorites} onPick={(id) => add(id, "favorites")} badge={(c) => <Stars id={c.id} />} />}
              <Row title="Community picks" lead={rows.communitySource === "ratings" ? "Most loved by MacroAisle cooks, in the order you're likely to enjoy them." : "Our most popular meal preps while community ratings come in, best for you first."}
                cards={rows.community} onPick={(id) => add(id, "community")} badge={(c) => <CommunityBadge id={c.id} stats={stats} />} />
            </>
          )}

          <div className="flex justify-between">
            <button type="button" className="btn btn-sm" disabled={at === 0} onClick={() => setAt(at - 1)}><ArrowLeft size={15} aria-hidden /> Back</button>
            <button type="button" className="btn btn-sm" onClick={() => setAt(at + 1)}>{(picks[goal.slot]?.length ?? 0) ? "Next" : "Let the planner choose"} <ArrowRight size={15} aria-hidden /></button>
          </div>
        </>
      ) : (
        <section className="grid gap-4" aria-label="Your week">
          <h2 className="font-display text-2xl font-bold">Your week</h2>
          {goals.map((g) => (
            <div key={g.slot} className="grid gap-1.5">
              <p className="label">{TITLES[g.slot]}</p>
              {(picks[g.slot]?.length ?? 0) ? <Tray slot={g.slot} ids={picks[g.slot]!} onRemove={remove} /> : <p className="text-sm text-muted">The planner will choose {g.picks === 1 ? "one" : g.picks} for you.</p>}
            </div>
          ))}
          <p className="text-sm text-muted">Portions are scaled so the week hits your calories and macros. Next, we build your shopping cart.</p>
          <div className="flex flex-wrap gap-2">
            <button type="button" className="btn btn-primary" onClick={finish}><ShoppingCart size={16} aria-hidden /> Build my cart</button>
            <button type="button" className="btn" onClick={() => setAt(0)}>Change picks</button>
          </div>
        </section>
      )}
    </div>
  );
}

function DayBar({ got, want }: { got: { kcal: number; protein: number }; want: { kcal: number; protein: number } }) {
  const pct = Math.min(100, Math.round((got.kcal / Math.max(1, want.kcal)) * 100));
  return (
    <div className="card grid gap-1.5 p-3" role="status">
      <div className="num flex justify-between text-sm">
        <span className="font-semibold">A day of your picks</span>
        <span className="text-muted">{Math.round(got.kcal)} / {Math.round(want.kcal)} kcal · {Math.round(got.protein)} / {Math.round(want.protein)}g protein</span>
      </div>
      <div className="h-2 overflow-hidden rounded-full bg-sunk" aria-hidden><div className="h-full rounded-full bg-accent transition-[width] duration-300" style={{ width: `${pct}%` }} /></div>
    </div>
  );
}

function Tray({ slot, ids, onRemove }: { slot: MealType; ids: string[]; onRemove: (slot: MealType, id: string) => void }) {
  if (!ids.length) return null;
  return (
    <ul className="flex flex-wrap gap-2" aria-label={`Picked ${TITLES[slot].toLowerCase()}`}>
      {ids.map((id) => {
        const r = RECIPES_BY_ID[id];
        if (!r) return null;
        return (
          <li key={id} className="inline-flex items-center gap-2 rounded-full border border-line bg-surface py-1 pl-1 pr-2 text-sm">
            <RecipeArt recipe={r} className="h-7 w-7 rounded-full" badges={false} />
            <span className="max-w-[180px] truncate font-medium">{r.name}</span>
            <button type="button" onClick={() => onRemove(slot, id)} aria-label={`Remove ${r.name}`} className="text-muted hover:text-ink"><X size={14} aria-hidden /></button>
          </li>
        );
      })}
    </ul>
  );
}

function Row({ title, lead, cards, onPick, badge }: { title: string; lead: string; cards: PickCard[]; onPick: (id: string) => void; badge: (c: PickCard) => React.ReactNode }) {
  if (!cards.length) return null;
  return (
    <section className="min-w-0" aria-label={title}>
      <h3 className="font-display text-xl font-bold">{title}</h3>
      <p className="mb-2 text-sm text-muted">{lead}</p>
      <Cards cards={cards} onPick={onPick} badge={badge} label={title} />
    </section>
  );
}

function Cards({ cards, onPick, badge, label, grid }: { cards: PickCard[]; onPick: (id: string) => void; badge: (c: PickCard) => React.ReactNode; label?: string; grid?: boolean }) {
  return (
    <div className={grid ? "grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4" : "rail"} role="group" aria-label={label}>
      {cards.map((c) => {
        const r = RECIPES_BY_ID[c.id]!;
        const p = c.portion;
        return (
          <button key={c.id} type="button" onClick={() => onPick(c.id)} aria-label={`Pick ${r.name}`}
            className={cx("card tap-card press flex shrink-0 flex-col overflow-hidden text-left", grid ? "min-w-0" : "w-[200px] sm:w-[220px]")}>
            <RecipeArt recipe={r} className="art-zoom aspect-[4/3] w-full" badges={false} />
            <span className="flex flex-1 flex-col gap-1 p-3">
              <span className="label truncate">{badge(c)}</span>
              <span className="line-clamp-2 font-display text-[15px] font-bold leading-snug">{r.name}</span>
              <span className="num text-[13px] font-semibold">{Math.round(p.kcal)} kcal · {Math.round(p.protein)}g protein</span>
              <span className="num text-xs text-muted">{p.portion === 1 ? "1 serving" : `${p.portion} servings`} per meal · {Math.round(p.carbs)}g carbs · {Math.round(p.fat)}g fat</span>
              {c.cost != null && <span className="num text-xs font-semibold">About {money(c.cost)} a meal{c.overBudget && <span className="font-normal text-muted"> · over budget</span>}</span>}
            </span>
          </button>
        );
      })}
    </div>
  );
}

function MatchBadge({ taste }: { taste: number }) {
  if (Math.abs(taste) < 0.05) return <span>Fits your macros</span>;
  return <span className="text-accent">{Math.max(1, Math.min(99, Math.round(50 + 49 * taste)))}% match</span>;
}

function Stars({ id }: { id: string }) {
  const stars = useApp((s) => s.ratings?.[id]);
  const place = useApp((s) => rankingsOf(s.favorites)[id]);
  if (stars) return <span className="inline-flex items-center gap-1"><Star size={11} aria-hidden /> You rated {stars}</span>;
  return <span>Your #{place} pick</span>;
}

function CommunityBadge({ id, stats }: { id: string; stats: { id: string; avg: number; n: number }[] }) {
  const s = stats.find((x) => x.id === id);
  if (s && s.n >= 3) return <span>★ {s.avg.toFixed(1)} from {s.n} cooks</span>;
  return <span>Popular meal prep</span>;
}
