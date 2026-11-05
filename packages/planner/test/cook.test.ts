import { describe, expect, it } from "vitest";
import { RECIPES, type Recipe } from "@prep-cart/catalog";
import { cookPlan, cookStation, storageNote, PREHEAT_MINUTES, type CookStep } from "../src";

const waitOf = (r: Recipe) => r.totalMinutes - r.activeMinutes;
const batch = (recipe: Recipe) => ({ recipe, servings: recipe.servings, portion: 1 });
const byStation = (s: string) => RECIPES.filter((r) => cookStation(r) === s && waitOf(r) >= 15).sort((a, b) => waitOf(b) - waitOf(a));

/** at every minute, no station holds more than it can */
function maxConcurrent(steps: CookStep[], station: string, recipes: Recipe[]): number {
  const end = Math.max(...steps.map((s) => s.at + s.minutes));
  let peak = 0;
  for (let t = 0; t < end; t++) {
    const n = recipes.filter((r) => {
      const prep = steps.find((s) => s.recipeId === r.id && s.kind === "handsOn")!;
      const wait = steps.find((s) => s.recipeId === r.id && s.kind === "waiting");
      const onHands = prep.station === station && t >= prep.at && t < prep.at + prep.minutes;
      const onWait = wait?.station === station && t >= wait.at && t < wait.at + wait.minutes;
      return onHands || onWait;
    }).length;
    peak = Math.max(peak, n);
  }
  return peak;
}

describe("cook plan", () => {
  it("never has the cook doing two hands-on things at once", () => {
    const picks = RECIPES.filter((_, i) => i % 9 === 0).slice(0, 8);
    const p = cookPlan(picks.map(batch));
    const hands = p.steps.filter((s) => s.kind !== "waiting").sort((a, b) => a.at - b.at);
    for (let i = 1; i < hands.length; i++) expect(hands[i]!.at).toBeGreaterThanOrEqual(hands[i - 1]!.at + hands[i - 1]!.minutes);
    expect(p.steps.at(-1)!.kind).toBe("pack");
  });

  it("is faster than cooking one recipe at a time when things can run in parallel", () => {
    const oven = byStation("oven")[0]!;
    const stove = byStation("stovetop")[0]!;
    const p = cookPlan([batch(stove), batch(oven)]);
    expect(p.totalMinutes).toBeLessThan(p.oneAtATimeMinutes);
  });

  it("preheats the oven first and doesn't put food in before it's hot", () => {
    const oven = byStation("oven")[0]!;
    const p = cookPlan([batch(oven)]);
    expect(p.steps[0]).toMatchObject({ kind: "preheat", at: 0, station: "oven" });
    const wait = p.steps.find((s) => s.kind === "waiting")!;
    expect(wait.station).toBe("oven");
    expect(wait.at).toBeGreaterThanOrEqual(PREHEAT_MINUTES);
  });

  it("waits for a free appliance when there is only one", () => {
    const slow = byStation("slowCooker").slice(0, 2);
    if (slow.length < 2) return;
    const p = cookPlan(slow.map(batch));
    expect(maxConcurrent(p.steps, "slowCooker", slow)).toBe(1);
    const p2 = cookPlan(slow.map(batch), { slowCooker: 2 });
    expect(p2.totalMinutes).toBeLessThan(p.totalMinutes);
  });

  it("keeps to two oven racks and four burners", () => {
    const oven = byStation("oven").slice(0, 4);
    const stove = byStation("stovetop").slice(0, 6);
    const all = [...oven, ...stove];
    const p = cookPlan(all.map(batch));
    expect(maxConcurrent(p.steps, "oven", all)).toBeLessThanOrEqual(2);
    expect(maxConcurrent(p.steps, "stovetop", all)).toBeLessThanOrEqual(4);
  });

  it("gives every unattended step a what-to-do-next note", () => {
    const p = cookPlan(RECIPES.slice(0, 6).map(batch));
    for (const s of p.steps.filter((x) => x.kind === "waiting")) expect(s.whenDone).toBeTruthy();
  });

  it("is empty for an empty session", () => {
    expect(cookPlan([])).toMatchObject({ steps: [], totalMinutes: 0, containers: 0, stations: [] });
  });
});

describe("storage notes", () => {
  it("uses the recipe's own reheat note, or a sensible default", () => {
    for (const r of RECIPES) {
      const n = storageNote(r);
      expect(n.reheat.length).toBeGreaterThan(5);
      if (r.reheat) expect(n.reheat).toBe(r.reheat);
      expect(n.label).toContain(r.name);
      expect(n.fridgeDays).toBeGreaterThanOrEqual(1);
    }
  });
});
