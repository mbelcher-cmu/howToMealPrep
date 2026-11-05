"use client";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Bell, Check, ChevronLeft, CookingPot, Flame, Package, RotateCcw, Snowflake, Sun, Timer } from "lucide-react";
import { formatAmount, INGREDIENTS, RECIPES_BY_ID } from "@prep-cart/catalog";
import { cookPlan, PREHEAT_MINUTES, STATION_LABEL, storageNote, type CookStep } from "@prep-cart/planner";
import { useApp } from "@/lib/store";
import { useHydrated, usePlanner } from "@/lib/use-planner";
import { useFlag } from "@/lib/flags";
import { useWakeLock } from "@/lib/wake-lock";
import { clearProgress, clockAt, loadProgress, minutesWord, saveProgress, sessionBatches, type CookProgress } from "@/lib/cook";
import { cx } from "@/lib/format";
import { RecipeTile } from "@/components/plan-bits";

const PREHEAT_TIMER = "preheat:wait";
const mmss = (ms: number) => {
  const s = Math.max(0, Math.ceil(ms / 1000));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const ss = String(s % 60).padStart(2, "0");
  return h ? `${h}:${String(m).padStart(2, "0")}:${ss}` : `${m}:${ss}`;
};

/** A short beep and a buzz, where the device allows. */
function alarm() {
  try { navigator.vibrate?.([250, 120, 250, 120, 250]); } catch { /* not supported */ }
  try {
    const Ctx = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctx) return;
    const ctx = new Ctx();
    [0, 0.35, 0.7].forEach((t) => {
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      o.frequency.value = 880;
      g.gain.setValueAtTime(0.0001, ctx.currentTime + t);
      g.gain.exponentialRampToValueAtTime(0.25, ctx.currentTime + t + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + t + 0.25);
      o.connect(g).connect(ctx.destination);
      o.start(ctx.currentTime + t);
      o.stop(ctx.currentTime + t + 0.3);
    });
    setTimeout(() => void ctx.close(), 1500);
  } catch { /* audio blocked */ }
}

