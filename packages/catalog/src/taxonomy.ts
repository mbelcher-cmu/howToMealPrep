/** Preference taxonomy. Hard rules filter recipes; soft wishes rank them. */

export const ALLERGENS = {
  milk: "Milk", egg: "Eggs", fish: "Fish", shellfish: "Shellfish", treenut: "Tree nuts",
  peanut: "Peanuts", wheat: "Wheat", soy: "Soy", sesame: "Sesame",
} as const;
export type Allergen = keyof typeof ALLERGENS;

export const ANIMALS = ["dairy", "egg", "poultry", "beef", "pork", "fish", "shellfish"] as const;
export type Animal = (typeof ANIMALS)[number];

export const DIETS = {
  omnivore: { label: "Anything", detail: "No restrictions" },
  pescatarian: { label: "Pescatarian", detail: "Fish and seafood, no other meat" },
  vegetarian: { label: "Vegetarian", detail: "No meat or seafood; eggs and dairy are fine" },
  vegan: { label: "Vegan", detail: "No animal products" },
  glutenFree: { label: "Gluten-free", detail: "No wheat, barley or rye" },
  dairyFree: { label: "Dairy-free", detail: "No milk products" },
  noPork: { label: "No pork", detail: "Fits halal-style and kosher-style eating (ingredients only, not certification)" },
  lowCarb: { label: "Low-carb", detail: "Under 25 g carbs a serving" },
  keto: { label: "Keto", detail: "Under 10 g net carbs a serving" },
  wholeFoods: { label: "Whole foods", detail: "No processed meats, refined grains or sugary sauces" },
} as const;
export type Diet = keyof typeof DIETS;

export const CUISINES = {
  american: "American", southern: "Southern and BBQ", texmex: "Tex-Mex", mexican: "Mexican", caribbean: "Caribbean",
  latin: "Latin American", italian: "Italian", greek: "Greek", spanish: "Spanish", french: "French",
  middleEastern: "Middle Eastern", northAfrican: "North African", ethiopian: "Ethiopian", indian: "Indian",
  thai: "Thai", vietnamese: "Vietnamese", chinese: "Chinese", korean: "Korean", japanese: "Japanese",
  filipino: "Filipino", hawaiian: "Hawaiian", easternEuropean: "Eastern European", pittsburgh: "Pittsburgh classics",
} as const;
export type Cuisine = keyof typeof CUISINES;

export const MOODS = {
  comfort: "Comfort food", fresh: "Light and fresh", spicy: "Spicy", soupy: "Soups and stews", bowls: "Bowls",
  handheld: "Wraps and handhelds", pasta: "Pasta night", grill: "Grill and smoke", breakfastForDinner: "Breakfast anytime", sweet: "Sweet tooth",
} as const;
export type Mood = keyof typeof MOODS;

export const FLAVORS = {
  savory: "Savory", smoky: "Smoky", tangy: "Tangy", sweetSpicy: "Sweet and spicy", herby: "Herby",
  garlicky: "Garlicky", cheesy: "Cheesy", umami: "Umami",
} as const;
export type Flavor = keyof typeof FLAVORS;

export const EQUIPMENT = {
  oven: "Oven", stovetop: "Stovetop", microwave: "Microwave", airFryer: "Air fryer",
  slowCooker: "Slow cooker", pressureCooker: "Pressure cooker", grill: "Grill", noCook: "No cooking",
} as const;
export type Equipment = keyof typeof EQUIPMENT;

export const PROTEIN_SOURCES = {
  chicken: "Chicken", turkey: "Turkey", beef: "Beef", pork: "Pork", fish: "Fish", shellfish: "Shellfish",
  eggs: "Eggs", dairy: "Dairy", soy: "Tofu and tempeh", legumes: "Beans and lentils",
} as const;
export type ProteinSource = keyof typeof PROTEIN_SOURCES;

export type MealType = "breakfast" | "main" | "snack";
export type Skill = "beginner" | "intermediate" | "confident";
