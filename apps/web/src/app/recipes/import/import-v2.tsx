"use client";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { ArrowLeft, Bookmark, Check, CircleAlert, PenLine, Plus, Trash2, Wand2 } from "lucide-react";
import {
  amountFor, buildRecipe, CUISINES, draftFromRecipeNode, draftLine, draftToSeed, INGREDIENTS, nutritionOf, parseRecipe, seedToDraft,
  type DraftLine, type MealType, type RecipeDraft,
} from "@prep-cart/catalog";
import { buildPriceTable, servingCost } from "@prep-cart/planner";
import { Card, NumberField, PageHeader, SectionTitle, Segmented } from "@/components/ui";
import { Paywall } from "@/components/paywall";
import { useEntitlements } from "@/lib/entitlements";
import { useApp } from "@/lib/store";
import { useHydrated } from "@/lib/use-planner";
import { money, recipeHref } from "@/lib/format";
import { bookmarkletHref, readBookmarkPayload } from "@/lib/bookmarklet";

const V2 = { v2: true } as const;
const ING_OPTIONS = Object.values(INGREDIENTS).sort((a, b) => a.name.localeCompare(b.name));
const isLink = (t: string) => /^https?:\/\/\S+\.\S+$/i.test(t.trim());
const BLANK: RecipeDraft = { name: "", servings: 4, activeMinutes: 20, totalMinutes: 40, meal: "main", equipment: ["stovetop"], proteins: [], lines: [], steps: [], skipped: [] };

type Status = "ok" | "check" | "missing";
const statusOf = (l: DraftLine): Status => (!l.ingredientId || !l.grams ? "missing" : l.sure ? "ok" : "check");

