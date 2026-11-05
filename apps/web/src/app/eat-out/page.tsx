"use client";
import { useEffect, useMemo, useState } from "react";
import { ExternalLink, LocateFixed, MapPin, Plus, Search, Sparkles, X } from "lucide-react";
import { MENU_BY_ID, MENU_ITEMS, menuFit, RESTAURANTS, RESTAURANTS_BY_ID, type MealType, type MenuItem } from "@prep-cart/catalog";
import { splitTargets } from "@prep-cart/nutrition";
import { useOccasions } from "@/lib/meal-styles";
import { cookedMealCost, suggestTakeout } from "@prep-cart/planner";
import { BudgetBar, PlanMacros, PlanStatus, SolvingNote } from "@/components/plan-bits";
import { Card, Chip, NumberField, PageHeader, Segmented, SectionTitle, Stepper, Tag, Toggle } from "@/components/ui";
import { useFlag } from "@/lib/flags";
import { currentPosition, pointForZip, restaurantsNear } from "@/lib/nearby";
import { track } from "@/lib/telemetry";
import { useApp } from "@/lib/store";
import { useHydrated, usePlanner } from "@/lib/use-planner";
import { cx, isPittsburghZip, money, PITTSBURGH_ONLY } from "@/lib/format";
import { useDays } from "@/lib/days";

