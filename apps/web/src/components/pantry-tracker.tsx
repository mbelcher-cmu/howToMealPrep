"use client";
import Link from "next/link";
import { useMemo, useState } from "react";
import { ChefHat, Plus, X } from "lucide-react";
import { formatAmount, INGREDIENTS, RECIPES } from "@prep-cart/catalog";
import { hardRejection } from "@prep-cart/planner";
import { ItemArt } from "@/components/food";
import { Card, Chip, NumberField, SectionTitle } from "@/components/ui";
import { daysUntil, useApp, type PantryRow } from "@/lib/store";
import { cx, money, recipeHref } from "@/lib/format";
import { cookFromPantry, nearestQuick, pantrySavings, QUICK_AMOUNTS, STORAGE_LABEL, STORAGE_ORDER, storageOf, type Storage } from "@/lib/pantry";

const shortDate = (iso: string) => new Date(`${iso}T12:00:00`).toLocaleDateString(undefined, { month: "short", day: "numeric" });

function PantryLine({ p }: { p: PantryRow }) {
  const s = useApp();
  const [editing, setEditing] = useState(false);
  const ing = INGREDIENTS[p.ingredientId]!;
  const left = p.useBy ? daysUntil(p.useBy) : null;
  const quick = nearestQuick(ing.id, p.grams);
  const set = (g: number | null) => s.setPantryAmount(ing.id, g);
  return (
    <li className="py-3">
      <div className="flex items-center gap-3">
        <ItemArt ingredientId={ing.id} className="h-11 w-11" />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2 font-medium">{ing.name}
            {left != null && left < 0 && <span className="pill pill-warn">Past its date</span>}
            {left != null && left >= 0 && left <= 2 && <span className="pill pill-warn">Use soon</span>}
          </div>
          <div className="text-xs text-muted">
            About {formatAmount(ing.id, p.grams, s.profile.units)}
            {p.useBy && left != null && <> · {left < 0 ? "was due" : "use by"} {shortDate(p.useBy)}</>}
          </div>
        </div>
        <button className="btn btn-sm" aria-expanded={editing} aria-controls={`edit-${ing.id}`} onClick={() => setEditing(!editing)}>
          {editing ? "Done" : "Edit"}<span className="sr-only"> {ing.name}</span>
        </button>
      </div>
      <div className="mt-2 flex flex-wrap items-center gap-1.5 pl-14" role="group" aria-label={`How much ${ing.name} is left`}>
        {QUICK_AMOUNTS.map((q) => (
          <button key={q.label} className={cx("btn btn-sm", quick === q.share && "border-accent bg-accent-soft")} aria-pressed={quick === q.share} onClick={() => set(Math.round(q.share * ing.pkg.grams))}>{q.label}</button>
        ))}
        <button className="btn btn-sm" onClick={() => set(null)}>Used up<span className="sr-only">: remove {ing.name}</span></button>
      </div>
      {editing && (
        <div id={`edit-${ing.id}`} className="mt-3 flex flex-wrap items-end gap-3 pl-14">
          <div className="w-28"><NumberField compact label="Grams" value={Math.round(p.grams)} min={0} max={20000} step={50} onChange={(g) => set(g)} /></div>
          <div className="grid gap-1">
            <label className="text-xs text-muted" htmlFor={`useby-${ing.id}`}>Use by</label>
            <input id={`useby-${ing.id}`} type="date" className="input h-9 w-[150px] px-2 py-1 text-sm" value={p.useBy ?? ""} onChange={(e) => s.setPantryAmount(ing.id, p.grams, e.target.value || null)} />
          </div>
          <button className="btn btn-sm" onClick={() => s.setPantryAmount(ing.id, Infinity)}>Always have it</button>
        </div>
      )}
    </li>
  );
}

