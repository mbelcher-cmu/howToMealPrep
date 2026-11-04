"use client";
import Link from "next/link";
import type { CSSProperties, ReactNode } from "react";
import { ChevronRight, Snowflake, Timer } from "lucide-react";
import { INGREDIENTS, type Recipe } from "@prep-cart/catalog";
import { itemImage, recipeImage } from "@/lib/images";
import { cx, money, recipeHref } from "@/lib/format";

const HUES = [140, 28, 200, 340, 48, 265, 170, 12, 220, 90];
export const hueOf = (key: string) => HUES[[...key].reduce((a, c) => a + c.charCodeAt(0), 0) % HUES.length]!;
const tint = (key: string) => ({ "--h": hueOf(key) }) as CSSProperties;

/** A recipe's food art on its tinted tile. Fills its box; size it from outside. */
export function RecipeArt({ recipe, className, badges = true }: { recipe: Recipe; className?: string; badges?: boolean }) {
  const img = recipeImage(recipe);
  return (
    <span aria-hidden className={cx("tint relative grid place-items-center overflow-hidden", className)} style={tint(recipe.id)}>
      {img.kind === "photo"
        ? <img src={img.src} alt="" className="h-full w-full object-cover" loading="lazy" />
        : <img src={img.src} alt="" className="h-[62%] w-[62%] object-contain drop-shadow-[0_6px_10px_rgb(0_0_0/0.15)]" loading="lazy" />}
      {badges && img.kind === "illustration" && img.badges.length > 0 && (
        <span className="absolute bottom-[6%] right-[6%] flex w-full justify-end -space-x-2">
          {img.badges.map((b) => <img key={b.src} src={b.src} alt="" className="aspect-square w-[22%] rounded-full bg-surface/85 p-1 shadow-sm" loading="lazy" />)}
        </span>
      )}
    </span>
  );
}

/** A store item's image: a product photo when known, otherwise its illustration. */
export function ItemArt({ ingredientId, size, className }: { ingredientId: string; size?: number; className?: string }) {
  const img = itemImage(ingredientId);
  const ing = INGREDIENTS[ingredientId];
  return (
    <span aria-hidden className={cx("tint grid shrink-0 place-items-center overflow-hidden rounded-xl", className)} style={{ ...tint(ing?.aisle ?? ingredientId), ...(size ? { width: size, height: size } : {}) }}>
      <img src={img.src} alt="" className={img.kind === "photo" ? "h-full w-full object-cover" : "h-[72%] w-[72%] object-contain"} loading="lazy" />
    </span>
  );
}

export function MacroChips({ recipe, portion = 1 }: { recipe: Recipe; portion?: number }) {
  const n = recipe.perServing;
  return (
    <span className="num flex flex-wrap gap-1">
      <span className="chip-macro bg-sunk text-ink">{Math.round(n.kcal * portion)} kcal</span>
      <span className="chip-macro bg-protein/15 text-protein">{Math.round(n.protein * portion)}g protein</span>
      <span className="chip-macro bg-carbs/15 text-carbs">{Math.round(n.carbs * portion)}g carbs</span>
      <span className="chip-macro bg-fat/15 text-fat">{Math.round(n.fat * portion)}g fat</span>
    </span>
  );
}

/** Image-led recipe card for rails and grids. */
export function RecipeCard({ recipe, portion = 1, eyebrow, footer, wide }: { recipe: Recipe; portion?: number; eyebrow?: ReactNode; footer?: ReactNode; wide?: boolean }) {
  return (
    <article className={cx("card group relative flex flex-col overflow-hidden", wide ? "w-full" : "w-[220px] shrink-0 sm:w-[240px]")}>
      <RecipeArt recipe={recipe} className="aspect-[4/3] w-full" />
      <div className="flex flex-1 flex-col gap-1.5 p-3">
        {eyebrow && <p className="label">{eyebrow}</p>}
        <h3 className="font-display text-[16px] font-bold leading-snug">
          <Link href={recipeHref(recipe.id)} className="after:absolute after:inset-0 hover:underline">{recipe.name}</Link>
        </h3>
        <MacroChips recipe={recipe} portion={portion} />
        <p className="mt-auto flex items-center gap-2 pt-1 text-xs text-muted">
          <span className="inline-flex items-center gap-1"><Timer size={12} aria-hidden /> {recipe.activeMinutes} min</span>
          {recipe.freezerFriendly && <span className="inline-flex items-center gap-1"><Snowflake size={12} aria-hidden /> Freezes</span>}
        </p>
        {footer && <div className="relative z-10">{footer}</div>}
      </div>
    </article>
  );
}

/** Store item card for rails: image, price, name, package. */
export function ItemCard({ ingredientId, price, note, done }: { ingredientId: string; price: number; note?: string; done?: boolean }) {
  const ing = INGREDIENTS[ingredientId];
  if (!ing) return null;
  return (
    <div className={cx("card flex w-[140px] shrink-0 flex-col p-2.5", done && "opacity-60")}>
      <ItemArt ingredientId={ingredientId} className="aspect-square w-full" />
      <p className="num mt-2 text-[17px] font-bold">{money(price)}</p>
      <p className="line-clamp-2 text-[13px] font-medium leading-snug">{ing.name}</p>
      <p className="mt-0.5 text-xs text-muted">{note ?? ing.pkg.label}</p>
    </div>
  );
}

/** A titled, horizontally scrolling row. */
export function Rail({ title, href, linkLabel = "See all", children, lead }: { title: string; href?: string; linkLabel?: string; children: ReactNode; lead?: ReactNode }) {
  return (
    <section className="min-w-0" aria-label={title}>
      <div className="mb-2 flex items-end justify-between gap-3">
        <div>
          <h2 className="font-display text-xl font-bold">{title}</h2>
          {lead && <p className="text-sm text-muted">{lead}</p>}
        </div>
        {href && <Link href={href} className="inline-flex shrink-0 items-center gap-0.5 text-sm font-semibold text-accent hover:underline">{linkLabel} <ChevronRight size={16} aria-hidden /></Link>}
      </div>
      <div className="rail">{children}</div>
    </section>
  );
}
