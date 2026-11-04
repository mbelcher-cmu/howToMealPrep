import { describe, expect, it } from "vitest";
import { summarizeAppleHealth } from "../src";

const rec = (type: string, src: string, day: string, value: number, unit = "kcal") =>
  `<Record type="HKQuantityTypeIdentifier${type}" sourceName="${src}" unit="${unit}" creationDate="${day} 09:00:00 -0400" startDate="${day} 08:00:00 -0400" endDate="${day} 08:05:00 -0400" value="${value}"/>`;

describe("Apple Health import", () => {
  const xml = `<?xml version="1.0"?><HealthData locale="en_US">
    ${rec("ActiveEnergyBurned", "Watch", "2026-11-01", 300)}${rec("ActiveEnergyBurned", "Watch", "2026-11-01", 200)}
    ${rec("ActiveEnergyBurned", "iPhone", "2026-11-01", 350)}
    ${rec("BasalEnergyBurned", "Watch", "2026-11-01", 1800)}
    ${rec("ActiveEnergyBurned", "Watch", "2026-11-02", 700)}${rec("BasalEnergyBurned", "Watch", "2026-11-02", 7531.2, "kJ")}
    ${rec("ActiveEnergyBurned", "Watch", "2026-11-04", 100)}${rec("BasalEnergyBurned", "Watch", "2026-11-04", 600)}
    ${rec("BodyMass", "Scale", "2026-10-20", 180, "lb")}${rec("BodyMass", "Scale", "2026-11-03", 178, "lb")}
    ${rec("StepCount", "Watch", "2026-11-01", 9000, "count")}
  </HealthData>`;
  it("averages complete days, takes the larger of overlapping sources, converts units", () => {
    const s = summarizeAppleHealth(xml, 14, "2026-11-04");
    expect(s.days).toBe(2);
    expect(s.activeKcal).toBe(600); // (500 watch beats 350 phone + 700) / 2
    expect(s.restingKcal).toBe(1800); // 7531.2 kJ = 1800 kcal
    expect(s.maintenanceKcal).toBe(2400);
    expect(s.weightKg).toBeCloseTo(80.7, 1);
    expect(s.weightOn).toBe("2026-11-03");
    expect(s).toMatchObject({ from: "2026-11-01", to: "2026-11-02" });
  });
  it("returns nothing useful for an unrelated file", () => {
    expect(summarizeAppleHealth("<html></html>")).toMatchObject({ maintenanceKcal: null, days: 0, weightKg: null });
  });
});
