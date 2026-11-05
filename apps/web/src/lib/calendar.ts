/**
 * The shopping calendar: the current plan repeated over several weeks, laid out as one shopping
 * trip per plan week. Food that keeps a month or more is bought once ("stock up"), fresh food is
 * bought each trip, and leftovers carry over only while they're still good.
 * Pure, so it can be tested.
 */

export interface CalendarItem {
  id: string;
  name: string;
  aisle: string;
  /** grams in one package */
  pkgGrams: number;
  pkgLabel: string;
  chain: string;
  /** price per package used for the plan */
  price: number;
  /** usual price when `price` is a sale */
  regular?: number;
  /** last day of the sale (YYYY-MM-DD) */
  saleEndsOn?: string;
  /** grams the plan uses each plan week */
  weeklyGrams: number;
  /** grams already at home before the first trip */
  onHand: number;
  /** days the item keeps once bought (raw meat counts its freezer life) */
  keepsDays: number;
  /** false to always buy it fresh each trip, even when it keeps */
  stockUp?: boolean;
}

export interface TripLine { id: string; packages: number; cost: number; stockUp: boolean }
export interface Trip { index: number; date: string; lines: TripLine[]; cost: number; stockUpCost: number }

export interface ItemPlan {
  id: string;
  kind: "stockUp" | "eachTrip" | "fromHome";
  packages: number;
  /** trips it's bought on with this calendar */
  buys: number;
  /** trips it would be bought on if you shopped one week at a time */
  buysWeekly: number;
  /** dollars saved against shopping one week at a time (sales that end) */
  saved: number;
  /** grams that go off before they're used, with this calendar */
  wasteGrams: number;
  wasteCost: number;
  /** grams still at home after the last week */
  leftGrams: number;
}

export interface ShoppingCalendar {
  trips: Trip[];
  items: ItemPlan[];
  total: number;
  /** what one-week-at-a-time shopping would cost over the same weeks */
  totalWeekly: number;
  saved: number;
  wasteCost: number;
  /** product lines you don't have to pick up again thanks to stocking up */
  pickupsSaved: number;
}

/** Items that keep at least two months (cans, grains, frozen, oils) are worth buying for several weeks at once. */
export const STOCK_UP_DAYS = 60;

const at = (iso: string) => new Date(`${iso}T12:00:00`);
const fmt = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
export const addDaysIso = (iso: string, n: number) => { const d = at(iso); d.setDate(d.getDate() + n); return fmt(d); };
const cents = (n: number) => Math.round(n * 100) / 100;

interface Lot { grams: number; goodUntil: number }

/**
 * Walk one item through the weeks. A trip happens on day w * tripDays. When `coverWeeks` is more
 * than 1, a trip that has to buy anyway buys enough for that many weeks (as far as it keeps).
 */
function simulate(it: CalendarItem, weeks: number, tripDays: number, start: string, coverWeeks: number) {
  const lots: Lot[] = it.onHand > 0 ? [{ grams: it.onHand, goodUntil: Infinity }] : [];
  const buys: { week: number; packages: number; cost: number }[] = [];
  let waste = 0;
  for (let w = 0; w < weeks; w++) {
    const day = w * tripDays;
    // anything past its date is thrown out before the trip
    for (const l of lots) if (l.goodUntil < day + 1 && l.grams > 0) { waste += l.grams; l.grams = 0; }
    const have = lots.reduce((a, l) => a + l.grams, 0);
    if (have < it.weeklyGrams - 0.5) {
      // what to buy for: this week, plus later weeks while the food still keeps
      const span = Math.max(1, Math.min(coverWeeks, weeks - w, Math.floor(it.keepsDays / tripDays) || 1));
      const want = it.weeklyGrams * span - have;
      const packages = Math.max(1, Math.ceil((want - 0.5) / it.pkgGrams));
      const date = addDaysIso(start, day);
      const onSale = it.regular != null && (!it.saleEndsOn || date <= it.saleEndsOn);
      const unit = onSale ? it.price : (it.regular ?? it.price);
      buys.push({ week: w, packages, cost: cents(packages * unit) });
      lots.push({ grams: packages * it.pkgGrams, goodUntil: day + it.keepsDays });
    }
    // eat the oldest first
    let need = it.weeklyGrams;
    lots.sort((a, b) => a.goodUntil - b.goodUntil);
    for (const l of lots) { const take = Math.min(l.grams, need); l.grams -= take; need -= take; if (need <= 0) break; }
  }
  const endDay = weeks * tripDays;
  for (const l of lots) if (l.goodUntil < endDay && l.grams > 0) { waste += l.grams; l.grams = 0; }
  return { buys, waste, left: lots.reduce((a, l) => a + l.grams, 0) };
}

/**
 * Build the calendar.
 * @param start the first trip (YYYY-MM-DD), normally the first day of the plan week
 * @param tripDays days between trips, normally the plan's length
 */
export function shoppingCalendar(items: CalendarItem[], opts: { weeks: number; start: string; tripDays: number }): ShoppingCalendar {
  const { weeks, start, tripDays } = opts;
  const trips: Trip[] = Array.from({ length: weeks }, (_, i) => ({ index: i, date: addDaysIso(start, i * tripDays), lines: [], cost: 0, stockUpCost: 0 }));
  const plans: ItemPlan[] = [];
  let totalWeekly = 0;
  for (const it of items) {
    if (!(it.weeklyGrams > 0) || !(it.pkgGrams > 0)) continue;
    const stockUp = (it.stockUp ?? it.keepsDays >= STOCK_UP_DAYS) && weeks > 1;
    const weekly = simulate(it, weeks, tripDays, start, 1);
    const chosen = stockUp ? simulate(it, weeks, tripDays, start, weeks) : weekly;
    const weeklyCost = weekly.buys.reduce((a, b) => a + b.cost, 0);
    const cost = chosen.buys.reduce((a, b) => a + b.cost, 0);
    totalWeekly += weeklyCost;
    for (const b of chosen.buys) {
      const t = trips[b.week]!;
      // a stock-up line is one that buys more than this week needs
      const extra = stockUp && b.packages * it.pkgGrams > it.weeklyGrams + it.pkgGrams - 0.5;
      t.lines.push({ id: it.id, packages: b.packages, cost: b.cost, stockUp: extra });
      t.cost = cents(t.cost + b.cost);
      if (extra) t.stockUpCost = cents(t.stockUpCost + b.cost);
    }
    const unitWaste = (it.regular ?? it.price) / it.pkgGrams;
    plans.push({
      id: it.id,
      kind: chosen.buys.length === 0 ? "fromHome" : stockUp ? "stockUp" : "eachTrip",
      packages: chosen.buys.reduce((a, b) => a + b.packages, 0),
      buys: chosen.buys.length,
      buysWeekly: weekly.buys.length,
      saved: cents(Math.max(0, weeklyCost - cost)),
      wasteGrams: Math.round(chosen.waste),
      wasteCost: cents(chosen.waste * unitWaste),
      leftGrams: Math.round(chosen.left),
    });
  }
  const total = cents(trips.reduce((a, t) => a + t.cost, 0));
  return {
    trips,
    items: plans,
    total,
    totalWeekly: cents(totalWeekly),
    saved: cents(plans.reduce((a, p) => a + p.saved, 0)),
    wasteCost: cents(plans.reduce((a, p) => a + p.wasteCost, 0)),
    pickupsSaved: plans.reduce((a, p) => a + Math.max(0, p.buysWeekly - p.buys), 0),
  };
}
