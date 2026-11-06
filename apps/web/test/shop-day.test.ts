import { describe, expect, it } from "vitest";
import { longestWait, planDayFrom, shopChoices, shopDateOf, startPatch, suggestedCookDays, weekdayOf } from "../src/lib/shop-day";

describe("shopping day", () => {
  it("starts the plan on the shopping day or the next", () => {
    // Thursday Nov 5 2026
    expect(weekdayOf("2026-11-05")).toBe(3);
    expect(startPatch("2026-11-05", true)).toEqual({ shopSameDay: true, weekStart: 3, weekOf: "2026-11-05" });
    expect(startPatch("2026-11-05", false)).toEqual({ shopSameDay: false, weekStart: 4, weekOf: "2026-11-06" });
    expect(shopDateOf("2026-11-06", false)).toBe("2026-11-05");
    expect(shopDateOf("2026-11-05", true)).toBe("2026-11-05");
  });

  it("offers today, tomorrow, then weekdays", () => {
    const c = shopChoices("2026-11-05");
    expect(c).toHaveLength(7);
    expect(c.map((x) => x.label).slice(0, 3)).toEqual(["Today", "Tomorrow", "Sat"]);
    expect(c[6]!.iso).toBe("2026-11-11");
  });

  it("suggests enough cook days to keep food within 3 days", () => {
    expect([1, 3, 4, 5, 7].map(suggestedCookDays)).toEqual([1, 1, 1, 2, 2]);
    expect(longestWait(7, 1)).toBe(6);
    expect(longestWait(7, 2)).toBe(3);
    expect(longestWait(4, 1)).toBe(3);
    expect(longestWait(7, 3)).toBe(2);
  });

  it("counts plan days from the start date", () => {
    expect(planDayFrom("2026-11-05", "2026-11-05")).toBe(0);
    expect(planDayFrom("2026-11-06", "2026-11-05")).toBe(-1);
    expect(planDayFrom("2026-10-30", "2026-11-05")).toBe(6);
  });
});
