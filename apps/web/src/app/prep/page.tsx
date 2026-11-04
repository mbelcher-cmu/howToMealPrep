"use client";
import Link from "next/link";
import { useMemo } from "react";
import { BellRing, Clock, Package, Snowflake, Timer } from "lucide-react";
import { formatAmount, INGREDIENTS, RECIPES_BY_ID } from "@prep-cart/catalog";
import { prepTimeline, type Timeline } from "@prep-cart/planner";
import { RecipeTile, SolvingNote } from "@/components/plan-bits";
import { Card, EmptyState, PageHeader, SectionTitle } from "@/components/ui";
import { useApp } from "@/lib/store";
import { useHydrated, usePlanner } from "@/lib/use-planner";
import { useDays } from "@/lib/days";
import { at, buildIcs, downloadText, nextWeekday, type CalEvent } from "@/lib/ics";
import { chainName, cx, DAY_LONG as WEEKDAYS, fmtQty, fmtServings, recipeHref } from "@/lib/format";

const clock = (start: string, plus: number) => {
  const [h, m] = start.split(":").map(Number);
  const d = new Date(2000, 0, 1, h ?? 0, (m ?? 0) + plus);
  return d.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
};

export default function Prep() {
  const hydrated = useHydrated();
  const { plan } = usePlanner();
  const s = useApp();
  const units = s.profile.units;
  const { DAY_LONG, PREP_DAY } = useDays();

  const timelines = useMemo(() => {
    if (!plan) return [] as Timeline[];
    return plan.schedule.sessions.map((sess) => prepTimeline(sess.batches.flatMap((b) => {
      const recipe = RECIPES_BY_ID[b.recipeId];
      const portion = plan.result.recipes.find((p) => p.recipe.id === b.recipeId)?.portion ?? 1;
      // one container per person per meal: average container size across the household
      const hh = plan.result.household ?? { people: 1, factor: 1 };
      return recipe ? [{ recipe, servings: b.servings, portion: (portion * hh.factor) / hh.people }] : [];
    })));
  }, [plan]);

  if (!hydrated) return null;
  if (!plan) return (<><PageHeader title="Prep day" /><EmptyState title="No plan yet">Your cooking plan appears here once a plan is ready.</EmptyState></>);
  const { sessions, freezer } = plan.schedule;
  const members = plan.result.household?.members ?? [];
  const factor = plan.result.household?.factor ?? 1;
  const frozen = freezer.reduce((a, f) => a + f.portions, 0);
  const containers = timelines.reduce((a, t) => a + t.containers, 0);

  const reminders = () => {
    const prepDate = nextWeekday((s.weekStart + 6) % 7);
    const events: CalEvent[] = [];
    const stores = plan.result.stores.map(chainName).join(" and ") || "the store";
    events.push({ uid: `shop-${plan.id}`, start: at(prepDate, "10:00", 0), minutes: 60, title: `Grocery run: ${stores}`, description: `${plan.result.cart.length} items, about $${plan.result.cost.toFixed(2)}. Open Prep Cart for the list sorted by aisle.`, alarmMinutesBefore: 30 });
    sessions.forEach((sess, i) => {
      const t = timelines[i]!;
      const day = sess.index === 0 ? prepDate : at(prepDate, "00:00", sess.beforeDay);
      events.push({
        uid: `prep-${plan.id}-${i}`, start: at(day, s.prepTime), minutes: Math.max(30, t.totalMinutes),
        title: sess.index === 0 ? "Meal prep" : "Top-up meal prep",
        description: t.steps.map((st) => `${clock(s.prepTime, st.at)} ${st.text}`).join("\n"),
        alarmMinutesBefore: 60,
      });
    });
    for (const f of freezer) {
      const r = RECIPES_BY_ID[f.recipeId];
      events.push({ uid: `thaw-${plan.id}-${f.recipeId}`, start: at(prepDate, "20:00", f.thawBeforeDay), minutes: 10, title: `Move ${r?.name ?? "frozen meals"} to the fridge`, description: `${f.portions} portion${f.portions === 1 ? "" : "s"} for ${DAY_LONG[f.thawBeforeDay]}.`, alarmMinutesBefore: 0 });
    }
    downloadText("prep-cart-reminders.ics", buildIcs(events), "text/calendar");
  };

  return (
    <>
      <PageHeader title="Prep day" lead="What to cook, in what order, and how much. Amounts are already scaled to your plan." action={<SolvingNote />} />

      <div className="mb-5 grid grid-cols-1 gap-4 lg:grid-cols-3">
        <Card>
          <SectionTitle>When you cook</SectionTitle>
          <div className="grid grid-cols-2 gap-3">
            <div className="grid gap-1">
              <label htmlFor="prep-day" className="text-[13px] text-muted">Prep day</label>
              <select id="prep-day" className="input" value={(s.weekStart + 6) % 7} onChange={(e) => s.set({ weekStart: (Number(e.target.value) + 1) % 7 })}>
                {WEEKDAYS.map((d, i) => <option key={d} value={i}>{d}</option>)}
              </select>
            </div>
            <div className="grid gap-1">
              <label htmlFor="prep-time" className="text-[13px] text-muted">Start at</label>
              <input id="prep-time" type="time" className="input" value={s.prepTime} onChange={(e) => e.target.value && s.set({ prepTime: e.target.value })} />
            </div>
          </div>
          <p className="mt-2 text-xs text-muted">Your week runs {DAY_LONG[0]} to {DAY_LONG[Math.min(6, plan.days - 1)]}.</p>
        </Card>
        <Card>
          <SectionTitle>Containers</SectionTitle>
          <p className="flex items-center gap-2 text-sm"><Package size={16} className="text-accent" aria-hidden /> <b className="num">{containers}</b> containers in all</p>
          {frozen > 0 && <p className="mt-1 flex items-center gap-2 text-sm"><Snowflake size={16} className="text-accent" aria-hidden /> <b className="num">{frozen}</b> of them freezer-safe</p>}
          <p className="mt-2 text-xs text-muted">One per meal or snack portion. Glass containers with snap lids reheat and freeze best.</p>
        </Card>
        <Card>
          <SectionTitle>Reminders</SectionTitle>
          <p className="text-sm text-muted">Add the grocery run, each cook session with its timeline, and thaw reminders to your calendar.</p>
          <button className="btn btn-primary mt-3 w-full" onClick={reminders}><BellRing size={16} aria-hidden /> Add to my calendar</button>
          <p className="mt-2 text-xs text-muted">Downloads a calendar file that Apple, Google and Outlook calendars can open.</p>
        </Card>
      </div>

      {freezer.length > 0 && (
        <Card className="mb-5">
          <SectionTitle>Freezer</SectionTitle>
          <ul className="grid gap-1 text-sm">
            {freezer.map((f) => (
              <li key={f.recipeId} className="flex items-start gap-2">
                <Snowflake size={16} className="mt-0.5 shrink-0 text-accent" aria-hidden />
                <span>Freeze {f.portions} portion{f.portions === 1 ? "" : "s"} of <b>{RECIPES_BY_ID[f.recipeId]?.name}</b> on prep day. Move to the fridge the night before {DAY_LONG[f.thawBeforeDay]}.</span>
              </li>
            ))}
          </ul>
        </Card>
      )}

      <div className="grid gap-8">
        {sessions.map((sess, si) => {
          const t = timelines[si]!;
          const order = t.steps.filter((st) => st.kind === "handsOn").map((st) => st.recipeId!);
          const batches = sess.batches.map((b) => ({ ...b, recipe: RECIPES_BY_ID[b.recipeId]! })).filter((b) => b.recipe).sort((a, b) => order.indexOf(a.recipeId) - order.indexOf(b.recipeId));
          const day = sess.index === 0 ? PREP_DAY : DAY_LONG[(sess.beforeDay + 6) % 7];
          return (
            <section key={sess.index} aria-labelledby={`sess-${sess.index}`}>
              <div className="mb-3 flex flex-wrap items-end justify-between gap-2">
                <h2 id={`sess-${sess.index}`} className="font-display text-xl font-bold">
                  {sess.index === 0 ? "Main prep" : sessions.length > 2 ? `Cook ${sess.index + 1}` : "Mid-week cook"} <span className="font-normal text-muted">· {day} at {clock(s.prepTime, 0)}</span>
                </h2>
                <span className="inline-flex items-center gap-1.5 text-sm text-muted"><Timer size={15} aria-hidden /> Done by {clock(s.prepTime, t.totalMinutes)} · {t.handsOnMinutes} min hands-on</span>
              </div>

              <Card className="mb-4">
                <SectionTitle>Timeline</SectionTitle>
                <ol className="relative grid gap-0 border-l border-line pl-4">
                  {t.steps.map((st, i) => (
                    <li key={i} className="relative pb-3 last:pb-0">
                      <span aria-hidden className={cx("absolute -left-[21px] top-1.5 h-2.5 w-2.5 rounded-full", st.kind === "handsOn" ? "bg-accent" : st.kind === "pack" ? "bg-ink" : "bg-line")} />
                      <div className="flex flex-wrap items-baseline gap-x-3">
                        <span className="num w-20 shrink-0 text-sm font-semibold">{clock(s.prepTime, st.at)}</span>
                        <span className={cx("text-sm", st.kind === "waiting" && "text-muted")}>{st.text}</span>
                        <span className="inline-flex items-center gap-1 text-xs text-muted"><Clock size={11} aria-hidden /> {st.minutes} min{st.kind === "waiting" ? ", hands off" : ""}</span>
                      </div>
                    </li>
                  ))}
                </ol>
              </Card>

              <div className="grid gap-4">
                {batches.map((b, n) => {
                  const scale = b.servings / b.recipe.servings;
                  const portion = plan.result.recipes.find((p) => p.recipe.id === b.recipeId)?.portion ?? 1;
                  return (
                    <Card key={b.recipeId} as="article">
                      <div className="flex items-start gap-3">
                        <RecipeTile recipe={b.recipe} />
                        <div className="min-w-0 flex-1">
                          <p className="label">Recipe {n + 1}</p>
                          <h3 className="font-display text-lg font-bold"><Link href={recipeHref(b.recipe.id)} className="hover:underline">{b.recipe.name}</Link></h3>
                          <p className="text-sm text-muted">Make {fmtServings(b.servings)} ({scale === 1 ? "as written" : `${fmtQty(scale)}× the recipe`})</p>
                        </div>
                      </div>
                      <div className="mt-4 grid gap-5 md:grid-cols-[minmax(0,240px)_minmax(0,1fr)]">
                        <div>
                          <h4 className="label mb-1.5">Ingredients</h4>
                          <ul className="grid gap-1 text-sm">
                            {b.recipe.lines.map((l) => (
                              <li key={l.ingredientId} className="flex justify-between gap-3">
                                <span>{INGREDIENTS[l.ingredientId]?.name}</span>
                                <span className="num shrink-0 text-muted">{formatAmount(l.ingredientId, l.grams * scale, units)}</span>
                              </li>
                            ))}
                          </ul>
                        </div>
                        <div>
                          <h4 className="label mb-1.5">Method</h4>
                          <ol className="grid list-decimal gap-1.5 pl-5 text-sm">
                            {b.recipe.steps.map((st, i) => <li key={i}>{st}</li>)}
                          </ol>
                          <p className="mt-3 text-xs text-muted">
                            {members.length
                              ? <>Portion into {Math.max(1, Math.round((b.servings / Math.max(0.25, portion * factor)) * (1 + members.length)))} containers: {fmtServings(portion)} for you, {members.map((m) => `${fmtServings(Math.round(portion * m.scale * 4) / 4 || 0.25)} for ${m.name}`).join(", ")}. </>
                              : <>Portion into {Math.max(1, Math.round(b.servings / Math.max(0.25, portion)))} containers of {fmtServings(portion)}. </>}
                            Keeps {b.recipe.fridgeDays} days in the fridge.
                            {b.recipe.reheat && <> Reheat: {b.recipe.reheat}</>}
                          </p>
                        </div>
                      </div>
                    </Card>
                  );
                })}
              </div>
            </section>
          );
        })}
      </div>
    </>
  );
}