export default function Cook() {
  const hydrated = useHydrated();
  const on = useFlag("cookMode");
  const { plan } = usePlanner();
  const s = useApp();
  const units = s.profile.units;
  const [session, setSession] = useState(0);
  useEffect(() => {
    const n = Number(new URLSearchParams(window.location.search).get("s") ?? 0);
    if (Number.isInteger(n) && n >= 0) setSession(n);
  }, []);

  const plans = useMemo(() => (plan ? sessionBatches(plan).map((b) => ({ batches: b, cook: cookPlan(b) })) : []), [plan]);
  const cur = plans[Math.min(session, Math.max(0, plans.length - 1))];
  const planId = plan?.id ?? "";

  const [progress, setProgress] = useState<CookProgress>({ done: [], timers: {} });
  useEffect(() => { if (planId) setProgress(loadProgress(planId, session)); }, [planId, session]);
  const update = useCallback((f: (p: CookProgress) => CookProgress) => {
    setProgress((p) => { const n = f(p); if (planId) saveProgress(planId, session, n); return n; });
  }, [planId, session]);

  const [now, setNow] = useState(() => Date.now());
  const anyTimer = Object.keys(progress.timers).length > 0;
  useEffect(() => {
    if (!anyTimer) return;
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [anyTimer]);

  // ring once for each timer that runs out
  const rung = useRef(new Set<string>());
  const [announce, setAnnounce] = useState("");
  const stepsById = useMemo(() => new Map((cur?.cook.steps ?? []).map((st) => [st.id, st])), [cur]);
  useEffect(() => {
    for (const [id, end] of Object.entries(progress.timers)) {
      if (end > now || rung.current.has(id) || progress.done.includes(id)) continue;
      rung.current.add(id);
      if (end < now - 60_000) continue; // finished while the page was closed: show it, don't ring
      const st = stepsById.get(id);
      const msg = id === PREHEAT_TIMER ? "The oven is hot." : `${st?.recipeId ? RECIPES_BY_ID[st.recipeId]?.name : "Timer"} is ready. ${st?.whenDone ?? ""}`;
      setAnnounce(msg);
      alarm();
      try {
        if ("Notification" in window && Notification.permission === "granted" && document.visibilityState !== "visible") new Notification("MacroAisle timer", { body: msg, tag: id });
      } catch { /* notifications blocked */ }
    }
  }, [now, progress, stepsById]);

  const [awake, setAwake] = useState(true);
  const wake = useWakeLock(awake);

  if (!hydrated) return null;
  if (!on || !plan || !cur || cur.cook.steps.length === 0) {
    return (
      <div className="mx-auto grid min-h-dvh max-w-[560px] content-center gap-3 p-6 text-center">
        <h1 className="font-display text-2xl font-bold">Nothing to cook yet</h1>
        <p className="text-muted">{on ? "Cook mode walks you through prep day once a plan is ready." : "Cook mode isn't turned on for this app yet."}</p>
        <Link href="/prep/" className="btn btn-primary mx-auto">Go to prep day</Link>
      </div>
    );
  }

  const { cook, batches } = cur;
  const tasks = cook.steps.filter((st) => st.kind !== "waiting");
  const doneSet = new Set(progress.done);
  const next = tasks.find((st) => !doneSet.has(st.id)) ?? null;
  const upcoming = tasks.filter((st) => !doneSet.has(st.id) && st !== next);
  const running = Object.entries(progress.timers)
    .filter(([id]) => !doneSet.has(id))
    .map(([id, end]) => ({ id, end, step: stepsById.get(id) }))
    .sort((a, b) => a.end - b.end);
  const finishedTasks = tasks.filter((st) => doneSet.has(st.id)).length;
  const allDone = !next && running.length === 0;
  const batchOf = (id: string | null) => batches.find((b) => b.recipe.id === id);

  const complete = (st: CookStep) => {
    if ("Notification" in window && Notification.permission === "default") void Notification.requestPermission().catch(() => {});
    update((p) => {
      const timers = { ...p.timers };
      if (st.kind === "preheat") timers[PREHEAT_TIMER] = Date.now() + (PREHEAT_MINUTES - st.minutes) * 60_000;
      const wait = cook.steps.find((w) => w.kind === "waiting" && w.recipeId === st.recipeId && st.kind === "handsOn");
      if (wait) timers[wait.id] = Date.now() + wait.minutes * 60_000;
      return { done: [...p.done, st.id], timers };
    });
  };
  const dismiss = (id: string) => update((p) => ({ ...p, done: [...p.done, id] }));
  const addMinute = (id: string) => update((p) => ({ ...p, timers: { ...p.timers, [id]: Math.max(Date.now(), p.timers[id] ?? 0) + 60_000 } }));
  const back = () => update((p) => {
    const last = [...p.done].reverse().find((id) => tasks.some((t) => t.id === id));
    if (!last) return p;
    const st = stepsById.get(last);
    const timers = { ...p.timers };
    if (st?.kind === "preheat") delete timers[PREHEAT_TIMER];
    const wait = cook.steps.find((w) => w.kind === "waiting" && w.recipeId === st?.recipeId && st?.kind === "handsOn");
    if (wait) delete timers[wait.id];
    rung.current.delete(wait?.id ?? "");
    return { done: p.done.filter((x) => x !== last && x !== wait?.id), timers };
  });
  const restart = () => { clearProgress(planId, session); rung.current.clear(); setProgress({ done: [], timers: {} }); };

  const nb = next ? batchOf(next.recipeId) : undefined;
  const scale = nb ? nb.servings / nb.recipe.servings : 1;

  return (
    <div className="mx-auto min-h-dvh max-w-[640px] pb-24">
      <header className="sticky top-0 z-20 border-b border-line bg-surface/95 px-4 pb-3 backdrop-blur" style={{ paddingTop: "calc(env(safe-area-inset-top, 0px) + 10px)" }}>
        <div className="flex items-center gap-2">
          <Link href="/prep/" className="grid h-11 w-11 place-items-center rounded-lg hover:bg-sunk" aria-label="Leave cook mode"><ChevronLeft size={22} aria-hidden /></Link>
          <h1 className="min-w-0 flex-1 truncate font-display text-lg font-bold">{session === 0 ? "Prep day" : "Mid-week cook"}</h1>
          <button className={cx("grid h-11 w-11 place-items-center rounded-lg hover:bg-sunk", awake ? "text-accent" : "text-muted")} onClick={() => setAwake(!awake)} aria-pressed={awake} aria-label="Keep screen on" title={wake === false ? "This browser can't keep the screen on" : "Keep screen on"}><Sun size={20} aria-hidden /></button>
        </div>
        {plans.length > 1 && (
          <div role="tablist" aria-label="Cook session" className="mt-2 flex gap-2">
            {plans.map((_, i) => <button key={i} role="tab" aria-selected={i === session} className={cx("rounded-full border px-3 py-1.5 text-sm", i === session ? "border-accent bg-accent-soft font-semibold" : "border-line")} onClick={() => setSession(i)}>{i === 0 ? "Prep day" : `Cook ${i + 1}`}</button>)}
          </div>
        )}
        <div className="mt-2 flex items-center justify-between text-sm">
          <span><b className="num">{finishedTasks}</b> of {tasks.length} steps done</span>
          <span className="num text-muted">about {minutesWord(cook.totalMinutes)} in all</span>
        </div>
        <div className="mt-1.5 h-2 rounded-full bg-sunk"><div className="h-full rounded-full bg-accent transition-[width]" style={{ width: `${(finishedTasks / tasks.length) * 100}%` }} /></div>
      </header>

      <p role="status" aria-live="assertive" className="sr-only">{announce}</p>

      <div className="grid grid-cols-[minmax(0,1fr)] gap-5 px-4 pt-4">
        {running.length > 0 && (
          <section aria-labelledby="timers">
            <h2 id="timers" className="label mb-1.5">Timers</h2>
            <ul className="grid grid-cols-[minmax(0,1fr)] gap-2">
              {running.map(({ id, end, step }) => {
                const left = end - now;
                const ready = left <= 0;
                const total = id === PREHEAT_TIMER ? PREHEAT_MINUTES * 60_000 : (step?.minutes ?? 1) * 60_000;
                const name = id === PREHEAT_TIMER ? "Oven preheating" : step?.recipeId ? RECIPES_BY_ID[step.recipeId]?.name : step?.text;
                return (
                  <li key={id} className={cx("rounded-xl border p-3", ready ? "border-accent bg-accent-soft" : "border-line bg-surface")}>
                    <div className="flex items-center gap-3">
                      {id === PREHEAT_TIMER || step?.station === "oven" ? <Flame size={20} aria-hidden className="shrink-0 text-accent" /> : <Timer size={20} aria-hidden className="shrink-0 text-accent" />}
                      <div className="min-w-0 flex-1">
                        <p className="truncate font-semibold">{name}</p>
                        <p className="text-sm text-muted">{ready ? (id === PREHEAT_TIMER ? "The oven is hot." : step?.whenDone ?? "Ready.") : id === PREHEAT_TIMER ? "Food goes in once it beeps" : step ? STATION_LABEL[step.station] : ""}</p>
                      </div>
                      <span className={cx("num shrink-0 text-xl font-bold", ready && "text-accent")} aria-label={ready ? "Ready" : `${Math.ceil(left / 60_000)} minutes left`}>{ready ? <Bell size={22} aria-hidden /> : mmss(left)}</span>
                    </div>
                    {!ready && <div className="mt-2 h-1.5 rounded-full bg-sunk"><div className="h-full rounded-full bg-accent" style={{ width: `${Math.min(100, (1 - left / total) * 100)}%` }} /></div>}
                    <div className="mt-2 flex gap-2">
                      {ready ? <button className="btn btn-primary btn-sm" onClick={() => dismiss(id)}><Check size={14} aria-hidden /> Got it</button>
                        : <button className="btn btn-sm" onClick={() => addMinute(id)}>+1 min</button>}
                      {!ready && <button className="btn btn-sm" onClick={() => dismiss(id)}>Stop timer</button>}
                    </div>
                  </li>
                );
              })}
            </ul>
          </section>
        )}

        {next && (
          <section aria-labelledby="now" className="rounded-2xl border-2 border-accent bg-surface p-4">
            <p className="label">Now · planned for {clockAt(s.prepTime, next.at)}</p>
            <div className="mt-2 flex items-start gap-3">
              {nb ? <RecipeTile recipe={nb.recipe} size={56} /> : <span className="grid h-14 w-14 shrink-0 place-items-center rounded-xl bg-accent-soft">{next.kind === "pack" ? <Package size={26} aria-hidden /> : <Flame size={26} aria-hidden />}</span>}
              <div className="min-w-0 flex-1">
                <h2 id="now" className="font-display text-xl font-bold leading-tight">{next.text}</h2>
                <p className="mt-1 flex flex-wrap gap-x-3 text-sm text-muted">
                  <span className="inline-flex items-center gap-1"><CookingPot size={14} aria-hidden /> {STATION_LABEL[next.station]}</span>
                  <span className="inline-flex items-center gap-1"><Timer size={14} aria-hidden /> about {minutesWord(next.minutes)} of work</span>
                </p>
              </div>
            </div>

            {nb && (
              <div className="mt-4 grid gap-4">
                <details>
                  <summary className="cursor-pointer text-sm font-semibold text-accent">Ingredients ({nb.recipe.lines.length})</summary>
                  <ul className="mt-2 grid gap-1 text-sm">
                    {nb.recipe.lines.map((l) => (
                      <li key={l.ingredientId} className="flex justify-between gap-3">
                        <span>{INGREDIENTS[l.ingredientId]?.name}</span>
                        <span className="num shrink-0 text-muted">{formatAmount(l.ingredientId, l.grams * scale, units)}</span>
                      </li>
                    ))}
                  </ul>
                </details>
                <ol className="grid list-decimal gap-2 pl-5 text-[15px] leading-snug">
                  {nb.recipe.steps.map((t, i) => <li key={i}>{t}</li>)}
                </ol>
                {cook.steps.some((w) => w.kind === "waiting" && w.recipeId === nb.recipe.id) && (
                  <p className="text-sm text-muted">When it goes in to cook, tap Done and a timer starts. Move straight on to the next step.</p>
                )}
              </div>
            )}
            {next.kind === "pack" && (
              <ul className="mt-4 grid gap-2 text-sm">
                {running.length > 0 && <li className="rounded-lg bg-warn-soft px-3 py-2 text-warn">Still cooking: {running.length} timer{running.length === 1 ? "" : "s"}. Portion what's ready first.</li>}
                {batches.map((b) => {
                  const n = storageNote(b.recipe);
                  return (
                    <li key={b.recipe.id} className="flex items-start gap-2">
                      {n.freezer ? <Snowflake size={16} aria-hidden className="mt-0.5 shrink-0 text-accent" /> : <Package size={16} aria-hidden className="mt-0.5 shrink-0 text-accent" />}
                      <span><b>{b.recipe.name}</b>: {Math.max(1, Math.round(b.servings / Math.max(0.25, b.portion)))} containers, fridge {n.fridgeDays} days{n.freezer ? ", or freeze" : ""}.</span>
                    </li>
                  );
                })}
                <li className="text-muted">Let food cool a little, uncovered, then lid it and get it in the fridge within 2 hours of cooking.</li>
              </ul>
            )}

            <div className="mt-5 flex gap-2">
              <button className="btn btn-primary min-h-[52px] flex-1 text-base" onClick={() => complete(next)}><Check size={18} aria-hidden /> Done, next step</button>
              {finishedTasks > 0 && <button className="btn min-h-[52px]" onClick={back} aria-label="Back one step"><RotateCcw size={18} aria-hidden /></button>}
            </div>
          </section>
        )}

        {allDone && (
          <section className="rounded-xl bg-accent-soft p-5 text-center" aria-labelledby="all-done">
            <h2 id="all-done" className="font-display text-xl font-bold">Prep done</h2>
            <p className="mt-1 text-sm">{cook.containers} containers ready for the week. Reheat notes are on the prep day page.</p>
            <div className="mt-3 flex justify-center gap-2">
              <Link href="/prep/" className="btn btn-primary">Back to prep day</Link>
              <button className="btn" onClick={restart}>Start over</button>
            </div>
          </section>
        )}

        {!next && running.length > 0 && <p className="text-center text-sm text-muted">Nothing to do until a timer goes off.</p>}

        {upcoming.length > 0 && (
          <section aria-labelledby="later">
            <h2 id="later" className="label mb-1.5">Coming up</h2>
            <ol className="divide-y divide-line rounded-xl border border-line bg-surface">
              {upcoming.map((st) => (
                <li key={st.id} className="flex items-baseline gap-3 px-4 py-2.5 text-sm">
                  <span className="num w-16 shrink-0 font-semibold">{clockAt(s.prepTime, st.at)}</span>
                  <span className="flex-1">{st.text}</span>
                  <span className="shrink-0 text-xs text-muted">{STATION_LABEL[st.station]}</span>
                </li>
              ))}
            </ol>
          </section>
        )}
      </div>
    </div>
  );
}
