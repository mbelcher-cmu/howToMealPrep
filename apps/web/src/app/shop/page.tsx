"use client";
import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { ArrowDown, ArrowUp, Check, ChevronLeft, ListOrdered, SearchX, Sun, Undo2 } from "lucide-react";
import { formatAmount, INGREDIENTS, type Aisle, type ChainId } from "@prep-cart/catalog";
import type { CartLine } from "@prep-cart/planner";
import { useApp } from "@/lib/store";
import { useHydrated, usePlanner } from "@/lib/use-planner";
import { AISLE_ORDER, aisleOrderFor } from "@/lib/aisles";
import { chainName, cx, money } from "@/lib/format";
import { ItemArt } from "@/components/food";
import { useWakeLock } from "@/lib/wake-lock";
import { useFlag } from "@/lib/flags";
import { safeStorage } from "@/lib/storage";

const lineKey = (l: CartLine) => `${l.chain}:${l.ingredientId}`;
const aisleId = (a: Aisle) => `aisle-${a.toLowerCase().replace(/[^a-z]+/g, "-")}`;
const missingKey = (planId: string) => `prep-cart-missing:${planId}`;
const buzz = () => { try { navigator.vibrate?.(12); } catch { /* not supported */ } };

export default function Shop() {
  const hydrated = useHydrated();
  const { plan } = usePlanner();
  const s = useApp();
  const stores = useMemo(() => [...new Set((plan?.result.cart ?? []).map((l) => l.chain))], [plan]);
  const [chain, setChain] = useState<ChainId | null>(null);
  const [arranging, setArranging] = useState(false);
  const [awake, setAwake] = useState(true);
  const wake = useWakeLock(awake);
  const last = useRef<string | null>(null);
  const [undo, setUndo] = useState<string | null>(null);
  const cur = chain ?? stores[0] ?? null;
  const aisleMode = useFlag("aisleMode");
  // items the person couldn't find in this store, kept on this device for this plan
  const [missing, setMissing] = useState<Record<string, boolean>>({});
  useEffect(() => {
    if (!plan) return;
    try { setMissing(JSON.parse(safeStorage.getItem(missingKey(plan.id)) ?? "{}") as Record<string, boolean>); } catch { setMissing({}); }
  }, [plan?.id]);
  const toggleMissing = (k: string) => {
    if (!plan) return;
    const n = { ...missing };
    if (n[k]) delete n[k]; else n[k] = true;
    setMissing(n);
    safeStorage.setItem(missingKey(plan.id), JSON.stringify(n));
  };

  if (!hydrated) return null;
  if (!plan || !cur) {
    return (
      <div className="mx-auto grid min-h-dvh max-w-[560px] content-center gap-3 p-6 text-center">
        <h1 className="font-display text-2xl font-bold">Nothing to shop for yet</h1>
        <p className="text-muted">Your list shows up here once a plan is ready.</p>
        <Link href="/plan/" className="btn btn-primary mx-auto">Go to my plan</Link>
      </div>
    );
  }

  const order = aisleOrderFor(cur, s.aisleOrder);
  const lines = plan.result.cart.filter((l) => l.chain === cur && INGREDIENTS[l.ingredientId]);
  const notFound = aisleMode ? lines.filter((l) => missing[lineKey(l)] && !s.checked[lineKey(l)]) : [];
  const todo = lines.filter((l) => !s.checked[lineKey(l)] && !notFound.includes(l));
  const done = lines.filter((l) => s.checked[lineKey(l)]);
  const byAisle = new Map<Aisle, CartLine[]>();
  for (const l of todo) {
    const a = INGREDIENTS[l.ingredientId]!.aisle;
    byAisle.set(a, [...(byAisle.get(a) ?? []), l]);
  }
  for (const list of byAisle.values()) list.sort((a, b) => INGREDIENTS[a.ingredientId]!.name.localeCompare(INGREDIENTS[b.ingredientId]!.name));
  const inCart = done.reduce((a, l) => a + l.cost, 0);
  const total = lines.reduce((a, l) => a + l.cost, 0);

  const tick = (l: CartLine) => {
    const k = lineKey(l);
    if (aisleMode) { buzz(); if (missing[k]) toggleMissing(k); }
    s.toggleChecked(k);
    if (!s.checked[k]) { last.current = k; setUndo(INGREDIENTS[l.ingredientId]!.name); setTimeout(() => setUndo((u) => (last.current === k ? null : u)), 4000); }
  };
  const move = (a: Aisle, dir: -1 | 1) => {
    const list = [...order];
    const i = list.indexOf(a);
    const j = i + dir;
    if (j < 0 || j >= list.length) return;
    [list[i], list[j]] = [list[j]!, list[i]!];
    s.set({ aisleOrder: { ...s.aisleOrder, [cur]: list } });
  };

  return (
    <div className="mx-auto min-h-dvh max-w-[640px] pb-24">
      <header className="sticky top-0 z-20 border-b border-line bg-surface/95 px-4 pb-3 backdrop-blur" style={{ paddingTop: "calc(env(safe-area-inset-top, 0px) + 10px)" }}>
        <div className="flex items-center gap-2">
          <Link href="/groceries/" className="grid h-11 w-11 place-items-center rounded-lg hover:bg-sunk" aria-label="Leave in-store mode"><ChevronLeft size={22} aria-hidden /></Link>
          <h1 className="min-w-0 flex-1 truncate font-display text-lg font-bold">{chainName(cur)}</h1>
          <button className={cx("grid h-11 w-11 place-items-center rounded-lg", awake ? "text-accent" : "text-muted", "hover:bg-sunk")} onClick={() => setAwake(!awake)} aria-pressed={awake} aria-label="Keep screen on" title={wake === false ? "This browser can't keep the screen on" : "Keep screen on"}><Sun size={20} aria-hidden /></button>
          <button className={cx("grid h-11 w-11 place-items-center rounded-lg hover:bg-sunk", arranging && "bg-accent-soft")} onClick={() => setArranging(!arranging)} aria-pressed={arranging} aria-label="Change aisle order"><ListOrdered size={20} aria-hidden /></button>
        </div>
        {stores.length > 1 && (
          <div role="tablist" aria-label="Store" className="mt-2 flex gap-2">
            {stores.map((c) => <button key={c} role="tab" aria-selected={c === cur} className={cx("rounded-full border px-3 py-1.5 text-sm", c === cur ? "border-accent bg-accent-soft font-semibold" : "border-line")} onClick={() => setChain(c)}>{chainName(c)}</button>)}
          </div>
        )}
        <div className="mt-2 flex items-center justify-between text-sm">
          <span><b className="num">{done.length}</b> of {lines.length} in the cart</span>
          <span className="num text-muted">{money(inCart)} of {money(total)}</span>
        </div>
        <div className="mt-1.5 h-2 rounded-full bg-sunk"><div className="h-full rounded-full bg-accent transition-[width]" style={{ width: `${lines.length ? (done.length / lines.length) * 100 : 0}%` }} /></div>
        {aisleMode && !arranging && byAisle.size > 1 && (
          <nav aria-label="Jump to aisle" className="-mx-4 mt-2 flex gap-2 overflow-x-auto px-4 pb-0.5 [scrollbar-width:none]">
            {order.filter((a) => byAisle.has(a)).map((a) => (
              <a key={a} href={`#${aisleId(a)}`} className="shrink-0 whitespace-nowrap rounded-full border border-line bg-surface px-3 py-1.5 text-[13px] font-semibold">
                {a} <span className="num font-normal text-muted">{byAisle.get(a)!.length}</span>
              </a>
            ))}
          </nav>
        )}
      </header>

      {arranging ? (
        <section className="p-4" aria-label="Aisle order">
          <p className="mb-3 text-sm text-muted">Put the aisles in the order you walk this store. It's saved for {chainName(cur)}.</p>
          <ol className="divide-y divide-line rounded-xl border border-line bg-surface">
            {order.map((a, i) => (
              <li key={a} className="flex items-center gap-2 px-3 py-2">
                <span className="num w-6 text-sm text-muted">{i + 1}</span>
                <span className="flex-1">{a}</span>
                <button className="grid h-11 w-11 place-items-center rounded-lg hover:bg-sunk disabled:opacity-30" disabled={i === 0} onClick={() => move(a, -1)} aria-label={`Move ${a} up`}><ArrowUp size={18} aria-hidden /></button>
                <button className="grid h-11 w-11 place-items-center rounded-lg hover:bg-sunk disabled:opacity-30" disabled={i === order.length - 1} onClick={() => move(a, 1)} aria-label={`Move ${a} down`}><ArrowDown size={18} aria-hidden /></button>
              </li>
            ))}
          </ol>
          <div className="mt-3 flex gap-2">
            <button className="btn btn-primary flex-1" onClick={() => setArranging(false)}>Done</button>
            <button className="btn" onClick={() => { const { [cur]: _drop, ...rest } = s.aisleOrder; void _drop; s.set({ aisleOrder: rest }); }}>Reset</button>
          </div>
        </section>
      ) : (
        <div className="grid gap-5 px-4 pt-4">
          {todo.length === 0 && (
            <div className="rounded-xl bg-accent-soft p-5 text-center">
              <p className="font-display text-xl font-bold">All done at {chainName(cur)}</p>
              {stores.length > 1 && <p className="mt-1 text-sm text-muted">Switch stores above for the rest of the list.</p>}
              {s.shoppedPlanId === plan.id
                ? <p className="mt-2 text-sm">Leftovers are saved to your pantry. Next week's plan uses them first.</p>
                : <>
                    <p className="mt-1 text-sm text-muted">Save what's left of each package to your pantry, so next week's plan uses it first.</p>
                    <button className="btn btn-primary mt-3" onClick={() => s.finishShopping()}><Check size={16} aria-hidden /> Done shopping</button>
                  </>}
              <Link href="/" className="btn mt-2">Back home</Link>
            </div>
          )}
          {order.filter((a) => byAisle.has(a)).map((a) => (
            <section key={a} aria-labelledby={`aisle-${a}`} id={aisleMode ? aisleId(a) : undefined} className="scroll-mt-48">
              <h2 id={`aisle-${a}`} className="label mb-1.5">{a}{aisleMode && <span className="ml-2 normal-case tracking-normal">· {byAisle.get(a)!.length} left</span>}</h2>
              <ul className="grid gap-2">
                {byAisle.get(a)!.map((l) => {
                  const ing = INGREDIENTS[l.ingredientId]!;
                  return (
                    <li key={lineKey(l)} className={aisleMode ? "flex items-stretch gap-2" : undefined}>
                      <button className={cx("flex min-h-[64px] w-full min-w-0 items-center rounded-xl border border-line bg-surface py-3 text-left active:bg-sunk", aisleMode ? "gap-2.5 px-3" : "gap-3 px-4")} onClick={() => tick(l)}>
                        <span aria-hidden className="grid h-7 w-7 shrink-0 place-items-center rounded-md border-2 border-line" />
                        <ItemArt ingredientId={ing.id} size={aisleMode ? 44 : 56} />
                        <span className="min-w-0 flex-1">
                          <span className="block text-[17px] font-semibold">{ing.name}</span>
                          <span className="block text-sm text-muted">{l.packages} × {ing.pkg.label} · need {formatAmount(ing.id, l.needGrams, s.profile.units)}</span>
                        </span>
                        <span className="num shrink-0 text-sm text-muted">{money(l.cost)}</span>
                        <span className="sr-only">Mark as in the cart</span>
                      </button>
                      {aisleMode && (
                        <button className="grid w-11 shrink-0 place-items-center rounded-xl border border-line bg-surface text-muted active:bg-sunk" onClick={() => toggleMissing(lineKey(l))} aria-label={`Can't find ${ing.name}`} title="Can't find it">
                          <SearchX size={20} aria-hidden />
                        </button>
                      )}
                    </li>
                  );
                })}
              </ul>
            </section>
          ))}
          {notFound.length > 0 && (
            <section aria-labelledby="not-found">
              <h2 id="not-found" className="label mb-1.5">Couldn&apos;t find</h2>
              <ul className="divide-y divide-line rounded-xl border border-warn/40 bg-warn-soft">
                {notFound.map((l) => (
                  <li key={lineKey(l)} className="flex items-center gap-3 px-4 py-2">
                    <span className="flex-1 text-sm"><b>{INGREDIENTS[l.ingredientId]!.name}</b>{stores.length > 1 ? <span className="text-muted"> · try the other store</span> : null}</span>
                    <button className="btn btn-sm" onClick={() => tick(l)}>Found it</button>
                  </li>
                ))}
              </ul>
              <p className="mt-1.5 text-xs text-muted">After shopping, swap the recipe that needs it on <Link href="/plan/" className="underline">your plan</Link>, or mark it in the pantry if you already have some.</p>
            </section>
          )}
          {done.length > 0 && (
            <section aria-labelledby="in-cart">
              <h2 id="in-cart" className="label mb-1.5">In the cart</h2>
              <ul className="divide-y divide-line rounded-xl border border-line">
                {done.map((l) => (
                  <li key={lineKey(l)}>
                    <button className="flex min-h-[48px] w-full items-center gap-3 px-4 py-2 text-left text-muted" onClick={() => tick(l)} aria-label={`${INGREDIENTS[l.ingredientId]!.name}, in the cart. Tap to put back.`}>
                      <span aria-hidden className="grid h-6 w-6 place-items-center rounded-md bg-accent text-accent-ink"><Check size={14} strokeWidth={3} /></span>
                      <span className="flex-1 line-through">{INGREDIENTS[l.ingredientId]!.name}</span>
                      <span className="num text-sm">{money(l.cost)}</span>
                    </button>
                  </li>
                ))}
              </ul>
            </section>
          )}
        </div>
      )}

      {undo && (
        <div role="status" className="toast fixed inset-x-4 bottom-4 z-30 mx-auto flex max-w-[600px] items-center justify-between gap-3 rounded-xl bg-ink px-4 py-3 text-bg shadow-lg" style={{ marginBottom: "env(safe-area-inset-bottom, 0px)" }}>
          <span className="truncate">{undo} is in the cart</span>
          <button className="inline-flex items-center gap-1 font-semibold" onClick={() => { if (last.current) s.toggleChecked(last.current); last.current = null; setUndo(null); }}><Undo2 size={16} aria-hidden /> Undo</button>
        </div>
      )}
    </div>
  );
}
