import { CHAINS, type ChainId } from "@prep-cart/catalog";

export const money = (n: number) => `$${n.toFixed(2)}`;
export const chainName = (id: ChainId) => CHAINS.find((c) => c.id === id)?.name ?? id;
export const DAY_NAMES = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
export const DAY_LONG = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];
/** A friendly amount: whole numbers and quarters as fractions (1¾, not 1.75). */
export const fmtQty = (n: number) => {
  const q = Math.round(n * 4) / 4;
  const whole = Math.floor(q);
  const frac = ["", "¼", "½", "¾"][Math.round((q - whole) * 4)]!;
  return whole === 0 && frac ? frac : `${whole}${frac}`;
};
export const fmtServings = (n: number) => {
  const s = fmtQty(n);
  return `${s} serving${s === "1" ? "" : "s"}`;
};
/** "1 item", "3 items". Pass the plural when it isn't just an added s. */
export const plural = (n: number, one: string, many = `${one}s`) => `${n.toLocaleString()} ${n === 1 ? one : many}`;
export function cx(...parts: (string | false | null | undefined)[]) {
  return parts.filter(Boolean).join(" ");
}

/** Link to a recipe. The person's own recipes have no prebuilt page, so they share one page. */
export const recipeHref = (id: string) => (id.startsWith("custom_") ? `/recipes/mine/?id=${encodeURIComponent(id)}` : `/recipes/${id}/`);