/** Recipe import, second version: one box for a link or text, a bookmark for any site, edit, cost and add to plan. */
export function ImportV2() {
  const s = useApp();
  const hydrated = useHydrated();
  const router = useRouter();
  const editId = useSearchParams().get("edit");
  const ent = useEntitlements();
  // editing a recipe you already have is always allowed; a new one counts toward the free limit
  const atLimit = !(editId && s.customRecipes.some((c) => c.id === editId)) && !ent.canAdd("recipeImport", s.customRecipes.length);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState("");
  const [draft, setDraft] = useState<RecipeDraft | null>(null);
  const [cuisine, setCuisine] = useState("american");
  const [freezer, setFreezer] = useState(false);
  const [fridge, setFridge] = useState(4);
  const [newLine, setNewLine] = useState("");
  const [bookmark, setBookmark] = useState("");
  const loaded = useRef(false);

  // Open a saved recipe to edit, or a recipe the bookmark sent.
  useEffect(() => {
    if (!hydrated || loaded.current) return;
    loaded.current = true;
    setBookmark(bookmarkletHref(window.location.origin + window.location.pathname));
    if (editId) {
      const seed = s.customRecipes.find((c) => c.id === editId);
      if (seed) { setDraft(seedToDraft(seed)); setCuisine(seed.cuisines.split(/\s+/)[0] || "american"); setFreezer(!!seed.meta.freezer); setFridge(seed.meta.fridge); }
      return;
    }
    const sent = readBookmarkPayload(window.location.hash);
    if (!sent) return;
    history.replaceState(null, "", window.location.pathname + window.location.search);
    const d = sent.recipe ? draftFromRecipeNode(sent.recipe, sent.url || undefined, V2) : parseRecipe(sent.text ?? "", sent.url || undefined, V2);
    if (d.lines.length) setDraft(d);
    else { setInput(sent.text ?? ""); setNote("I couldn't find the ingredients on that page. Select the recipe on the page, then press the bookmark again, or paste it here."); }
  }, [hydrated, editId, s.customRecipes]);

  const read = async () => {
    const text = input.trim();
    setNote("");
    if (isLink(text)) {
      setBusy(true);
      try {
        const res = await fetch(text, { mode: "cors" });
        if (!res.ok) throw new Error(String(res.status));
        const d = parseRecipe(await res.text(), text, V2);
        if (!d.lines.length) throw new Error("no recipe");
        setDraft(d);
      } catch {
        setNote("That site doesn't let other apps read its pages. Open the recipe, copy the ingredients and steps, and paste them here instead. On a computer, the bookmark below does this in one click.");
      } finally { setBusy(false); }
      return;
    }
    const d = parseRecipe(text, undefined, V2);
    if (!d.lines.length) { setNote("I couldn't find an ingredient list. Make sure the paste includes the ingredients, one per line."); return; }
    setDraft(d);
  };

  const seed = useMemo(() => (draft ? draftToSeed(draft, editId ?? "custom_preview", cuisine, fridge, freezer) : null), [draft, cuisine, freezer, fridge, editId]);
  const per = useMemo(() => (seed && seed.items.length ? nutritionOf(seed.items.map(([ingredientId, grams]) => ({ ingredientId, grams })), seed.meta.serv) : null), [seed]);
  const cost = useMemo(() => {
    if (!seed?.items.length) return null;
    try { return servingCost(buildRecipe(seed), buildPriceTable(s.priceOverrides), s.stores, new Set()); } catch { return null; }
  }, [seed, s.priceOverrides, s.stores]);
  const counts = useMemo(() => {
    const c = { ok: 0, check: 0, missing: 0 };
    for (const l of draft?.lines ?? []) c[statusOf(l)]++;
    return c;
  }, [draft]);

  const edit = (patch: Partial<RecipeDraft>) => draft && setDraft({ ...draft, ...patch });
  const editLine = (i: number, patch: Partial<DraftLine>) => draft && setDraft({ ...draft, lines: draft.lines.map((l, j) => (j === i ? { ...l, ...patch, sure: true } : l)) });
  /** Pick a catalog item for a line, working the amount out from the line when it has none yet. */
  const pick = (i: number, id: string | null) => {
    if (!draft) return;
    const l = draft.lines[i]!;
    if (!id) return editLine(i, { ingredientId: null, suggestions: undefined });
    const a = l.grams ? null : amountFor(l.raw, id, V2);
    const grams = a && a !== "skip" ? a.grams : l.grams;
    setDraft({ ...draft, lines: draft.lines.map((x, j) => (j === i ? { ...x, ingredientId: id, grams, sure: a && a !== "skip" ? a.sure : x.sure, suggestions: undefined } : x)) });
  };
  const addLine = () => {
    const raw = newLine.trim();
    if (!raw || !draft) return;
    const p = draftLine(raw, V2);
    edit({ lines: [...draft.lines, p === "skip" ? { raw, ingredientId: null, grams: null, sure: false } : p] });
    setNewLine("");
  };
  const save = (addToPlan: boolean) => {
    if (!draft || !seed?.items.length || atLimit) return;
    const id = editId && s.customRecipes.some((c) => c.id === editId) ? editId : `custom_${Date.now().toString(36)}`;
    const next = draftToSeed(draft, id, cuisine, fridge, freezer);
    const list = s.customRecipes.some((c) => c.id === id) ? s.customRecipes.map((c) => (c.id === id ? next : c)) : [...s.customRecipes, next];
    s.set({ customRecipes: list });
    if (addToPlan && !s.locked.includes(id)) s.toggleLock(id);
    router.push(recipeHref(id));
  };

  const editing = !!editId && !!draft;

  return (
    <>
      <Link href="/recipes/" className="mb-4 inline-flex items-center gap-1.5 text-sm text-muted hover:text-ink"><ArrowLeft size={16} aria-hidden /> All recipes</Link>
      <PageHeader title={editing ? "Edit recipe" : "Add a recipe"} lead={editing ? "Change anything, then save. Your plan picks up the new amounts." : "Paste a link or a whole recipe. Each ingredient is matched to store items so the planner can price it and count its macros."} />
      {atLimit && <Paywall feature="recipeImport">You've added {s.customRecipes.length} of your own recipes, the most a free plan holds. They all stay in your recipe book. Plus lets you add as many as you like.</Paywall>}
      {!draft ? (
        <div className="grid max-w-[760px] gap-4">
          <Card>
            <label htmlFor="r-input" className="mb-2 block font-display text-lg font-bold">Paste a recipe or a link</label>
            <textarea id="r-input" rows={9} style={{ minHeight: 200, height: "auto" }} className="input w-full text-sm" placeholder={"https://… or\n\nGreek Chicken Bowls\nServes 4\nIngredients\n1.5 lb chicken breast\n1 cup quinoa\n…\nInstructions\n1. …"} value={input} onChange={(e) => setInput(e.target.value)} />
            {note && <p role="status" className="mt-2 text-sm text-warn">{note}</p>}
            <div className="mt-3 flex flex-wrap gap-2">
              <button className="btn btn-primary" onClick={read} disabled={busy || !(isLink(input) || input.trim().length >= 20)}><Wand2 size={16} aria-hidden /> {busy ? "Reading…" : "Read recipe"}</button>
              <button className="btn" onClick={() => setDraft({ ...BLANK, lines: [] })}><PenLine size={16} aria-hidden /> Write my own</button>
            </div>
          </Card>
          {bookmark && (
            <Card className="hidden sm:block">
              <SectionTitle>Save from any recipe site</SectionTitle>
              <p className="text-sm text-muted">Drag this button to your bookmarks bar. On any recipe page, click it and the recipe opens here, ready to check.</p>
              {/* a javascript: link has to be set outside React, which blocks them in href */}
              <a ref={(el) => { el?.setAttribute("href", bookmark); }} className="btn mt-3" draggable onClick={(e) => { e.preventDefault(); setNote("Drag the button to your bookmarks bar, then use it on a recipe page."); }}><Bookmark size={16} aria-hidden /> Save to MacroAisle</a>
            </Card>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1fr)_300px]">
          <div className="grid min-w-0 content-start gap-4">
            <Card>
              <SectionTitle>Recipe</SectionTitle>
              <div className="grid gap-3">
                <div className="grid gap-1">
                  <label htmlFor="r-name" className="text-[13px] text-muted">Name</label>
                  <input id="r-name" className="input" value={draft.name} maxLength={80} placeholder="My chicken burrito bowls" onChange={(e) => edit({ name: e.target.value })} />
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
                  <div className="w-32"><NumberField compact label="Keeps in fridge" value={fridge} min={1} max={7} suffix="days" onChange={setFridge} /></div>
                  <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={freezer} onChange={(e) => setFreezer(e.target.checked)} /> Freezes well</label>
                </div>
              </div>
            </Card>
            <Card>
              <SectionTitle aside={draft.lines.length ? <span className="text-xs text-muted">{counts.ok} matched{counts.check ? ` · ${counts.check} to check` : ""}{counts.missing ? ` · ${counts.missing} not matched` : ""}</span> : undefined}>Ingredients</SectionTitle>
              {draft.lines.length === 0 && <p className="mb-3 text-sm text-muted">Add ingredients one at a time, like &ldquo;1 lb chicken breast&rdquo; or &ldquo;2 cups rice&rdquo;.</p>}
              <ul className="grid gap-3">
                {draft.lines.map((l, i) => {
                  const st = statusOf(l);
                  return (
                    <li key={i} className={`grid gap-2 rounded-lg border p-2.5 ${st === "missing" ? "border-warn" : st === "check" ? "border-carbs" : "border-line"}`}>
                      <p className="flex items-start gap-2 text-sm">
                        {st === "ok" ? <Check size={16} className="mt-0.5 shrink-0 text-accent" aria-label="Matched" /> : <CircleAlert size={16} className="mt-0.5 shrink-0 text-warn" aria-label={st === "check" ? "Check the amount" : "Not matched"} />}
                        <span className="min-w-0">{l.raw}</span>
                      </p>
                      <div className="flex flex-wrap items-center gap-2">
                        <select aria-label={`Store item for ${l.raw}`} className="input min-w-0 flex-1" value={l.ingredientId ?? ""} onChange={(e) => pick(i, e.target.value || null)}>
                          <option value="">Leave out</option>
                          {ING_OPTIONS.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
                        </select>
                        <div className="w-28"><NumberField compact label="Grams" value={l.grams ?? 0} min={0} max={5000} suffix="g" onChange={(grams) => editLine(i, { grams })} /></div>
                        <button className="grid h-9 w-9 place-items-center rounded-lg text-muted hover:bg-sunk" aria-label={`Remove ${l.raw}`} onClick={() => edit({ lines: draft.lines.filter((_, j) => j !== i) })}><Trash2 size={16} aria-hidden /></button>
                      </div>
                      {!l.ingredientId && l.suggestions?.length ? (
                        <div className="flex flex-wrap items-center gap-1.5 text-xs">
                          <span className="text-muted">Did you mean</span>
                          {l.suggestions.map((id) => <button key={id} className="btn btn-sm" onClick={() => pick(i, id)}>{INGREDIENTS[id]?.name}</button>)}
                        </div>
                      ) : null}
                      {!l.ingredientId && !l.suggestions?.length && <p className="text-xs text-muted">Not in the store list yet. Pick the closest item, or leave it out if it&rsquo;s a small amount.</p>}
                      {st === "check" && <p className="text-xs text-muted">Amount estimated from a cup or count. Check it if you can.</p>}
                    </li>
                  );
                })}
              </ul>
              <div className="mt-3 flex flex-wrap gap-2">
                <input aria-label="New ingredient line" className="input min-w-0 flex-1" placeholder="2 cups spinach" value={newLine} onChange={(e) => setNewLine(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addLine(); } }} />
                <button className="btn" onClick={addLine} disabled={!newLine.trim()}><Plus size={16} aria-hidden /> Add</button>
              </div>
              {draft.skipped.length > 0 && <p className="mt-3 text-xs text-muted">Assumed on hand: {draft.skipped.join("; ")}.</p>}
            </Card>
            <Card>
              <label htmlFor="r-steps" className="mb-3 block font-display text-lg font-bold">Steps</label>
              <textarea id="r-steps" rows={6} style={{ minHeight: 160, height: "auto" }} className="input w-full text-sm" placeholder="One step per line" value={draft.steps.join("\n")} onChange={(e) => edit({ steps: e.target.value.split("\n").map((x) => x.trim()).filter(Boolean) })} />
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
                  {cost != null && <p className="num mt-3 text-sm text-muted">About <span className="font-semibold text-ink">{money(cost)}</span> a serving at your stores</p>}
                </>
              ) : <p className="text-sm text-muted">Match at least one ingredient.</p>}
              <button className="btn btn-primary mt-4 w-full" onClick={() => save(true)} disabled={!per || !draft.name.trim() || atLimit}>{editing ? "Save changes" : "Save and add to my plan"}</button>
              {!editing && <button className="btn mt-2 w-full" onClick={() => save(false)} disabled={!per || !draft.name.trim() || atLimit}>Just save it</button>}
              <button className="btn mt-2 w-full" onClick={() => (editing ? router.push(recipeHref(editId!)) : setDraft(null))}>{editing ? "Cancel" : "Start over"}</button>
              <p className="mt-3 text-xs text-muted">{editing ? "" : "\"Add to my plan\" puts it in every week until you take it out. "}Saved recipes can be rated like any other.</p>
            </Card>
          </aside>
        </div>
      )}
    </>
  );
}