type Sort = "fit" | "price" | "protein";
type Occ = { id: string; name: string; kind: string };
const kindOf = (o: Occ): MealType => (o.kind === "snack" ? "snack" : /breakfast/i.test(o.name) ? "breakfast" : "main");

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
  const plus = useFlag("eatOutPlus");
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<Sort>("fit");
  const [nearOnly, setNearOnly] = useState(false);
  const [once, setOnce] = useState(false);
  // on a phone the picker sits below the week, so bring it into view
  useEffect(() => { if (cell) document.getElementById("takeout-picker")?.scrollIntoView({ behavior: "smooth", block: "start" }); }, [cell]);

  const vegetarian = s.prefs.diets.some((d) => d === "vegetarian" || d === "vegan");
  const vegan = s.prefs.diets.includes("vegan");
  const glutenFree = s.prefs.diets.includes("glutenFree");
  const occ = cell ? s.occasions.find((o) => o.id === cell.occasionId) : null;
  const target = occ ? parts[s.occasions.indexOf(occ)]! : null;
  const kind = occ ? kindOf(occ) : null;
  const near = s.nearbyRestaurants?.miles ?? null;
  const nearOn = plus && nearOnly && !!near && Object.keys(near).length > 0;
  const q = plus ? query.trim().toLowerCase() : "";

  const local = isPittsburghZip(s.profile.zip);
  const restaurants = RESTAURANTS.filter((r) => local || !PITTSBURGH_ONLY.has(r.id));
  const options = useMemo(() => {
    if (!target) return [];
    return MENU_ITEMS
      .filter((m) => (local || !PITTSBURGH_ONLY.has(m.restaurantId)) && (!restaurant || m.restaurantId === restaurant) && (!vegetarian || m.vegetarian) && (!vegan || m.vegan) && (!glutenFree || m.glutenFree))
      .filter((m) => !nearOn || near![m.restaurantId] != null)
      .filter((m) => !q || `${m.name} ${RESTAURANTS_BY_ID[m.restaurantId]?.name ?? ""}`.toLowerCase().includes(q))
      .map((m) => ({ m, fit: menuFit(m, target), sameKind: m.mealType === kind }))
      .sort((a, b) => Number(b.sameKind) - Number(a.sameKind)
        || (sort === "price" ? a.m.price - b.m.price : sort === "protein" ? b.m.protein / b.m.price - a.m.protein / a.m.price : 0)
        || a.fit - b.fit);
  }, [target, restaurant, vegetarian, vegan, glutenFree, kind, local, nearOn, near, q, sort]);

  if (!hydrated) return null;
  const days = Array.from({ length: s.days }, (_, d) => d);
  const placed = s.eatingOut.filter((e) => e.day < s.days && MENU_BY_ID[e.itemId]);
  const takeoutCost = placed.reduce((a, e) => a + MENU_BY_ID[e.itemId]!.price, 0);
  const at = (day: number, occasionId: string) => placed.find((e) => e.day === day && e.occasionId === occasionId);
  const choose = (m: MenuItem) => { if (cell) { s.setTakeout(cell.day, cell.occasionId, m.id, plus && once); setCell(null); } };
  const cooked = plan ? cookedMealCost(plan.result) : 0;
  const vsCooking = (price: number) => {
    if (!cooked) return null;
    const d = price - cooked;
    return Math.abs(d) < 0.5 ? "about what cooking costs" : d > 0 ? `${money(d)} more than cooking` : `${money(-d)} less than cooking`;
  };
  const dietOk = (m: MenuItem) => (local || !PITTSBURGH_ONLY.has(m.restaurantId)) && (!vegetarian || m.vegetarian) && (!vegan || m.vegan) && (!glutenFree || m.glutenFree);

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
                                {plus && e?.once && <span className="mt-0.5 block text-[11px] text-muted">This week only</span>}
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
              {plus && (
                <div className="mb-3 grid gap-2">
                  <div className="relative">
                    <Search size={16} aria-hidden className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted" />
                    <input type="search" className="input w-full pl-9" placeholder="Search dishes or chains" aria-label="Search takeout" value={query} onChange={(e) => setQuery(e.target.value)} />
                  </div>
                  <Segmented size="sm" label="Sort takeout" value={sort} onChange={setSort} options={[{ value: "fit", label: "Best fit" }, { value: "price", label: "Cheapest" }, { value: "protein", label: "Protein per $" }]} />
                  <Toggle checked={once} onChange={setOnce} label="Just this week" detail="Otherwise this takeout repeats every week until you remove it." />
                </div>
              )}
              <div className="mb-3 flex flex-wrap gap-2">
                <Chip selected={!restaurant} onClick={() => setRestaurant("")}>All</Chip>
                {plus && near && Object.keys(near).length > 0 && <Chip selected={nearOnly} onClick={() => setNearOnly(!nearOnly)}>Near me</Chip>}
                {restaurants.filter((r) => !nearOn || near![r.id] != null).map((r) => <Chip key={r.id} selected={restaurant === r.id} onClick={() => setRestaurant(restaurant === r.id ? "" : r.id)}>{r.name}</Chip>)}
              </div>
              {options.length === 0 ? <p className="text-sm text-muted">{q ? "Nothing matches that search." : "Nothing here fits your diet. Try another restaurant."}</p> : (
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
                              {plus && near?.[m.restaurantId] != null && ` · ${near[m.restaurantId]} mi`}
                            </span>
                            {plus && vsCooking(m.price) && <span className="mt-0.5 block text-xs text-muted">{vsCooking(m.price)}</span>}
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
          {plus && <AutoPlan parts={parts} dietOk={dietOk} nearOnly={nearOn} />}
          <Card>
            <SectionTitle>This week</SectionTitle>
            <p className="mb-3 text-sm text-muted">{placed.length ? `${placed.length} takeout meal${placed.length === 1 ? "" : "s"}, about ${money(takeoutCost)}.` : "No takeout yet."}</p>
            {plus && placed.length > 0 && cooked > 0 && (
              <p className="mb-3 text-sm">Cooking those meals instead would cost about <b className="num">{money(cooked * placed.length)}</b>, so eating out adds <b className="num">{money(Math.max(0, takeoutCost - cooked * placed.length))}</b>.</p>
            )}
            {plan && <BudgetBar cost={plan.result.cost} budget={plan.result.budget} takeout={plan.result.takeout?.cost ?? 0} />}
          </Card>
          {plan && placed.length > 0 && (
            <Card>
              <SectionTitle>Average day, all food</SectionTitle>
              <PlanMacros result={plan.result} />
            </Card>
          )}
          {plus && <NearMe />}
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

/** "Plan takeout for me": how many meals, which meals, and a spending cap; the app picks. */
function AutoPlan({ parts, dietOk, nearOnly }: { parts: { kcal: number; protein: number; carbs: number; fat: number }[]; dietOk: (m: MenuItem) => boolean; nearOnly: boolean }) {
  const s = useApp();
  const mains = s.occasions.filter((o) => o.kind !== "snack");
  const [count, setCount] = useState(2);
  const [which, setWhich] = useState<string>(() => mains.find((o) => /dinner/i.test(o.name))?.id ?? mains[mains.length - 1]?.id ?? "");
  const [cap, setCap] = useState(30);
  const [note, setNote] = useState("");
  const near = s.nearbyRestaurants?.miles;
  const plan = () => {
    const chosen = which === "any" ? mains : mains.filter((o) => o.id === which);
    const slots = chosen.map((o) => ({ occasionId: o.id, kind: kindOf(o), target: parts[s.occasions.indexOf(o)]! }));
    const items = MENU_ITEMS.filter((m) => dietOk(m) && (!nearOnly || near?.[m.restaurantId] != null));
    const taken = s.eatingOut.filter((e) => e.day < s.days);
    const r = suggestTakeout({ days: s.days, slots, count, maxSpend: cap, items, taken });
    if (r.meals.length) s.set({ eatingOut: [...s.eatingOut, ...r.meals.map((e) => ({ ...e, once: true }))] });
    track("takeout_autoplan", { asked: count, placed: r.meals.length });
    setNote(r.meals.length === 0
      ? "Nothing fits that budget. Raise it or pick fewer meals."
      : `Added ${r.meals.length} takeout meal${r.meals.length === 1 ? "" : "s"} for about ${money(r.cost)}, just for this week.${r.short ? ` ${r.short} more didn't fit the budget.` : ""}`);
  };
  if (!mains.length) return null;
  return (
    <Card>
      <SectionTitle>Plan takeout for me</SectionTitle>
      <p className="-mt-1 mb-3 text-sm text-muted">Pick how often you want to eat out. We choose the best fits for your macros and spread them across the week.</p>
      <div className="grid gap-3">
        <Stepper label="Takeout meals" value={count} onChange={setCount} min={1} max={Math.max(1, s.days * mains.length)} />
        <div className="grid gap-1">
          <span className="text-[13px] text-muted" id="autoplan-which">Which meal</span>
          <div role="group" aria-labelledby="autoplan-which" className="flex flex-wrap gap-2">
            {mains.map((o) => <Chip key={o.id} selected={which === o.id} onClick={() => setWhich(o.id)}>{o.name}</Chip>)}
            {mains.length > 1 && <Chip selected={which === "any"} onClick={() => setWhich("any")}>Any</Chip>}
          </div>
        </div>
        <NumberField label="Spend up to" prefix="$" value={cap} onChange={setCap} min={0} max={500} />
        <button className="btn btn-primary" onClick={plan}><Sparkles size={16} aria-hidden /> Plan takeout</button>
        {note && <p role="status" className="text-sm">{note}</p>}
      </div>
    </Card>
  );
}

/** Finds which chains are near the person, from OpenStreetMap, when asked. */
function NearMe() {
  const s = useApp();
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const zip = s.profile.zip;
  const found = s.nearbyRestaurants;
  const find = async (how: "zip" | "gps") => {
    setBusy(true); setErr("");
    try {
      const p = how === "gps" ? await currentPosition() : await pointForZip(zip);
      let miles = await restaurantsNear(p, 5);
      if (Object.keys(miles).length < 3) miles = await restaurantsNear(p, 15); // wider net outside cities
      s.set({ nearbyRestaurants: { zip: how === "gps" ? "" : zip, on: new Date().toISOString().slice(0, 10), miles } });
      track("takeout_near_me", { found: Object.keys(miles).length });
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Something went wrong.");
    } finally { setBusy(false); }
  };
  const list = found ? Object.entries(found.miles).sort((a, b) => a[1] - b[1]) : [];
  return (
    <Card>
      <SectionTitle>Near you</SectionTitle>
      <div className="flex flex-wrap gap-2">
        {/^\d{5}$/.test(zip) && <button className="btn btn-sm" onClick={() => find("zip")} disabled={busy}><MapPin size={14} aria-hidden /> Chains near {zip}</button>}
        <button className="btn btn-sm" onClick={() => find("gps")} disabled={busy}><LocateFixed size={14} aria-hidden /> Use my location</button>
      </div>
      {busy && <p role="status" className="mt-2 text-sm text-muted">Looking up restaurants from OpenStreetMap…</p>}
      {err && <p role="alert" className="mt-2 text-sm text-warn">{err}</p>}
      {found && !busy && (list.length ? (
        <ul className="mt-3 grid gap-1 text-sm">
          {list.map(([id, mi]) => <li key={id} className="flex justify-between gap-2"><span>{RESTAURANTS_BY_ID[id]?.name ?? id}</span><span className="num text-muted">{mi} mi</span></li>)}
        </ul>
      ) : <p className="mt-2 text-sm text-muted">None of these chains are listed near you on OpenStreetMap.</p>)}
      {!found && !busy && <p className="mt-2 text-xs text-muted">Then use the Near me filter to see only chains you can get to.</p>}
    </Card>
  );
}
