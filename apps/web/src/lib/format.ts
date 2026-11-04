import { CHAINS, type ChainId } from "@prep-cart/catalog";

export const money = (n: number) => `$${n.toFixed(2)}`;
export const chainName = (id: ChainId) => CHAINS.find((c) => c.id === id)?.name ?? id;
export const DAY_NAMES = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
export const DAY_LONG = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];
export const fmtServings = (n: number) => {
  const s = Number.isInteger(n) ? String(n) : n.toFixed(2).replace(/0$/, "");
  return `${s} serving${n === 1 ? "" : "s"}`;
};
export function cx(...parts: (string | false | null | undefined)[]) {
  return parts.filter(Boolean).join(" ");
}

/** Link to a recipe. The person's own recipes have no prebuilt page, so they share one page. */
export const recipeHref = (id: string) => (id.startsWith("custom_") ? `/recipes/mine/?id=${encodeURIComponent(id)}` : `/recipes/${id}/`);
