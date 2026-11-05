import { describe, expect, it } from "vitest";
import fc from "fast-check";
import {
  cleanTrainingWeek, dayFrom, dayPortionScales, kcalFromMacros, matchingActivity, minutesFrom, parseCsv, parseWorkoutFile,
  restWeek, targetsFromSplit, trainingDayTargets, typicalWeek, weekBurn, workoutKcal, workoutTypeFrom, WORKOUT_TYPES,
  type ImportedWorkout, type TrainingWeek,
} from "../src";

const base = targetsFromSplit(2400, { protein: 0.3, carbs: 0.4, fat: 0.3 });
const soldier: TrainingWeek = [
  [{ type: "pt", minutes: 60 }], [{ type: "run", minutes: 45 }], [{ type: "pt", minutes: 60 }],
  [{ type: "ruck", minutes: 120 }], [{ type: "lift", minutes: 60 }], [], [],
];

describe("workout calories", () => {
  it("counts only what a workout burns above resting", () => {
    // (9 - 1) MET x 80 kg x 0.75 h = 480
    expect(workoutKcal({ type: "run", minutes: 45 }, 80)).toBe(480);
    expect(workoutKcal({ type: "run", minutes: 0 }, 80)).toBe(0);
    expect(workoutKcal({ type: "lift", minutes: -10 }, 80)).toBe(0);
  });
  it("adds up each day of the week", () => {
    const b = weekBurn(soldier, 80);
    expect(b).toHaveLength(7);
    expect(b[5]).toBe(0);
    expect(b[3]).toBe(workoutKcal({ type: "ruck", minutes: 120 }, 80));
  });
});

describe("training and rest day targets", () => {
  it("keeps the weekly total and protein, and puts the extra on training days", () => {
    const p = trainingDayTargets(base, soldier, { weightKg: 80 });
    const total = p.days.reduce((a, d) => a + d.targets.kcal, 0);
    expect(Math.abs(total - base.kcal * 7)).toBeLessThanOrEqual(7 * 9);
    for (const d of p.days) {
      expect(d.targets.protein).toBe(base.protein);
      expect(d.targets.kcal).toBe(kcalFromMacros(d.targets));
    }
    expect(p.days[3]!.targets.kcal).toBeGreaterThan(p.days[5]!.targets.kcal);
    expect(p.days[3]!.targets.carbs).toBeGreaterThan(p.days[5]!.targets.carbs);
    expect(p.trainingDays).toBe(5);
    expect(p.days[6]!.training).toBe(false);
  });
  it("leaves every day alone for a rest week", () => {
    const p = trainingDayTargets(base, restWeek(), { weightKg: 80 });
    for (const d of p.days) expect(d.targets).toEqual(base);
    expect(p.averageBurn).toBe(0);
  });
  it("never swings a day more than 35% or under the safe minimum", () => {
    const huge: TrainingWeek = [[{ type: "run", minutes: 300 }], [], [], [], [], [], []];
    const small = targetsFromSplit(1500, { protein: 0.3, carbs: 0.4, fat: 0.3 });
    const p = trainingDayTargets(small, huge, { weightKg: 90 }, "male");
    for (const d of p.days) {
      expect(d.targets.kcal).toBeLessThanOrEqual(1500 * 1.35 + 9);
      expect(d.targets.kcal).toBeGreaterThanOrEqual(1500 - 9);
    }
  });
  it("holds the weekly total for any week (property)", () => {
    const workout = fc.record({ type: fc.constantFrom(...WORKOUT_TYPES), minutes: fc.integer({ min: 0, max: 240 }) });
    fc.assert(fc.property(fc.array(fc.array(workout, { maxLength: 2 }), { minLength: 7, maxLength: 7 }), fc.integer({ min: 1800, max: 4000 }), (week, kcal) => {
      const t = targetsFromSplit(kcal, { protein: 0.25, carbs: 0.45, fat: 0.3 });
      const p = trainingDayTargets(t, week, { weightKg: 75 });
      const total = p.days.reduce((a, d) => a + d.targets.kcal, 0);
      // the clamp can only stop the total when every day is pinned at the floor or ceiling
      return Math.abs(total - t.kcal * 7) <= 7 * 9 || p.days.every((d) => d.targets.kcal >= t.kcal * 1.34 || d.targets.kcal <= t.kcal * 0.66 + 9);
    }), { numRuns: 200 });
  });
  it("suggests an activity level that matches the week", () => {
    const stats = { sex: "male" as const, ageYears: 30, heightCm: 178, weightKg: 80 };
    expect(matchingActivity(0, stats)).toBe("sedentary");
    const p = trainingDayTargets(base, soldier, stats);
    expect(["moderate", "very"]).toContain(p.matchingActivity);
  });
});

