"use client";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { ArrowRight, Check, Loader2, PackageOpen, RefreshCw, Shuffle } from "lucide-react";
import { CUISINES, INGREDIENTS, MOODS, RECIPES_BY_ID } from "@prep-cart/catalog";
import { RecipeArt, RecipeCard, ItemArt } from "@/components/food";
import { Chip, EmptyState, PageHeader, Segmented, Toggle } from "@/components/ui";
import { daysUntil, isoDay, shoppedShare, useApp } from "@/lib/store";
import { useHydrated, usePlanner } from "@/lib/use-planner";
import { dayLabel, useWeek } from "@/lib/use-week";
import { menuChange, nextWeekChoices } from "@/lib/week";
import { cx, isPittsburghZip, plural, recipeHref } from "@/lib/format";
import { useFlag } from "@/lib/flags";

type Choice = "keep" | "swap";
type Done = { before: string[]; fromId: string | undefined };

/**
 * End-of-week review: look back at this week's recipes, keep the ones worth repeating, swap the rest,
 * pick a mood, and carry the leftovers over. One button builds the new week.
 */
export default function NextWeekPage() {
  const hydrated = useHydrated();
  const on = useFlag("nextWeek");
  const s = useApp();
  const { plan, status, replan, tryAnother } = usePlanner();
  const w = useWeek();
  const [done, setDone] = useState<Done | null>(null);

  // freeze the list we review, so a background re-plan can't shuffle it while the person decides
  const [reviewed, setReviewed] = useState<string[] | null>(null);
  useEffect(() => {
    if (!reviewed && plan) setReviewed([...new Set(plan.result.recipes.map((p) => p.recipe.id))].filter((id) => RECIPES_BY_ID[id]));
  }, [plan, reviewed]);

  const [choice, setChoice] = useState<Record<string, Choice>>({});
  const pick = (id: string): Choice => choice[id] ?? (s.locked.includes(id) ? "keep" : "swap");

  const alreadyShopped = !!plan && s.shoppedPlanId === plan.id;
  const [shopped, setShopped] = useState<boolean | null>(null);
  const bought = shopped ?? (alreadyShopped || shoppedShare(s) >= 0.5);

  // cuisines and moods are picked here and applied on build, so this week's plan stays put until then
  const [wants, setWants] = useState<Record<string, boolean> | null>(null);
  const local = isPittsburghZip(s.profile.zip);
  const moodOptions = useMemo(() => [
    ...Object.entries(MOODS).map(([k, label]) => ({ group: "moods" as const, k, label })),
    ...Object.entries(CUISINES).filter(([k]) => k !== "pittsburgh" || local).map(([k, label]) => ({ group: "cuisines" as const, k, label })),
  ], [local]);
  const wishOf = (g: "moods" | "cuisines", k: string) => (s.prefs[g] as Record<string, string | undefined>)[k];
  const isWanted = (g: "moods" | "cuisines", k: string) => wants?.[`${g}:${k}`] ?? (wishOf(g, k) === "nice" || wishOf(g, k) === "must");
  const [moreMoods, setMoreMoods] = useState(false);

  if (!hydrated) return null;
  if (!on) {
    return (
      <>
        <PageHeader title="Next week" />
        <EmptyState title="Coming soon">Planning next week from here is still being tested. <Link className="underline" href="/plan/">Open Plan</Link> to change your food.</EmptyState>
      </>
    );
  }
  if (!plan || !reviewed) {
    return (
      <>
        <PageHeader title="Next week" />
        <EmptyState title={status === "solving" ? "Building your plan" : "No plan yet"}>{status === "solving" ? "This takes a few seconds." : <Link className="underline" href="/plan/">Open Plan to build one.</Link>}</EmptyState>
      </>
    );
  }

  const startsOn = w.plansFrom;
  const startsToday = startsOn <= isoDay();
  const keepCount = reviewed.filter((id) => pick(id) === "keep").length;
  const swapCount = reviewed.length - keepCount;

  // what the pantry carries into next week
  const pantryNow = s.pantry.filter((p) => p.grams !== Infinity && (!p.useBy || daysUntil(p.useBy) >= 0));
  const leftovers = !alreadyShopped && bought ? plan.result.cart.filter((l) => l.leftoverGrams > 0) : [];
  const carry = [...new Set([...pantryNow.map((p) => p.ingredientId), ...leftovers.map((l) => l.ingredientId)])].filter((id) => INGREDIENTS[id]);

  const build = () => {
    const { locked, resting } = nextWeekChoices(reviewed, new Set(reviewed.filter((id) => pick(id) === "keep")));
    // locks the person set on recipes outside this week's menu stay as they are
    const otherLocks = s.locked.filter((id) => !reviewed.includes(id));
    if (wants) for (const [key, want] of Object.entries(wants)) {
      const [g, k] = key.split(":") as ["moods" | "cuisines", string];
      const cur = (useApp.getState().prefs[g] as Record<string, string | undefined>)[k];
      if (want && !cur) s.setWish(g, k, "nice");
      if (!want && (cur === "nice" || cur === "must")) s.setWish(g, k, null);
    }
    setDone({ before: reviewed, fromId: plan.id });
    s.startNextWeek({ startsOn, locked: [...otherLocks, ...locked], resting, shopped: bought && !alreadyShopped });
    replan();
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  if (done) {
    const ready = status !== "solving" && plan.id !== done.fromId;
    const after = [...new Set(plan.result.recipes.map((p) => p.recipe.id))];
    const diff = menuChange(done.before, after);
    return (
      <>
        <PageHeader eyebrow={`${startsToday ? "This week" : "Next week"} · from ${dayLabel(startsOn)}`} title={ready ? "Your new week" : "Building your week"}
          lead={ready ? `${plural(diff.added.length, "new recipe")}${diff.kept.length ? ` and ${diff.kept.length} you kept` : ""}. Your shopping list is updated.` : "Finding new recipes that hit your macros within budget."} />
        {!ready ? (
          <div className="card grid place-items-center gap-3 p-10 text-center text-muted" role="status">
            <Loader2 size={24} className="animate-spin" aria-hidden />
            <p className="text-sm">This takes a few seconds.</p>
          </div>
        ) : (
          <div className="grid min-w-0 grid-cols-1 gap-7">
            {diff.added.length > 0 && (
              <section className="min-w-0" aria-label="New this week">
                <h2 className="mb-2 font-display text-xl font-bold">New on the menu</h2>
                <div className="rail">
                  {diff.added.map((id) => RECIPES_BY_ID[id] && <RecipeCard key={id} recipe={RECIPES_BY_ID[id]!} eyebrow="New" />)}
                </div>
              </section>
            )}
            {(diff.kept.length > 0 || diff.dropped.length > 0) && (
              <section className="card divide-y divide-line" aria-label="What changed">
                {diff.kept.map((id) => <ChangeRow key={id} id={id} note="Kept" />)}
                {diff.dropped.map((id) => <ChangeRow key={id} id={id} note="Off the menu" muted />)}
              </section>
            )}
            {diff.added.length === 0 && (
              <p className="card p-4 text-sm text-muted">No other recipes fit your rules and budget, so the menu stayed the same. Loosen a diet or dislike, or raise the budget, in <Link href="/plan/" className="underline">Plan</Link>.</p>
            )}
            <div className="grid gap-2 sm:flex">
              <Link href="/groceries/" className="btn btn-primary">Shopping list <ArrowRight size={16} aria-hidden /></Link>
              <Link href="/plan/" className="btn">See the whole week</Link>
              <button className="btn" onClick={tryAnother}><Shuffle size={16} aria-hidden /> Different picks</button>
            </div>
          </div>
        )}
      </>
    );
  }

  return (
    <>
      <PageHeader eyebrow={`${startsToday ? "This week" : "Next week"} · from ${dayLabel(startsOn)}`} title={startsToday ? "Plan this week" : "Plan next week"}
        lead="Keep what you liked and swap the rest for something new. Your pantry carries over." />

      <div className="grid min-w-0 grid-cols-1 gap-7 pb-28 md:pb-4">
        <section aria-labelledby="nw-food">
          <div className="mb-2 flex items-end justify-between gap-3">
            <div>
              <h2 id="nw-food" className="font-display text-xl font-bold">{startsToday ? "Last week's food" : "This week's food"}</h2>
              <p className="text-sm text-muted">Swapped recipes sit out one week.</p>
            </div>
            <button type="button" className="shrink-0 text-sm font-semibold text-accent hover:underline"
              onClick={() => setChoice(Object.fromEntries(reviewed.map((id) => [id, swapCount === 0 ? "swap" : "keep"])))}>
              {swapCount === 0 ? "Swap all" : "Keep all"}
            </button>
          </div>
          <ul className="card divide-y divide-line">
            {reviewed.map((id) => {
              const r = RECIPES_BY_ID[id]!;
              const p = plan.result.recipes.find((x) => x.recipe.id === id);
              const keep = pick(id) === "keep";
              return (
                <li key={id} className="flex items-center gap-3 px-3 py-3">
                  <RecipeArt recipe={r} badges={false} className={cx("h-14 w-14 shrink-0 rounded-xl transition-opacity", !keep && "opacity-60")} />
                  <span className="min-w-0 flex-1">
                    <Link href={recipeHref(id)} className="line-clamp-2 font-semibold leading-snug hover:underline">{r.name}</Link>
                    <span className="block text-xs text-muted">{p ? `${plural(p.meals, "meal")} · ${p.slot === "main" ? "lunch or dinner" : p.slot}` : "Locked in"}</span>
                  </span>
                  <div className="w-[124px] shrink-0 sm:w-[168px]">
                    <Segmented size="sm" label={`${r.name} next week`} value={pick(id)} onChange={(v) => setChoice({ ...choice, [id]: v })}
                      options={[{ value: "keep", label: "Keep" }, { value: "swap", label: "Swap" }]} />
                  </div>
                </li>
              );
            })}
          </ul>
        </section>

        <section aria-labelledby="nw-mood">
          <h2 id="nw-mood" className="font-display text-xl font-bold">In the mood for</h2>
          <p className="mb-2 text-sm text-muted">Optional. New picks lean toward what you choose.</p>
          <div className="flex flex-wrap gap-2">
            {(moreMoods ? moodOptions : moodOptions.filter((o, i) => i < 10 || isWanted(o.group, o.k))).map((o) => (
              <Chip key={`${o.group}:${o.k}`} selected={isWanted(o.group, o.k)} onClick={() => setWants({ ...(wants ?? {}), [`${o.group}:${o.k}`]: !isWanted(o.group, o.k) })}>{o.label}</Chip>
            ))}
            {!moreMoods && <button type="button" className="min-h-[36px] px-2 text-sm font-semibold text-accent" onClick={() => setMoreMoods(true)}>More cuisines</button>}
          </div>
        </section>

        <section aria-labelledby="nw-pantry">
          <h2 id="nw-pantry" className="font-display text-xl font-bold">Carrying over</h2>
          <div className="card mt-2 grid gap-3 p-4">
            {!alreadyShopped && (
              <Toggle checked={bought} onChange={setShopped} label="I bought this week's groceries" detail="What's left of each package moves to your pantry, and next week uses it first." />
            )}
            {carry.length ? (
              <>
                <p className="text-sm text-muted">{plural(carry.length, "item")} from your pantry go into next week's plan first, so you buy less.</p>
                <ul className="flex flex-wrap gap-2">
                  {carry.slice(0, 12).map((id) => (
                    <li key={id} className="inline-flex items-center gap-2 rounded-full bg-sunk py-1 pl-1 pr-3 text-[13px]">
                      <ItemArt ingredientId={id} size={24} className="rounded-full" /> {INGREDIENTS[id]!.name}
                    </li>
                  ))}
                  {carry.length > 12 && <li className="self-center text-[13px] text-muted">and {carry.length - 12} more</li>}
                </ul>
              </>
            ) : (
              <p className="inline-flex items-center gap-2 text-sm text-muted"><PackageOpen size={16} aria-hidden /> Nothing left over to carry. Staples like oil and spices are always counted.</p>
            )}
          </div>
        </section>
      </div>

      {/* the one action, pinned above the tab bar on phones */}
      <div className="fixed inset-x-0 bottom-[calc(env(safe-area-inset-bottom,0px)+76px)] z-20 px-4 md:static md:mt-2 md:px-0">
        <div className="card mx-auto flex max-w-[560px] items-center gap-3 p-2 pl-4 shadow-lg md:max-w-none md:shadow-none">
          <p className="min-w-0 flex-1 text-sm">
            <span className="font-semibold">{swapCount ? `${swapCount} new` : "Same menu"}</span>
            <span className="text-muted">{keepCount ? ` · ${keepCount} kept` : ""}</span>
          </p>
          <button className="btn btn-primary" onClick={build} disabled={status === "solving"}>
            {status === "solving" ? <RefreshCw size={16} className="animate-spin" aria-hidden /> : <Check size={16} aria-hidden />} Build {startsToday ? "this week" : "next week"}
          </button>
        </div>
      </div>
    </>
  );
}

function ChangeRow({ id, note, muted }: { id: string; note: string; muted?: boolean }) {
  const r = RECIPES_BY_ID[id];
  if (!r) return null;
  return (
    <div className="flex items-center gap-3 px-3 py-2.5">
      <RecipeArt recipe={r} badges={false} className={cx("h-10 w-10 shrink-0 rounded-lg", muted && "opacity-50 grayscale")} />
      <span className={cx("min-w-0 flex-1 truncate text-sm font-semibold", muted && "text-muted line-through decoration-1")}>{r.name}</span>
      <span className="label shrink-0">{note}</span>
    </div>
  );
}
