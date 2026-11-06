import { describe, expect, it } from "vitest";
import { closestByChain, restaurantFor } from "../src/lib/nearby";

describe("takeout chains near you", () => {
  it("maps OpenStreetMap brands and names to chains", () => {
    expect(restaurantFor("Chick-fil-A Chick-fil-A")).toBe("chickfila");
    expect(restaurantFor("McDonald's")).toBe("mcdonalds");
    expect(restaurantFor("Jersey Mike's Subs")).toBe("jerseymikes");
    expect(restaurantFor("Subway")).toBe("subway");
    expect(restaurantFor("Raising Cane's Chicken Fingers")).toBe("canes");
    expect(restaurantFor("Joe's Diner")).toBeNull();
    // "Subway" inside another word isn't Subway
    expect(restaurantFor("Subwayside Grill")).toBeNull();
  });

  it("keeps the closest location of each chain", () => {
    expect(closestByChain([
      { name: "Chipotle Mexican Grill", distanceMi: 3.2 },
      { name: "Chipotle", distanceMi: 1.1 },
      { name: "Taco Bell", distanceMi: 0.4 },
      { name: "Local Pizza", distanceMi: 0.2 },
    ])).toEqual({ chipotle: 1.1, tacobell: 0.4 });
  });
});