/** The pantry tracker: what's at home by fridge, freezer and cupboard, with quick amounts. */
export function PantryTracker() {
  const s = useApp();
  const [q, setQ] = useState("");
  const have = new Set(s.pantry.map((p) => p.ingredientId));
  const matches = q.length >= 2 ? Object.values(INGREDIENTS).filter((i) => i.name.toLowerCase().includes(q.toLowerCase()) && !have.has(i.id)).slice(0, 8) : [];

  const food = s.pantry.filter((p) => p.grams !== Infinity && INGREDIENTS[p.ingredientId]);
  const staples = s.pantry.filter((p) => p.grams === Infinity && INGREDIENTS[p.ingredientId])
    .sort((a, b) => INGREDIENTS[a.ingredientId]!.name.localeCompare(INGREDIENTS[b.ingredientId]!.name));
  const soon = food.filter((p) => p.useBy && daysUntil(p.useBy) <= 2);
  const groups = new Map<Storage, PantryRow[]>();
  for (const p of [...food].sort((a, b) =>
    (a.useBy ? daysUntil(a.useBy) : 1e9) - (b.useBy ? daysUntil(b.useBy) : 1e9) ||
    INGREDIENTS[a.ingredientId]!.name.localeCompare(INGREDIENTS[b.ingredientId]!.name))) {
    const k = storageOf(p.ingredientId);
    groups.set(k, [...(groups.get(k) ?? []), p]);
  }
  // the pantry the current plan was built from is the one it saved money against
  const saved = s.current ? pantrySavings(s.current.result.pantryUsed, s.pantryForPlan ?? s.pantry, s.priceOverrides) : 0;
  const ideas = useMemo(
    () => cookFromPantry(s.pantry, RECIPES.filter((r) => !hardRejection(r, s.prefs)), { soonIds: new Set(soon.map((p) => p.ingredientId)), limit: 3 }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [s.pantry, s.prefs],
  );

  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1fr)_320px]">
      <div className="grid min-w-0 content-start gap-4">
        <Card>
          <dl className="grid grid-cols-3 gap-3 text-center">
            <div><dt className="text-xs text-muted">At home</dt><dd className="num font-display text-2xl font-bold">{food.length}</dd></div>
            <div><dt className="text-xs text-muted">Use soon</dt><dd className={cx("num font-display text-2xl font-bold", soon.length > 0 && "text-warn")}>{soon.length}</dd></div>
            <div><dt className="text-xs text-muted">Saved this week</dt><dd className="num font-display text-2xl font-bold">{money(saved)}</dd></div>
          </dl>
          {soon.length > 0 && (
            <p role="status" className="mt-3 rounded-lg bg-warn-soft p-3 text-sm">
              <b>Use soon:</b> {soon.map((p) => INGREDIENTS[p.ingredientId]!.name).join(", ")}. The plan picks recipes that use these up first.
            </p>
          )}
        </Card>
        {food.length === 0 ? (
          <Card><p className="text-sm text-muted">Nothing here yet. Add what&apos;s in your kitchen, or tap Done shopping on the grocery list and the leftovers land here.</p></Card>
        ) : STORAGE_ORDER.filter((k) => groups.has(k)).map((k) => (
          <Card key={k}>
            <SectionTitle aside={<span className="text-sm text-muted">{groups.get(k)!.length}</span>}>{STORAGE_LABEL[k]}</SectionTitle>
            <ul className="divide-y divide-line">{groups.get(k)!.map((p) => <PantryLine key={p.ingredientId} p={p} />)}</ul>
          </Card>
        ))}
        {staples.length > 0 && (
          <Card>
            <SectionTitle>Always have</SectionTitle>
            <p className="mb-2 text-sm text-muted">Staples the plan treats as free. Tap one you&apos;ve run out of.</p>
            <ul className="flex flex-wrap gap-2">
              {staples.map((p) => (
                <li key={p.ingredientId}>
                  <button className="btn btn-sm" onClick={() => s.setPantryAmount(p.ingredientId, null)}>
                    {INGREDIENTS[p.ingredientId]!.name} <X size={12} aria-hidden /><span className="sr-only">: ran out, remove</span>
                  </button>
                </li>
              ))}
            </ul>
          </Card>
        )}
      </div>
      <aside className="grid content-start gap-4">
        <Card>
          <label htmlFor="add-pantry" className="label">Add to pantry</label>
          <input id="add-pantry" className="input mt-1.5" placeholder="Search ingredients" value={q} onChange={(e) => setQ(e.target.value)} />
          <div className="mt-2 flex flex-wrap gap-2">
            {matches.map((i) => <Chip key={i.id} selected={false} onClick={() => { s.setPantryAmount(i.id, i.pkg.grams); setQ(""); }}><Plus size={12} className="inline" aria-hidden /> {i.name}</Chip>)}
          </div>
          <p className="mt-3 text-xs text-muted">New items start as one full package with a use-by date set for you. Next week&apos;s plan uses them first, so you buy less.</p>
        </Card>
        {ideas.length > 0 && (
          <Card>
            <SectionTitle>Cook from your pantry</SectionTitle>
            <ul className="grid gap-3">
              {ideas.map((m) => (
                <li key={m.recipe.id} className="flex items-start gap-2.5">
                  <ChefHat size={18} className="mt-0.5 shrink-0 text-accent" aria-hidden />
                  <div className="min-w-0 text-sm">
                    <Link href={recipeHref(m.recipe.id)} prefetch={false} className="font-semibold hover:underline">{m.recipe.name}</Link>
                    <div className="text-xs text-muted">
                      {m.missing.length === 0 ? "You have everything" : `You have ${m.have.length} of ${m.have.length + m.missing.length} ingredients`}
                      {m.usesSoon.length > 0 && <> · uses up {m.usesSoon.map((id) => INGREDIENTS[id]!.name.toLowerCase()).join(", ")}</>}
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          </Card>
        )}
      </aside>
    </div>
  );
}
