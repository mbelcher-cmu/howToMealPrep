"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { ArrowLeft, Link2, Plus, Trash2, Wand2 } from "lucide-react";
import { CUISINES, draftToSeed, INGREDIENTS, nutritionOf, parseLine, parseRecipe, type MealType, type RecipeDraft } from "@prep-cart/catalog";
import { Card, NumberField, PageHeader, SectionTitle, Segmented } from "@/components/ui";
import { useApp } from "@/lib/store";
import { recipeHref } from "@/lib/format";
import { Paywall } from "@/components/paywall";
import { useEntitlements } from "@/lib/entitlements";

const ING_OPTIONS = Object.values(INGREDIENTS).sort((a, b) => a.name.localeCompare(b.name));

export default function ImportRecipe() {
  const s = useApp();
  const router = useRouter();
  const ent = useEntitlements();
  const atLimit = !ent.canAdd("recipeImport", s.customRecipes.length);
  const [url, setUrl] = useState("");
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState("");
  const [draft, setDraft] = useState<RecipeDraft | null>(null);
  const [cuisine, setCuisine] = useState("american");
  const [freezer, setFreezer] = useState(false);

  const fromLink = async () => {
    setBusy(true); setNote("");
    try {
      const res = await fetch(url, { mode: "cors" });
      if (!res.ok) throw new Error(String(res.status));
      const d = parseRecipe(await res.text(), url);
      if (!d.lines.length) throw new Error("no recipe");
      setDraft(d);
    } catch {
      setNote("That site doesn't let other apps read its pages. Open the recipe, select everything on the page (Ctrl+A or ⌘A), copy, and paste it below. Paste the page source for the best results.");
    } finally { setBusy(false); }
  };
  const fromText = () => {
    const d = parseRecipe(text, /^https?:\/\//.test(url) ? url : undefined);
    if (!d.lines.length) { setNote("I couldn't find an ingredient list. Make sure the paste includes the ingredients, one per line."); return; }
    setNote(""); setDraft(d);
  };

  const seed = useMemo(() => (draft ? draftToSeed(draft, "custom_preview", cuisine, 4, freezer) : null), [draft, cuisine, freezer]);
  const per = useMemo(() => (seed && seed.items.length ? nutritionOf(seed.items.map(([ingredientId, grams]) => ({ ingredientId, grams })), seed.meta.serv) : null), [seed]);
  const unresolved = draft?.lines.filter((l) => !l.ingredientId || !l.grams).length ?? 0;

  const edit = (patch: Partial<RecipeDraft>) => draft && setDraft({ ...draft, ...patch });
  const editLine = (i: number, patch: Partial<RecipeDraft["lines"][number]>) => draft && setDraft({ ...draft, lines: draft.lines.map((l, j) => (j === i ? { ...l, ...patch, sure: true } : l)) });
  const save = () => {
    if (!draft || !seed?.items.length || atLimit) return;
    const id = `custom_${Date.now().toString(36)}`;
    s.set({ customRecipes: [...s.customRecipes, { ...draftToSeed(draft, id, cuisine, 4, freezer) }] });
    router.push(recipeHref(id));
  };

  return (
    <>
      <Link href="/recipes/" className="-ml-1 mb-2 inline-flex min-h-[44px] items-center gap-1.5 px-1 text-sm font-medium text-muted hover:text-ink"><ArrowLeft size={16} aria-hidden /> All recipes</Link>
      <PageHeader title="Add a recipe" lead="Bring in a recipe from a link or paste it. Each ingredient is matched to the store catalog so the planner can price it and count its macros." />
      {atLimit && !draft ? (
        <div className="max-w-[760px]">
          <Paywall feature="recipeImport">You've added {s.customRecipes.length} of your own recipes, the most a free plan holds. They all stay in your recipe book. Plus lets you add as many as you like.</Paywall>
        </div>
      ) : !draft ? (
        <div className="grid max-w-[760px] gap-4">
          <Card>
            <SectionTitle>From a link</SectionTitle>
            <div className="flex flex-wrap gap-2">
              <input aria-label="Recipe link" className="input min-w-0 flex-1" type="url" placeholder="https://…" value={url} onChange={(e) => setUrl(e.target.value)} />
              <button className="btn btn-primary" onClick={fromLink} disabled={busy || !/^https?:\/\/\S+\.\S+/.test(url)}><Link2 size={16} aria-hidden /> {busy ? "Reading…" : "Import"}</button>
            </div>
            {note && <p role="status" className="mt-2 text-sm text-warn">{note}</p>}
          </Card>
          <Card>
            <SectionTitle>Paste a recipe</SectionTitle>
            <textarea aria-label="Recipe text" className="input min-h-[220px] w-full font-mono text-sm" placeholder={"Greek Chicken Bowls\nServes 4\nIngredients\n1.5 lb chicken breast\n1 cup quinoa\n…\nInstructions\n1. …"} value={text} onChange={(e) => setText(e.target.value)} />
            <button className="btn btn-primary mt-2" onClick={fromText} disabled={text.trim().length < 20}><Wand2 size={16} aria-hidden /> Read recipe</button>
          </Card>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1fr)_300px]">
          <div className="grid min-w-0 content-start gap-4">
            <Card>
              <SectionTitle>Recipe</SectionTitle>
              <div className="grid gap-3">
                <div className="grid gap-1">
                  <label htmlFor="r-name" className="text-[13px] text-muted">Name</label>
                  <input id="r-name" className="input" value={draft.name} maxLength={80} onChange={(e) => edit({ name: e.target.value })} />
                </div>
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                  <NumberField compact label="Servings" value={draft.servings} min={1} max={12} onChange={(servings) => edit({ servings })} />
                  <NumberField compact label="Hands-on" value={draft.activeMinutes} min={0} max={240} suffix="min" onChange={(activeMinutes) => edit({ activeMinutes })} />
                  <NumberField compact label="Total" value={draft.totalMinutes} min={1} max={720} suffix="min" onChange={(totalMinutes) => edit({ totalMinutes })} />
                  <div className="grid gap-1">
                    <label htmlFor="r-cuisine" className="text-[13px] text-muted">Cuisine</label>
                    <select id="r-cuisine" className="input" value={cuisine} onChange={(e) => setCuisine(e.target.value)}>
                      {Object.entries(CUISINES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                    </select>
                  </div>
                </div>
                <div className="flex flex-wrap items-end gap-4">
                  <div className="grid gap-1">
                    <span className="text-[13px] text-muted">Meal</span>
                    <Segmented size="sm" label="Meal" value={draft.meal} onChange={(meal: MealType) => edit({ meal })} options={[{ value: "breakfast", label: "Breakfast" }, { value: "main", label: "Lunch or dinner" }, { value: "snack", label: "Snack" }]} />
                  </div>
                  <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={freezer} onChange={(e) => setFreezer(e.target.checked)} /> Freezes well</label>
                </div>
              </div>
            </Card>
            <Card>
              <SectionTitle aside={unresolved ? <span className="text-xs text-warn">{unresolved} to check</span> : undefined}>Ingredients</SectionTitle>
              <ul className="grid gap-3">
                {draft.lines.map((l, i) => (
                  <li key={i} className={`grid gap-2 rounded-lg border p-2.5 ${!l.ingredientId || !l.grams ? "border-warn" : !l.sure ? "border-carbs" : "border-line"}`}>
                    <p className="text-sm">{l.raw}</p>
                    <div className="flex flex-wrap items-center gap-2">
                      <select aria-label={`Ingredient for ${l.raw}`} className="input min-w-0 flex-1" value={l.ingredientId ?? ""} onChange={(e) => editLine(i, { ingredientId: e.target.value || null })}>
                        <option value="">Leave out</option>
                        {ING_OPTIONS.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
                      </select>
                      <div className="w-28"><NumberField compact label="Grams" value={l.grams ?? 0} min={0} max={5000} suffix="g" onChange={(grams) => editLine(i, { grams })} /></div>
                      <button className="grid h-9 w-9 place-items-center rounded-lg text-muted hover:bg-sunk" aria-label={`Remove ${l.raw}`} onClick={() => edit({ lines: draft.lines.filter((_, j) => j !== i) })}><Trash2 size={16} aria-hidden /></button>
                    </div>
                    {l.ingredientId && l.grams && !l.sure && <p className="text-xs text-muted">Amount estimated from a cup or count. Check it if you can.</p>}
                  </li>
                ))}
              </ul>
              <button className="btn btn-sm mt-3" onClick={() => { const raw = window.prompt("Ingredient line, like \"2 cups spinach\""); if (!raw) return; const p = parseLine(raw); edit({ lines: [...draft.lines, p === "skip" ? { raw, ingredientId: null, grams: null, sure: false } : p] }); }}><Plus size={14} aria-hidden /> Add an ingredient</button>
              {draft.skipped.length > 0 && <p className="mt-3 text-xs text-muted">Assumed on hand: {draft.skipped.join("; ")}.</p>}
            </Card>
            <Card>
              <SectionTitle>Steps</SectionTitle>
              <textarea aria-label="Steps, one per line" className="input min-h-[160px] w-full text-sm" value={draft.steps.join("\n")} onChange={(e) => edit({ steps: e.target.value.split("\n").map((x) => x.trim()).filter(Boolean) })} />
            </Card>
          </div>
          <aside className="grid content-start gap-4 lg:sticky lg:top-6 lg:self-start">
            <Card>
              <SectionTitle>Per serving</SectionTitle>
              {per ? (
                <>
                  <div className="num text-[28px] font-semibold leading-none">{per.kcal}<span className="text-sm font-normal text-muted"> kcal</span></div>
                  <dl className="num mt-3 grid grid-cols-3 gap-2 text-sm">
                    <div><dt className="label">Protein</dt><dd className="font-semibold text-protein">{per.protein} g</dd></div>
                    <div><dt className="label">Carbs</dt><dd className="font-semibold text-carbs">{per.carbs} g</dd></div>
                    <div><dt className="label">Fat</dt><dd className="font-semibold text-fat">{per.fat} g</dd></div>
                  </dl>
                </>
              ) : <p className="text-sm text-muted">Match at least one ingredient.</p>}
              <button className="btn btn-primary mt-4 w-full" onClick={save} disabled={!per || !draft.name.trim() || atLimit}>Save to my recipes</button>
              <button className="btn mt-2 w-full" onClick={() => setDraft(null)}>Start over</button>
              <p className="mt-3 text-xs text-muted">Saved recipes join the planner's library and can be rated like any other.</p>
            </Card>
          </aside>
        </div>
      )}
    </>
  );
}
