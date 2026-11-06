"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { ArrowLeft, Droplet, Drumstick, Flame, Lock, LockOpen, PenLine, Trash2, Wheat } from "lucide-react";
import { useFlag } from "@/lib/flags";
import { ALLERGENS, DIETS, EQUIPMENT, formatAmount, INGREDIENTS, MOODS, processedIn, RECIPES_BY_ID } from "@prep-cart/catalog";
import { macroShares } from "@prep-cart/nutrition";
import { buildPriceTable, hardRejection, servingCost } from "@prep-cart/planner";
import { useChains } from "@/lib/bulk";
import { RecipeMeta } from "@/components/plan-bits";
import { RecipeArt } from "@/components/food";
import { MatchLine } from "@/components/picks";
import { Card, SectionTitle, Stars, Stepper, Tag } from "@/components/ui";
import { useApp } from "@/lib/store";
import { useHydrated } from "@/lib/use-planner";
import { money } from "@/lib/format";

export function RecipeDetail({ id }: { id: string }) {
  const r = RECIPES_BY_ID[id]!;
  const hydrated = useHydrated();
  const s = useApp();
  const chains = useChains();
  const [servings, setServings] = useState(r.servings);
  const v2 = useFlag("redesign");
  const wholeOn = useFlag("wholeFoods");
  const processed = processedIn(r).map((i) => INGREDIENTS[i]?.name ?? i);
  const importV2 = useFlag("recipeImportV2");
  const scale = servings / r.servings;
  const prices = useMemo(() => buildPriceTable(s.priceOverrides), [s.priceOverrides]);
  const n = r.perServing;
  const shares = macroShares(n);
  const rejected = hydrated ? hardRejection(r, s.prefs) : null;
  const locked = s.locked.includes(r.id);
  const inPlan = s.current?.result.recipes.some((p) => p.recipe.id === r.id);
  const router = useRouter();
  const mine = r.id.startsWith("custom_");
  const source = mine ? s.customRecipes.find((c) => c.id === r.id) : undefined;

  return (
    <article>
      <Link href="/recipes/" className="-ml-1 mb-2 inline-flex min-h-[44px] items-center gap-1.5 px-1 text-sm font-medium text-muted hover:text-ink"><ArrowLeft size={16} aria-hidden /> All recipes</Link>
      <RecipeArt recipe={r} className="mb-4 aspect-[16/9] w-full rounded-card sm:aspect-[5/2]" />
      <header className="mb-5 grid gap-4 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-start">
        <div className="min-w-0">
          <div className="flex flex-wrap gap-1.5"><Tag>{r.mealType}</Tag>{r.moods.map((m) => <Tag key={m}>{MOODS[m]}</Tag>)}</div>
          <h1 className="mt-1 font-display text-[28px] font-bold leading-tight sm:text-[32px]">{r.name}</h1>
          <div className="mt-1"><RecipeMeta recipe={r} /></div>
          {hydrated && (
            <div className="mt-2 flex flex-wrap items-center gap-3">
              <Stars value={s.ratings[r.id]} onChange={(v) => { const { [r.id]: _old, ...rest } = s.ratings; void _old; s.set({ ratings: v ? { ...rest, [r.id]: v } : rest }); }} />
              {mine && <button className="btn btn-sm text-warn" onClick={() => { if (window.confirm(`Delete ${r.name}?`)) { s.set({ customRecipes: s.customRecipes.filter((c) => c.id !== r.id), locked: s.locked.filter((x) => x !== r.id) }); router.push("/recipes/"); } }}><Trash2 size={14} aria-hidden /> Delete my recipe</button>}
              {mine && importV2 && <Link href={`/recipes/import/?edit=${encodeURIComponent(r.id)}`} className="btn btn-sm"><PenLine size={14} aria-hidden /> Edit</Link>}
              {source?.source && /^https?:\/\//i.test(source.source) && <a className="text-xs text-muted underline" href={source.source} target="_blank" rel="noreferrer">Original recipe</a>}
            </div>
          )}
          {hydrated && <div className="mt-1"><MatchLine id={r.id} /></div>}
        </div>
        {hydrated && (
          <button className={locked ? "btn btn-primary w-full sm:w-auto" : "btn w-full sm:w-auto"} onClick={() => s.toggleLock(r.id)} aria-pressed={locked} disabled={!!rejected && !locked}>
            {locked ? <><Lock size={16} aria-hidden /> In every plan</> : <><LockOpen size={16} aria-hidden /> Add to my plan</>}
          </button>
        )}
      </header>
      {rejected && <p role="note" className="card mb-4 border-warn bg-warn-soft p-3 text-sm">This recipe doesn't fit your rules: it {rejected}.</p>}
      {hydrated && inPlan && !locked && <p className="mb-4 text-sm text-muted">It's in this week's plan.</p>}

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,320px)_minmax(0,1fr)]">
        <div className="grid content-start gap-4">
          <Card>
            <SectionTitle>Per serving</SectionTitle>
            {v2 ? (
              <>
                <div className="flex items-center gap-4">
                  <span className="grid h-14 w-14 place-items-center rounded-2xl bg-sunk" aria-hidden><Flame size={24} /></span>
                  <div><p className="text-sm text-muted">Calories</p><p className="num text-[34px] font-bold leading-none">{n.kcal}</p></div>
                </div>
                <dl className="num mt-4 grid grid-cols-3 gap-2">
                  {([["Protein", n.protein, Drumstick, "text-protein"], ["Carbs", n.carbs, Wheat, "text-carbs"], ["Fat", n.fat, Droplet, "text-fat"]] as const).map(([label, g, Icon, color]) => (
                    <div key={label} className="rounded-2xl border border-line p-3">
                      <dt className="flex items-center gap-1.5 text-[13px] text-muted"><Icon size={14} className={color} aria-hidden /> {label}</dt>
                      <dd className="mt-0.5 text-[18px] font-bold">{g}g</dd>
                    </div>
                  ))}
                </dl>
                <p className="num mt-3 text-sm text-muted">Fiber {n.fiber} g · Sodium {n.sodiumMg.toLocaleString()} mg</p>
              </>
            ) : (<>
            <div className="num text-[28px] font-semibold leading-none">{n.kcal}<span className="text-sm font-normal text-muted"> kcal</span></div>
            <dl className="num mt-3 grid grid-cols-3 gap-2 text-sm">
              <div><dt className="label">Protein</dt><dd className="font-semibold text-protein">{n.protein} g</dd></div>
              <div><dt className="label">Carbs</dt><dd className="font-semibold text-carbs">{n.carbs} g</dd></div>
              <div><dt className="label">Fat</dt><dd className="font-semibold text-fat">{n.fat} g</dd></div>
              <div><dt className="label">Fiber</dt><dd>{n.fiber} g</dd></div>
              <div className="col-span-2"><dt className="label">Sodium</dt><dd>{n.sodiumMg.toLocaleString()} mg</dd></div>
            </dl>
            </>)}
            <div className="mt-3 flex h-2.5 overflow-hidden rounded-full" role="img" aria-label={`Protein ${Math.round(shares.protein * 100)}%, carbs ${Math.round(shares.carbs * 100)}%, fat ${Math.round(shares.fat * 100)}% of calories`}>
              <div style={{ width: `${shares.protein * 100}%` }} className="bg-protein" />
              <div style={{ width: `${shares.carbs * 100}%` }} className="bg-carbs" />
              <div style={{ width: `${shares.fat * 100}%` }} className="bg-fat" />
            </div>
            <p className="mt-2 text-xs text-muted">Calculated from ingredient nutrition (USDA values, rounded). 4 × protein + 4 × carbs + 9 × fat.</p>
          </Card>
          <Card>
            <SectionTitle>Cost per serving</SectionTitle>
            <ul className="grid gap-1 text-sm">
              {chains.map((c) => {
                const missing = r.lines.some((l) => !prices[l.ingredientId]?.[c.id]);
                return (
                  <li key={c.id} className="flex justify-between">
                    <span>{c.name}</span>
                    <span className="num text-muted">{missing ? "Not all items" : money(servingCost(r, prices, [c.id], new Set()))}</span>
                  </li>
                );
              })}
            </ul>
            <p className="mt-2 text-xs text-muted">Ingredient share only, at estimated prices. Whole packages can cost more.</p>
          </Card>
          <Card>
            <SectionTitle>Good to know</SectionTitle>
            <ul className="grid gap-1.5 text-sm">
              <li><span className="text-muted">Fits:</span> {r.diets.filter((d) => d !== "omnivore").map((d) => DIETS[d].label).join(", ") || "No special diets"}</li>
              {wholeOn && processed.length > 0 && <li><span className="text-muted">Processed:</span> {processed.join(", ")}, so it's left out of whole-foods plans</li>}
              <li><span className="text-muted">Contains:</span> {r.allergens.map((a) => ALLERGENS[a]).join(", ") || "None of the 9 major allergens"}</li>
              <li><span className="text-muted">Equipment:</span> {r.equipment.map((e) => EQUIPMENT[e]).join(", ")}</li>
              <li><span className="text-muted">Storage:</span> {r.fridgeDays} days in the fridge{r.freezerFriendly ? ", freezes well" : ""}</li>
              {r.reheat && <li><span className="text-muted">Reheat:</span> {r.reheat}</li>}
            </ul>
          </Card>
        </div>
        <div className="grid content-start gap-4">
          <Card>
            <SectionTitle aside={<div className="w-40"><Stepper label="Servings" value={servings} min={1} max={16} onChange={setServings} /></div>}>Ingredients</SectionTitle>
            <ul className="divide-y divide-line text-sm">
              {r.lines.map((l) => (
                <li key={l.ingredientId} className="flex justify-between gap-3 py-1.5">
                  <span>{INGREDIENTS[l.ingredientId]?.name}</span>
                  <span className="num shrink-0 text-muted">{formatAmount(l.ingredientId, l.grams * scale, s.profile.units)}</span>
                </li>
              ))}
            </ul>
          </Card>
          <Card>
            <SectionTitle>Method</SectionTitle>
            <ol className="grid list-decimal gap-2 pl-5">
              {r.steps.map((st, i) => <li key={i}>{st}</li>)}
            </ol>
          </Card>
        </div>
      </div>
    </article>
  );
}
