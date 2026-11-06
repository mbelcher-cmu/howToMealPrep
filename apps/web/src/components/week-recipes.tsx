"use client";
import Link from "next/link";
import { Lock, LockOpen, Shuffle, X } from "lucide-react";
import { MENU_BY_ID, RECIPES_BY_ID, RESTAURANTS_BY_ID } from "@prep-cart/catalog";
import { LockedTag, PerServing, RecipeMeta, RecipeTile } from "@/components/plan-bits";
import { Card, SectionTitle, Tag } from "@/components/ui";
import { SwapButton } from "@/components/swap";
import { useApp } from "@/lib/store";
import { usePlanner } from "@/lib/use-planner";
import { cx, fmtServings, recipeHref } from "@/lib/format";
import { useDays } from "@/lib/days";
import { useFlag } from "@/lib/flags";

/** Phone layout of the week: days with the same food are grouped ("Mon to Wed"), so a rotation reads at a glance. */
function WeekList() {
  const { DAY_NAMES } = useDays();
  const { plan } = usePlanner();
  const occasions = useApp((s) => s.occasions);
  if (!plan) return null;
  const rows = plan.schedule.days.map((d) => ({
    day: d.day,
    items: occasions.map((o) => {
      const out = d.takeout?.find((x) => x.occasionId === o.id);
      const item = out ? MENU_BY_ID[out.itemId] : null;
      if (item) return { occ: o.name, text: `${RESTAURANTS_BY_ID[item.restaurantId]?.name ?? "Takeout"}: ${item.name.split(" (")[0]}`, href: "/eat-out/", kind: "out" as const };
      const m = d.meals.find((x) => x.occasionId === o.id);
      const r = m ? RECIPES_BY_ID[m.recipeId] : null;
      return r ? { occ: o.name, text: r.name, href: recipeHref(r.id), kind: "prep" as const } : { occ: o.name, text: o.prepped ? "—" : "Free", href: null, kind: "free" as const };
    }),
  }));
  const groups: { from: number; to: number; items: (typeof rows)[number]["items"] }[] = [];
  for (const r of rows) {
    const last = groups[groups.length - 1];
    if (last && JSON.stringify(last.items) === JSON.stringify(r.items)) last.to = r.day;
    else groups.push({ from: r.day, to: r.day, items: r.items });
  }
  return (
    <ol className="grid gap-3 sm:hidden">
      {groups.map((g) => (
        <li key={g.from} className="rounded-lg bg-sunk/60 p-3">
          <p className="label">{g.from === g.to ? DAY_NAMES[g.from] : `${DAY_NAMES[g.from]} to ${DAY_NAMES[g.to]}`}</p>
          <dl className="mt-1.5 grid grid-cols-[5.5rem_minmax(0,1fr)] gap-x-2 gap-y-1 text-sm">
            {g.items.map((it) => (
              <div key={it.occ} className="contents">
                <dt className="text-xs leading-5 text-muted">{it.occ}</dt>
                <dd className={cx("min-w-0", it.kind === "free" && "text-muted", it.kind === "out" && "text-warn")}>
                  {it.href ? <Link href={it.href} className="hover:underline">{it.text}</Link> : it.text}
                </dd>
              </div>
            ))}
          </dl>
        </li>
      ))}
    </ol>
  );
}

