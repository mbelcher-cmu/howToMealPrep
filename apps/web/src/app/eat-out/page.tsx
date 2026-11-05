"use client";
import { useEffect, useMemo, useState } from "react";
import { ExternalLink, Plus, X } from "lucide-react";
import { MENU_BY_ID, MENU_ITEMS, menuFit, RESTAURANTS, RESTAURANTS_BY_ID, type MenuItem } from "@prep-cart/catalog";
import { splitTargets } from "@prep-cart/nutrition";
import { useOccasions } from "@/lib/meal-styles";
import { BudgetBar, PlanMacros, PlanStatus, SolvingNote } from "@/components/plan-bits";
import { Card, Chip, PageHeader, SectionTitle, Tag } from "@/components/ui";
import { useApp } from "@/lib/store";
import { useHydrated, usePlanner } from "@/lib/use-planner";
import { cx, isPittsburghZip, money, PITTSBURGH_ONLY } from "@/lib/format";
import { useDays } from "@/lib/days";

const fitLabel = (f: number) => (f < 0.35 ? { text: "Great fit", cls: "pill" } : f < 0.8 ? { text: "Good fit", cls: "pill bg-sunk" } : { text: "Far off", cls: "pill pill-warn" });

export default function EatOut() {
  const { DAY_NAMES, DAY_LONG } = useDays();
  const hydrated = useHydrated();
  const s = useApp();
  const { plan } = usePlanner();
  const [cell, setCell] = useState<{ day: number; occasionId: string } | null>(null);
  const [restaurant, setRestaurant] = useState<string>("");
  const occasions = useOccasions();
  const parts = useMemo(() => splitTargets(s.targets, occasions), [s.targets, occasions]);
  // on a phone the picker sits below the week, so bring it into view
  useEffect(() => { if (cell) document.getElementById("takeout-picker")?.scrollIntoView({ behavior: "smooth", block: "start" }); }, [cell]);

  const vegetarian = s.prefs.diets.some((d) => d === "vegetarian" || d === "vegan");
  const vegan = s.prefs.diets.includes("vegan");
  const glutenFree = s.prefs.diets.includes("glutenFree");
  const occ = cell ? s.occasions.find((o) => o.id === cell.occasionId) : null;
  const target = occ ? parts[s.occasions.indexOf(occ)]! : null;
  const kind = occ ? (occ.kind === "snack" ? "snack" : /breakfast/i.test(occ.name) ? "breakfast" : "main") : null;

  const local = isPittsburghZip(s.profile.zip);
  const restaurants = RESTAURANTS.filter((r) => local || !PITTSBURGH_ONLY.has(r.id));
  const options = useMemo(() => {
    if (!target) return [];
    return MENU_ITEMS
      .filter((m) => (local || !PITTSBURGH_ONLY.has(m.restaurantId)) && (!restaurant || m.restaurantId === restaurant) && (!vegetarian || m.vegetarian) && (!vegan || m.vegan) && (!glutenFree || m.glutenFree))
      .map((m) => ({ m, fit: menuFit(m, target), sameKind: m.mealType === kind }))
      .sort((a, b) => Number(b.sameKind) - Number(a.sameKind) || a.fit - b.fit);
  }, [target, restaurant, vegetarian, vegan, glutenFree, kind, local]);

  if (!hydrated) return null;
  const days = Array.from({ length: s.days }, (_, d) => d);
  const placed = s.eatingOut.filter((e) => e.day < s.days && MENU_BY_ID[e.itemId]);
  const takeoutCost = placed.reduce((a, e) => a + MENU_BY_ID[e.itemId]!.price, 0);
  const at = (day: number, occasionId: string) => placed.find((e) => e.day === day && e.occasionId === occasionId);
  const choose = (m: MenuItem) => { if (cell) { s.setTakeout(cell.day, cell.occasionId, m.id); setCell(null); } };

  return (
    <>
      <PageHeader title="Eat out" lead="Mix takeout into your week. The plan cooks less, keeps you on target, and takes the takeout out of your budget." action={<SolvingNote />} />
      <PlanStatus />
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1fr)_320px]">
        <div className="grid min-w-0 grid-cols-1 content-start gap-4">
          <Card>
            <SectionTitle aside={placed.length > 0 && <button className="btn btn-sm" onClick={() => s.set({ eatingOut: [] })}>Clear all</button>}>Your week</SectionTitle>
            <p className="-mt-1 mb-3 text-sm text-muted">Tap a meal to add takeout.</p>
            {/* phone: one row per day */}
            <ul className="grid gap-2 md:hidden">
              {days.map((d) => (
                <li key={d} className="rounded-lg border border-line p-2.5">
                  <p className="mb-1.5 text-sm font-semibold">{DAY_LONG[d]}</p>
                  <div className="flex flex-wrap gap-2">
                    {s.occasions.map((o) => {
                      const e = at(d, o.id);
                      const item = e ? MENU_BY_ID[e.itemId]! : null;
                      const selected = cell?.day === d && cell.occasionId === o.id;
                      return item ? (
                        <span key={o.id} className="inline-flex min-h-[40px] items-center gap-1 rounded-full bg-warn-soft pl-3 pr-1 text-sm">
                          <span className="max-w-[200px] truncate"><b>{o.name}:</b> {RESTAURANTS_BY_ID[item.restaurantId]?.name}</span>
                          <button className="grid h-8 w-8 place-items-center rounded-full hover:bg-surface" onClick={() => s.setTakeout(d, o.id, null)} aria-label={`Remove takeout on ${DAY_LONG[d]} ${o.name}`}><X size={14} aria-hidden /></button>
                        </span>
                      ) : (
                        <button key={o.id} onClick={() => setCell(selected ? null : { day: d, occasionId: o.id })} aria-pressed={selected}
                          className={cx("inline-flex min-h-[40px] items-center gap-1 rounded-full border border-dashed px-3 text-sm", selected ? "border-accent bg-accent-soft text-ink" : "border-line text-muted")}
                          aria-label={`Add takeout for ${DAY_LONG[d]} ${o.name}`}>
                          <Plus size={14} aria-hidden /> {o.name}
                        </button>
                      );
                    })}
                  </div>
                </li>
              ))}
            </ul>
            <div className="hidden overflow-x-auto md:block">
              <table className="w-full min-w-[560px] table-fixed border-separate border-spacing-1 text-left text-sm">
                <thead>
                  <tr>
                    <th scope="col" className="w-20"><span className="sr-only">Meal</span></th>
                    {days.map((d) => <th key={d} scope="col" className="label text-center">{DAY_NAMES[d]}</th>)}
                  </tr>
                </thead>
                <tbody>
                  {s.occasions.map((o) => (
                    <tr key={o.id}>
                      <th scope="row" className="pr-2 align-top text-xs font-semibold text-muted">{o.name}</th>
                      {days.map((d) => {
                        const e = at(d, o.id);
                        const item = e ? MENU_BY_ID[e.itemId]! : null;
                        const selected = cell?.day === d && cell.occasionId === o.id;
                        return (
                          <td key={d} className="align-top">
                            {item ? (
                              <div className="relative rounded-md bg-warn-soft px-1.5 py-1 pr-6 text-xs leading-snug">
                                <b className="block">{RESTAURANTS_BY_ID[item.restaurantId]?.name}</b>{item.name.split(" (")[0]}
                                <button className="absolute right-0.5 top-0.5 grid h-5 w-5 place-items-center rounded hover:bg-surface" onClick={() => s.setTakeout(d, o.id, null)} aria-label={`Remove takeout on ${DAY_LONG[d]} ${o.name}`}><X size={12} aria-hidden /></button>
                              </div>
                            ) : (
                              <button onClick={() => setCell(selected ? null : { day: d, occasionId: o.id })} aria-pressed={selected}
                                className={cx("grid min-h-[44px] w-full place-items-center rounded-md border border-dashed text-muted hover:bg-sunk", selected ? "border-accent bg-accent-soft text-ink" : "border-line")}
                                aria-label={`Add takeout for ${DAY_LONG[d]} ${o.name}`}>
                                <Plus size={14} aria-hidden />
                              </button>
                            )}
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>

          {cell && occ && target && (
            <Card className="scroll-mt-20" id="takeout-picker">
              <SectionTitle aside={<button className="btn btn-sm" onClick={() => setCell(null)}>Close</button>}>{DAY_LONG[cell.day]} {occ.name.toLowerCase()}</SectionTitle>
              <p className="-mt-1 mb-3 text-sm text-muted">
                This meal's target is <span className="num">{target.kcal} kcal · {target.protein}P · {target.carbs}C · {target.fat}F</span>. Best matches first.
                {(vegetarian || glutenFree) && " Only options that fit your diet are shown."}
              </p>
              <div className="mb-3 flex flex-wrap gap-2">
                <Chip selected={!restaurant} onClick={() => setRestaurant("")}>All</Chip>
                {restaurants.map((r) => <Chip key={r.id} selected={restaurant === r.id} onClick={() => setRestaurant(restaurant === r.id ? "" : r.id)}>{r.name}</Chip>)}
              </div>
              {options.length === 0 ? <p className="text-sm text-muted">Nothing here fits your diet. Try another restaurant.</p> : (
                <ul className="divide-y divide-line">
                  {options.slice(0, 12).map(({ m, fit }) => {
                    const f = fitLabel(fit);
                    return (
                      <li key={m.id}>
                        <button className="flex w-full items-start gap-3 py-2.5 text-left hover:bg-sunk" onClick={() => choose(m)}>
                          <span className="min-w-0 flex-1">
                            <span className="flex flex-wrap items-center gap-2"><span className="font-medium">{m.name}</span><span className={f.cls}>{f.text}</span></span>
                            <span className="mt-0.5 block text-xs text-muted">
                              {RESTAURANTS_BY_ID[m.restaurantId]?.name} · <span className="num">{m.kcal} kcal · <span className="text-protein">{m.protein}P</span> · <span className="text-carbs">{m.carbs}C</span> · <span className="text-fat">{m.fat}F</span></span>
                              {m.estimated && " · nutrition estimated"}
                            </span>
                          </span>
                          <span className="num shrink-0 text-sm font-semibold">{money(m.price)}</span>
                        </button>
                      </li>
                    );
                  })}
                </ul>
              )}
            </Card>
          )}
        </div>

        <aside className="grid content-start gap-4">
          <Card>
            <SectionTitle>This week</SectionTitle>
            <p className="mb-3 text-sm text-muted">{placed.length ? `${placed.length} takeout meal${placed.length === 1 ? "" : "s"}, about ${money(takeoutCost)}.` : "No takeout yet."}</p>
            {plan && <BudgetBar cost={plan.result.cost} budget={plan.result.budget} takeout={plan.result.takeout?.cost ?? 0} />}
          </Card>
          {plan && placed.length > 0 && (
            <Card>
              <SectionTitle>Average day, all food</SectionTitle>
              <PlanMacros result={plan.result} />
            </Card>
          )}
          <Card>
            <SectionTitle>About these numbers</SectionTitle>
            <p className="text-xs text-muted">Nutrition follows each chain's published values for the standard build, with calories worked out from the macros. Prices are typical US estimates before tax and tip. Check the chain's own calculator for your exact order:</p>
            <ul className="mt-2 grid gap-1 text-xs">
              {restaurants.map((r) => (
                <li key={r.id}><a href={r.url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 underline">{r.name} <ExternalLink size={11} aria-hidden /></a> <span className="text-muted">· {r.note}</span></li>
              ))}
            </ul>
          </Card>
          <p className="px-1 text-xs text-muted"><Tag>Tip</Tag> Takeout replaces a prepped meal, so the plan cooks fewer portions and balances the rest of the week around it.</p>
        </aside>
      </div>
    </>
  );
}
