import { describe, expect, it } from "vitest";
import { menuChange, nextWeekChoices, nextWeekStart, planDayOf, weekInfo, weekStartOn } from "../src/lib/week";

// 2026-11-09 is a Monday
describe("plan week math", () => {
  it("finds the plan day and the week's first day", () => {
    expect(planDayOf("2026-11-09", 0)).toBe(0);
    expect(planDayOf("2026-11-15", 0)).toBe(6);
    expect(weekStartOn("2026-11-12", 0)).toBe("2026-11-09");
    // weeks that start on Sunday (weekStart 6)
    expect(weekStartOn("2026-11-12", 6)).toBe("2026-11-08");
    expect(weekStartOn("2026-11-08", 6)).toBe("2026-11-08");
  });

  it("moves through mid, ending and over as the week runs out", () => {
    const w = (today: string) => weekInfo({ weekOf: "2026-11-09", planCreated: null, weekStart: 0, today });
    expect(w("2026-11-10")).toMatchObject({ phase: "mid", next: "2026-11-16", daysLeft: 6 });
    expect(w("2026-11-14").phase).toBe("ending");
    expect(w("2026-11-15")).toMatchObject({ phase: "ending", daysLeft: 1 });
    expect(w("2026-11-16")).toMatchObject({ phase: "over", daysLeft: 0 });
    expect(w("2026-11-30").phase).toBe("over");
  });

  it("says when next week is already planned", () => {
    const info = weekInfo({ weekOf: "2026-11-16", planCreated: null, weekStart: 0, today: "2026-11-14" });
    expect(info).toMatchObject({ phase: "ahead", start: "2026-11-16", daysLeft: 2 });
    expect(nextWeekStart(info, "2026-11-14", 0)).toBe("2026-11-16");
  });

  it("falls back to the week the plan was built in", () => {
    const info = weekInfo({ weekOf: null, planCreated: "2026-11-11T15:00:00", weekStart: 0, today: "2026-11-11" });
    expect(info).toMatchObject({ phase: "mid", start: "2026-11-09" });
  });

  it("plans the coming week, or this week when the last one ran out", () => {
    const ending = weekInfo({ weekOf: "2026-11-09", planCreated: null, weekStart: 0, today: "2026-11-15" });
    expect(nextWeekStart(ending, "2026-11-15", 0)).toBe("2026-11-16");
    const over = weekInfo({ weekOf: "2026-11-09", planCreated: null, weekStart: 0, today: "2026-11-25" });
    expect(nextWeekStart(over, "2026-11-25", 0)).toBe("2026-11-23");
  });

  it("locks kept recipes and rests the rest", () => {
    expect(nextWeekChoices(["a", "b", "c", "a"], new Set(["b"]))).toEqual({ locked: ["b"], resting: ["a", "c"] });
  });

  it("lists what changed on the menu", () => {
    expect(menuChange(["a", "b"], ["b", "c"])).toEqual({ added: ["c"], dropped: ["a"], kept: ["b"] });
  });
});