/** This week's recipes with keep, swap and skip. Shown on Meals (simple mode) and Plan. */
export function WeekRecipes({ title = "Recipes this week" }: { title?: string }) {
  const { plan, status, tryAnother } = usePlanner();
  const s = useApp();
  const simple = useFlag("simple");
  if (!plan) return null;
  const excluded = s.prefs.excludeRecipes ?? [];
  return (
  <Card>
    <SectionTitle aside={<button className="btn btn-sm" onClick={tryAnother} disabled={status === "solving"}><Shuffle size={14} aria-hidden /> Try another plan</button>}>
      {title}
    </SectionTitle>
    <ul className="grid gap-3">
      {plan.result.recipes.map((p) => {
        const locked = s.locked.includes(p.recipe.id);
        return (
          <li key={p.recipe.id} className="rounded-lg border border-line p-3">
            <div className="flex flex-wrap items-start gap-3">
              <RecipeTile recipe={p.recipe} />
              <div className="min-w-0 flex-1 basis-[180px]">
                <div className="flex flex-wrap items-center gap-2">
                  <Tag>{p.slot}</Tag>
                  {p.household && !p.household.mine && <Tag>Just for {p.household.eaters.map((e) => e.name).join(" and ")}</Tag>}
                  {locked && <LockedTag />}
                </div>
                <Link href={recipeHref(p.recipe.id)} className="mt-0.5 block font-semibold hover:underline">{p.recipe.name}</Link>
                <div className="text-sm">
                  {p.meals > 0
                    ? <>{p.meals} meal{p.meals === 1 ? "" : "s"} · {fmtServings(p.portion)} {(plan.result.household?.members.length ?? 0) > 0 ? "a meal for you" : "each"} · <PerServing recipe={p.recipe} portion={p.portion} /></>
                    : <>Not for you this week · {fmtServings(p.servings)} to cook</>}
                </div>
                {p.household && p.household.eaters.length > 0 && (
                  <p className="text-xs text-muted">{p.household.mine ? "Also for " : "For "}{p.household.eaters.map((e) => `${e.name} (${e.meals} meal${e.meals === 1 ? "" : "s"}, ${fmtServings(e.portion)} each)`).join(", ")}</p>
                )}
                {!simple && <RecipeMeta recipe={p.recipe} />}
                {!simple && p.reasons.length > 0 && <p className="mt-1 text-xs text-muted">Why: {p.reasons.join(" · ")}</p>}
              </div>
              {/* phone: a labeled row under the recipe; wider screens: a column on the right */}
              <div className="flex w-full shrink-0 gap-1.5 sm:w-auto sm:flex-col">
                <button className="btn btn-sm" onClick={() => s.toggleLock(p.recipe.id)} aria-pressed={locked} aria-label={locked ? `Unlock ${p.recipe.name}` : `Keep ${p.recipe.name}`}>
                  {locked ? <Lock size={14} aria-hidden /> : <LockOpen size={14} aria-hidden />}<span>{locked ? "Locked" : "Keep"}</span>
                </button>
                <SwapButton recipeId={p.recipe.id} label="always" />
                <button className="btn btn-sm" onClick={() => s.skipRecipe(p.recipe.id)} aria-label={`Skip ${p.recipe.name} this week`}>
                  <X size={14} aria-hidden /><span>Skip</span>
                </button>
              </div>
            </div>
          </li>
        );
      })}
    </ul>
    {excluded.length > 0 && (
      <div className="mt-3 flex flex-wrap items-center gap-2 text-xs text-muted">
        Skipped: {excluded.map((id) => RECIPES_BY_ID[id]?.name ?? id).join(", ")}
        <button className="underline" onClick={() => s.set({ prefs: { ...s.prefs, excludeRecipes: [] } })}>Bring back</button>
      </div>
    )}
  </Card>

  );
}

/** The week as a table (wider screens) or grouped days (phones). */
export function WeekGlance() {
  const { DAY_NAMES } = useDays();
  const simple = useFlag("simple");
  const { plan } = usePlanner();
  const s = useApp();
  if (!plan) return null;
  return (
  <Card>
    <SectionTitle>Week at a glance</SectionTitle>
    <WeekList />
    <div className="hidden overflow-x-auto sm:block">
      <table className="w-full min-w-[560px] border-separate border-spacing-1 text-left text-sm">
        <thead>
          <tr>
            <th className="label w-24 font-semibold" scope="col"><span className="sr-only">Meal</span></th>
            {plan.schedule.days.map((d) => <th key={d.day} scope="col" className="label text-center">{DAY_NAMES[d.day]}</th>)}
          </tr>
        </thead>
        <tbody>
          {s.occasions.map((o) => (
            <tr key={o.id}>
              <th scope="row" className="pr-2 align-top text-xs font-semibold text-muted">{o.name}</th>
              {plan.schedule.days.map((d) => {
                const m = d.meals.find((x) => x.occasionId === o.id);
                const r = m ? RECIPES_BY_ID[m.recipeId] : null;
                const out = d.takeout?.find((x) => x.occasionId === o.id);
                const item = out ? MENU_BY_ID[out.itemId] : null;
                if (item) return (
                  <td key={d.day} className="rounded-md bg-warn-soft px-1.5 py-1 align-top text-xs leading-snug">
                    <Link href="/eat-out/" className="hover:underline"><b className="block font-semibold">{RESTAURANTS_BY_ID[item.restaurantId]?.name}</b>{item.name.split(" (")[0]}</Link>
                  </td>
                );
                return (
                  <td key={d.day} className={cx("rounded-md px-1.5 py-1 align-top text-xs leading-snug", r ? "bg-accent-soft" : "bg-sunk text-muted")}>
                    {r ? <Link href={recipeHref(r.id)} className="hover:underline">{r.name}</Link> : o.prepped ? "—" : "Free"}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
    {(s.occasions.some((o) => !o.prepped) || !simple) && <p className="mt-2 text-xs text-muted">"Free" meals aren't prepped. Their calories are left open for eating out or cooking fresh. {!simple && <><Link href="/eat-out/" className="underline">Add takeout</Link> to any meal and the plan cooks around it.</>}</p>}
  </Card>
  );
}
