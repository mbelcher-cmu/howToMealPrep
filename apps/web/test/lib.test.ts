import { describe, expect, it } from "vitest";
import { cx, fmtQty, fmtServings, isPittsburghZip, money, plural, recipeHref } from "../src/lib/format";
import { buildIcs, nextWeekday, at } from "../src/lib/ics";
import { AISLE_ORDER, aisleOrderFor } from "../src/lib/aisles";

describe("formatting", () => {
  it("shows money with cents", () => {
    expect(money(3)).toBe("$3.00");
    expect(money(12.345)).toBe("$12.35");
  });
  it("shows quantities as quarters", () => {
    expect(fmtQty(1.75)).toBe("1¾");
    expect(fmtQty(0.5)).toBe("½");
    expect(fmtQty(2)).toBe("2");
    expect(fmtQty(0.1)).toBe("0");
    expect(fmtQty(2.9)).toBe("3");
    expect(fmtServings(1)).toBe("1 serving");
    expect(fmtServings(1.5)).toBe("1½ servings");
  });
  it("pluralizes", () => {
    expect(plural(1, "item")).toBe("1 item");
    expect(plural(0, "item")).toBe("0 items");
    expect(plural(1200, "box", "boxes")).toBe("1,200 boxes");
  });
  it("joins class names, skipping empty ones", () => {
    expect(cx("a", false, null, undefined, "", "b")).toBe("a b");
  });
  it("links a person's own recipes to the shared page", () => {
    expect(recipeHref("chicken_tikka")).toBe("/recipes/chicken_tikka/");
    expect(recipeHref("custom_my soup")).toBe("/recipes/mine/?id=custom_my%20soup");
  });
  it("knows Pittsburgh ZIP codes", () => {
    expect(isPittsburghZip("15213")).toBe(true);
    expect(isPittsburghZip("15290")).toBe(true);
    expect(isPittsburghZip("15301")).toBe(false);
    expect(isPittsburghZip("31905")).toBe(false);
    expect(isPittsburghZip(undefined)).toBe(false);
  });
});

describe("calendar export", () => {
  it("finds the next weekday, counting today", () => {
    const thu = new Date(2026, 10, 5); // Thursday
    expect(nextWeekday(3, thu).getDate()).toBe(5);
    expect(nextWeekday(6, thu).getDate()).toBe(8); // Sunday
    expect(nextWeekday(0, thu).getDate()).toBe(9); // Monday
  });
  it("builds a valid calendar with escaped text, folded lines and an alarm", () => {
    const ics = buildIcs([{ uid: "prep-1", start: at(new Date(2026, 10, 8), "14:30"), minutes: 90, title: "Prep day; chicken, rice", description: "x".repeat(200), alarmMinutesBefore: 60 }]);
    const lines = ics.split("\r\n");
    expect(lines[0]).toBe("BEGIN:VCALENDAR");
    expect(ics.endsWith("END:VCALENDAR\r\n")).toBe(true);
    expect(ics).toContain("DTSTART:20261108T143000");
    expect(ics).toContain("DTEND:20261108T160000");
    expect(ics).toContain("SUMMARY:Prep day\\; chicken\\, rice");
    expect(ics).toContain("TRIGGER:-PT60M");
    for (const l of lines) expect(l.length).toBeLessThanOrEqual(75);
    expect(lines.filter((l) => l === "BEGIN:VEVENT")).toHaveLength(1);
  });
});

describe("aisle order", () => {
  it("puts the person's aisles first and keeps every aisle exactly once", () => {
    const order = aisleOrderFor("aldi", { aldi: ["Frozen", "Produce"] });
    expect(order.slice(0, 2)).toEqual(["Frozen", "Produce"]);
    expect([...order].sort()).toEqual([...AISLE_ORDER].sort());
    expect(aisleOrderFor("walmart", { aldi: ["Frozen"] })).toEqual(AISLE_ORDER);
    expect(aisleOrderFor("aldi", { aldi: ["Not an aisle" as never] })).toEqual(AISLE_ORDER);
  });
});