describe("portion scales", () => {
  it("make training days bigger and keep the week's food the same", () => {
    const p = trainingDayTargets(base, soldier, { weightKg: 80 });
    const s = dayPortionScales(p, 0, 7);
    expect(s[3]!).toBeGreaterThan(1);
    expect(s[6]!).toBeLessThan(1);
    expect(Math.abs(s.reduce((a, b) => a + b, 0) - 7)).toBeLessThan(0.05);
  });
  it("follow the plan's first weekday", () => {
    const p = trainingDayTargets(base, soldier, { weightKg: 80 });
    // a plan starting Thursday: its first day is the ruck day
    const s = dayPortionScales(p, 3, 7);
    expect(s[0]).toBe(Math.max(...s));
  });
});

describe("saved weeks", () => {
  it("are cleaned up", () => {
    const w = cleanTrainingWeek([[{ type: "run", minutes: 30 }, { type: "nope", minutes: 10 }, { type: "lift", minutes: 0 }], "x", null, [{ type: "ruck", minutes: 9999 }]]);
    expect(w).toHaveLength(7);
    expect(w[0]).toEqual([{ type: "run", minutes: 30 }]);
    expect(w[1]).toEqual([]);
    expect(w[3]![0]!.minutes).toBe(360);
    expect(cleanTrainingWeek(undefined)).toEqual(restWeek());
  });
});

describe("reading workout exports", () => {
  it("maps app activity names", () => {
    expect(workoutTypeFrom("Run")).toBe("run");
    expect(workoutTypeFrom("HKWorkoutActivityTypeTraditionalStrengthTraining")).toBe("lift");
    expect(workoutTypeFrom("HKWorkoutActivityTypeHighIntensityIntervalTraining")).toBe("pt");
    expect(workoutTypeFrom("Ruck")).toBe("ruck");
    expect(workoutTypeFrom("Virtual Ride")).toBe("cycle");
    expect(workoutTypeFrom("Pool Swimming")).toBe("swim");
    expect(workoutTypeFrom("Hiking")).toBe("walk");
    expect(workoutTypeFrom("biking")).toBe("cycle");
    expect(workoutTypeFrom("Basketball")).toBe("sports");
    expect(workoutTypeFrom("Something new")).toBe("other");
  });
  it("reads dates and durations in the formats apps use", () => {
    expect(dayFrom("Nov 3, 2026, 6:12:45 PM")).toBe("2026-11-03");
    expect(dayFrom("2026-11-03 06:12:45")).toBe("2026-11-03");
    expect(dayFrom("3 Nov 2026, 06:12")).toBe("2026-11-03");
    expect(dayFrom("11/03/2026")).toBe("2026-11-03");
    expect(dayFrom("yesterday")).toBeNull();
    expect(minutesFrom("01:02:30", "minutes")).toBeCloseTo(62.5);
    expect(minutesFrom("45:30.5", "minutes")).toBeCloseTo(45.508, 2);
    expect(minutesFrom("2,700", "seconds")).toBe(45);
    expect(minutesFrom("", "seconds")).toBeNull();
  });
  it("parses quoted CSV", () => {
    expect(parseCsv('a,b\n"x, y","say ""hi"""\r\n\n1,2')).toEqual([["a", "b"], ["x, y", 'say "hi"'], ["1", "2"]]);
  });
  it("reads a Strava activities.csv", () => {
    const csv = [
      "Activity ID,Activity Date,Activity Name,Activity Type,Activity Description,Elapsed Time,Distance,Max Heart Rate,Relative Effort,Commute,Activity Private Note,Activity Gear,Filename,Athlete Weight,Bike Weight,Elapsed Time,Moving Time,Distance,Calories",
      '1,"Nov 2, 2026, 11:00:00 AM",Morning Run,Run,,2900,8.1,,,false,,,,,,2900.0,2700.0,8100.0,610',
      '2,"Nov 3, 2026, 11:00:00 AM",Lift,Weight Training,,3600,0,,,false,,,,,,3600.0,3600.0,0,',
      '3,"bad date",Oops,Run,,100,0,,,false,,,,,,,,,',
    ].join("\n");
    const r = parseWorkoutFile("activities.csv", csv);
    expect(r.source).toBe("Strava");
    expect(r.workouts).toEqual([
      { date: "2026-11-02", type: "run", minutes: 45, rawType: "Run", kcal: 610 },
      { date: "2026-11-03", type: "lift", minutes: 60, rawType: "Weight Training" },
    ]);
    expect(r.skipped).toBe(1);
  });
  it("reads a Garmin Connect Activities.csv", () => {
    const csv = 'Activity Type,Date,Favorite,Title,Distance,Calories,Time,Avg HR\nRunning,2026-11-02 06:00:00,false,Fort Moore Running,5.01,"1,024",00:42:10,150\nStrength Training,2026-11-03 06:00:00,false,Strength,0.00,300,01:00:00,110';
    const r = parseWorkoutFile("Activities.csv", csv);
    expect(r.source).toBe("Garmin");
    expect(r.workouts.map((w) => [w.date, w.type, w.minutes, w.kcal])).toEqual([["2026-11-02", "run", 42, 1024], ["2026-11-03", "lift", 60, 300]]);
  });
  it("reads a GPX track", () => {
    const gpx = `<?xml version="1.0"?><gpx version="1.1"><metadata><time>2026-11-02T10:00:00Z</time></metadata><trk><name>Ruck march</name><type>hiking</type><trkseg>
      <trkpt lat="1" lon="1"><time>2026-11-02T10:00:00Z</time></trkpt><trkpt lat="1" lon="2"><time>2026-11-02T11:30:00Z</time></trkpt></trkseg></trk></gpx>`;
    const r = parseWorkoutFile("march.gpx", gpx);
    expect(r.workouts).toEqual([{ date: "2026-11-02", type: "walk", minutes: 90, rawType: "hiking" }]);
  });
  it("reads a TCX file", () => {
    const tcx = `<TrainingCenterDatabase><Activities><Activity Sport="Biking"><Id>2026-11-04T07:00:00Z</Id><Lap><TotalTimeSeconds>1800</TotalTimeSeconds><Calories>300</Calories></Lap><Lap><TotalTimeSeconds>1200</TotalTimeSeconds><Calories>200</Calories></Lap></Activity></Activities></TrainingCenterDatabase>`;
    expect(parseWorkoutFile("ride.tcx", tcx).workouts).toEqual([{ date: "2026-11-04", type: "cycle", minutes: 50, rawType: "Biking", kcal: 500 }]);
  });
  it("reads Apple Health workouts", () => {
    const xml = `<HealthData locale="en_US">
      <Workout workoutActivityType="HKWorkoutActivityTypeRunning" duration="32.5" durationUnit="min" totalEnergyBurned="350" totalEnergyBurnedUnit="kcal" sourceName="Watch" startDate="2026-11-02 06:00:00 -0500" endDate="2026-11-02 06:32:30 -0500">
        <WorkoutStatistics type="HKQuantityTypeIdentifierActiveEnergyBurned"/>
      </Workout>
      <Workout workoutActivityType="HKWorkoutActivityTypeFunctionalStrengthTraining" sourceName="Watch" startDate="2026-11-03 06:00:00 -0500" endDate="2026-11-03 07:00:00 -0500"/>
    </HealthData>`;
    const r = parseWorkoutFile("export.xml", xml);
    expect(r.source).toBe("Apple Health");
    expect(r.workouts).toEqual([
      { date: "2026-11-02", type: "run", minutes: 33, rawType: "HKWorkoutActivityTypeRunning", kcal: 350 },
      { date: "2026-11-03", type: "pt", minutes: 60, rawType: "HKWorkoutActivityTypeFunctionalStrengthTraining" },
    ]);
  });
});

describe("a typical week from history", () => {
  // four weeks: PT every weekday morning (Mon 2026-10-05), a ruck most Thursdays, weekends off
  const workouts: ImportedWorkout[] = [];
  for (let w = 0; w < 4; w++) {
    for (let d = 0; d < 5; d++) {
      const day = new Date(Date.UTC(2026, 9, 5 + w * 7 + d)).toISOString().slice(0, 10);
      workouts.push({ date: day, type: "pt" as const, minutes: 55 + w, rawType: "PT" });
      if (d === 3 && w !== 1) workouts.push({ date: day, type: "ruck" as const, minutes: 120, rawType: "Ruck" });
    }
  }
  workouts.push({ date: "2026-10-10", type: "run" as const, minutes: 30, rawType: "Run" }); // one Saturday
  it("finds the training days, the main workout and the usual length", () => {
    const t = typicalWeek(workouts, "2026-11-02");
    expect(t.weeks).toBe(4);
    expect(t.week[0]).toEqual([{ type: "pt", minutes: 55 }]);
    expect(t.week[3]![0]!.type).toBe("ruck");
    expect(t.week[3]![0]!.minutes).toBe(175);
    expect(t.week[5]).toEqual([]); // trained one Saturday out of four
    expect(t.week[6]).toEqual([]);
  });
  it("works with less than a week of history", () => {
    const t = typicalWeek([{ date: "2026-11-01", type: "run", minutes: 40, rawType: "Run" }], "2026-11-02");
    expect(t.weeks).toBe(1);
    expect(t.week[6]).toEqual([{ type: "run", minutes: 40 }]);
  });
});
