/**
 * Recipe import: turn a recipe web page (its schema.org JSON-LD) or pasted recipe text into a draft
 * the person can check, with each ingredient line matched to the catalog and converted to grams.
 */
import { INGREDIENTS } from "./ingredients";
import type { RecipeSeed } from "./recipe-types";
import type { Equipment, MealType, ProteinSource } from "./taxonomy";

export interface DraftLine {
  raw: string; ingredientId: string | null; grams: number | null; /** false when the amount was guessed */ sure: boolean;
  /** close catalog items, best first, for a line that didn't match */
  suggestions?: string[];
}
export interface ImportOptions { /** recipe import v2: product-word guard, amounts anywhere in the line, slices and scoops, suggestions */ v2?: boolean }
export interface RecipeDraft {
  name: string; servings: number; activeMinutes: number; totalMinutes: number; meal: MealType;
  equipment: Equipment[]; proteins: ProteinSource[]; lines: DraftLine[]; steps: string[];
  /** lines skipped because they're assumed on hand (salt, spices, water) */
  skipped: string[]; source?: string;
}

// ── Amounts ──
const UNICODE_FRACTIONS: Record<string, string> = { "½": " 1/2", "⅓": " 1/3", "⅔": " 2/3", "¼": " 1/4", "¾": " 3/4", "⅛": " 1/8", "⅕": " 1/5" };
const UNIT_RE = /^(cups?|c\.|tablespoons?|tbsps?\.?|tbs\.?|T\b|teaspoons?|tsps?\.?|t\b|ounces?|oz\.?|pounds?|lbs?\.?|grams?|g\b|kilograms?|kg|milliliters?|ml|liters?|l\b|cans?|cloves?|pinch|dash|slices?|scoops?|sticks?|pieces?|large|medium|small|whole|bunch(?:es)?|heads?|stalks?|fillets?|breasts?|thighs?|packages?|pkg|containers?|jars?|bags?)\b\.?/i;

/** grams per US cup, for volume amounts */
const CUP_GRAMS: Record<string, number> = {
  oats: 80, rice: 185, jasmine_rice: 185, brown_rice: 190, quinoa: 170, couscous: 175, lentils: 190, red_lentils: 190,
  cheddar: 113, mozzarella: 113, parmesan: 100, feta: 150, greek_yogurt: 245, cottage_cheese: 225, milk: 245, sour_cream: 230, butter: 227,
  spinach: 30, kale: 67, lettuce: 47, coleslaw_mix: 90, berries: 140, broccoli: 90, green_beans: 110, stirfry_veg: 110, peas: 145, corn: 145, edamame: 155,
  black_beans: 172, chickpeas: 164, pinto_beans: 172, kidney_beans: 172, onion: 160, bell_pepper: 150, tomatoes: 180, mushrooms: 70, carrots: 128,
  green_onion: 100, cilantro: 16, zucchini: 124, cucumber: 120, pineapple: 165, diced_tomatoes: 240, granola: 120, almonds: 143,
  peanut_butter: 258, honey: 340, salsa: 260, marinara: 250, enchilada_sauce: 250, chicken_broth: 240, veg_broth: 240, coconut_milk: 240,
  soy_sauce: 255, teriyaki_sauce: 270, bbq_sauce: 280, hummus: 245, pesto: 260, egg_whites: 243, olive_oil: 216, shrimp: 150, chicken_breast: 140,
  ground_turkey: 225, ground_beef: 225, ground_chicken: 225, tofu: 250, pasta: 100, pasta_white: 100, egg_noodles: 75, rice_noodles: 90,
  protein_powder: 120, almond_milk: 240, cream_cheese: 232, mayo: 220, flour: 125, sugar: 200, jalapeno: 90, cabbage: 70, cauliflower: 107, cauliflower_rice: 110,
  frozen_spinach: 156, parsley: 60, mango: 165, cashews: 137, chia: 160, ricotta: 246, cannellini: 180, refried_beans: 240, sauerkraut: 142, sesame_oil: 218,
  string_cheese: 113, tempeh: 166, curry_paste: 260, gochujang: 300, taco_seasoning: 100,
};
/** grams for one when the catalog has no natural unit */
const ONE_GRAMS: Record<string, number> = {
  chicken_breast: 225, chicken_thigh: 115, pork_tenderloin: 450, sirloin: 300, salmon: 170, cod: 170, tilapia: 115, bell_pepper: 150, onion: 150, potatoes: 213,
  sweet_potato: 200, tomatoes: 62, zucchini: 200, cucumber: 300, carrots: 61, apples: 182, bananas: 118, avocado: 150, limes: 67, lemons: 84,
  garlic: 5, ginger: 15, green_onion: 15, lettuce: 300, broccoli: 300, tofu: 397, tortillas: 45, corn_tortillas: 26, pita: 60, bread: 32,
  jalapeno: 14, cabbage: 900, cauliflower: 575, eggplant: 450, mango: 200, pork_chops: 170, english_muffins: 57, plantains: 227,
};
/** grams in one slice, scoop or stick */
const SLICE_GRAMS: Record<string, number> = {
  bacon: 25, bread: 32, cheddar: 21, mozzarella: 21, deli_turkey: 14, tomatoes: 20, onion: 15, cucumber: 10, avocado: 25, pineapple: 85, eggplant: 60, zucchini: 10,
};
const SCOOP_GRAMS: Record<string, number> = { protein_powder: 30 };
const STICK_GRAMS: Record<string, number> = { butter: 113, string_cheese: 28, cream_cheese: 227,
};

function parseNumber(s: string): { n: number; rest: string } | null {
  let t = s;
  for (const [k, v] of Object.entries(UNICODE_FRACTIONS)) t = t.split(k).join(v);
  t = t.trim();
  const m = t.match(/^(\d+(?:\.\d+)?)(?:\s+(\d+)\/(\d+))?(?:\s*\/\s*(\d+))?(?:\s*(?:-|to|–)\s*(\d+(?:\.\d+)?(?:\s+\d+\/\d+)?|\d+\/\d+))?/);
  if (!m) return null;
  let n = Number(m[1]);
  if (m[4]) n = n / Number(m[4]);
  else if (m[2] && m[3]) n += Number(m[2]) / Number(m[3]);
  return { n, rest: t.slice(m[0].length).trim() };
}

const ALWAYS_ON_HAND = /\b(salt|vinegar|mustard|dijon|hot sauce|sriracha|worcestershire|fish sauce|zest|extract|black pepper|pepper to taste|water|ice|cumin|paprika|chili powder|chilli powder|oregano|thyme|rosemary|cinnamon|turmeric|garlic powder|onion powder|red pepper flakes|chili flakes|bay lea(f|ves)|vanilla|cooking spray|nonstick spray|baking (powder|soda)|italian seasoning|curry powder|garam masala|coriander|nutmeg|cayenne|smoked paprika|dried basil|seasoning to taste)\b/i;

// ── Ingredient matching ──
const MODIFIERS = new Set(["frozen", "canned", "dry", "dried", "boneless", "skinless", "low", "sodium", "plain", "nonfat", "shredded", "crumbled", "grated", "whole", "wheat", "fresh", "large", "light", "lean", "extra", "firm", "raw", "peeled", "chunk", "in", "water", "juice", "part", "skim", "sliced", "cooked", "old", "fashioned", "rolled", "long", "grain", "white", "baby", "chopped", "hearts", "93%", "90%", "2%", "low-fat", "low-sodium", "part-skim", "old-fashioned", "long-grain", "extra-firm", "shelled", "mixed", "fillets", "and", "of", "the", "a"]);
const EXTRA_ALIASES: Record<string, string[]> = {
  chicken_breast: ["chicken breast", "chicken breasts", "chicken"], chicken_thigh: ["chicken thigh", "chicken thighs"], ground_turkey: ["ground turkey", "turkey mince"],
  ground_beef: ["ground beef", "beef mince", "hamburger"], ground_chicken: ["ground chicken"], ground_pork: ["ground pork"], sirloin: ["steak", "sirloin"], pork_tenderloin: ["pork tenderloin", "pork loin"],
  greek_yogurt: ["greek yogurt", "yogurt", "greek yoghurt", "yoghurt"], milk: ["milk"], cheddar: ["cheddar", "cheddar cheese"], mozzarella: ["mozzarella"], parmesan: ["parmesan", "parmigiano"],
  eggs: ["egg", "eggs"], egg_whites: ["egg whites", "egg white"], tofu: ["tofu"], rice: ["rice", "white rice"], jasmine_rice: ["jasmine rice"], brown_rice: ["brown rice"],
  pasta_white: ["pasta", "spaghetti", "penne", "rigatoni", "fusilli", "macaroni", "linguine"], pasta: ["whole wheat pasta", "whole wheat spaghetti"],
  oats: ["oats", "oatmeal", "rolled oats"], tortillas: ["tortilla", "tortillas", "flour tortillas"], corn_tortillas: ["corn tortillas"], bread: ["bread"],
  onion: ["onion", "onions", "yellow onion", "white onion", "red onion"], green_onion: ["green onion", "green onions", "scallion", "scallions"], garlic: ["garlic", "garlic clove", "garlic cloves"],
  bell_pepper: ["bell pepper", "bell peppers", "red pepper", "green pepper", "capsicum"], tomatoes: ["tomato", "tomatoes"], diced_tomatoes: ["diced tomatoes", "canned tomatoes", "crushed tomatoes"],
  potatoes: ["potato", "potatoes"], sweet_potato: ["sweet potato", "sweet potatoes"], spinach: ["spinach"], kale: ["kale"], lettuce: ["lettuce", "romaine"], broccoli: ["broccoli"],
  carrots: ["carrot", "carrots"], mushrooms: ["mushroom", "mushrooms"], zucchini: ["zucchini", "courgette"], cucumber: ["cucumber"], avocado: ["avocado", "avocados"],
  limes: ["lime", "limes", "lime juice"], lemons: ["lemon", "lemons", "lemon juice"], cilantro: ["cilantro", "coriander leaves"], ginger: ["ginger"],
  black_beans: ["black beans"], chickpeas: ["chickpeas", "garbanzo beans"], pinto_beans: ["pinto beans"], kidney_beans: ["kidney beans"], lentils: ["lentils", "green lentils", "brown lentils"], red_lentils: ["red lentils"],
  chicken_broth: ["chicken broth", "chicken stock"], veg_broth: ["vegetable broth", "vegetable stock"], coconut_milk: ["coconut milk"], soy_sauce: ["soy sauce", "tamari"],
  olive_oil: ["olive oil", "oil", "vegetable oil", "canola oil"], butter: ["butter"], honey: ["honey", "maple syrup"], peanut_butter: ["peanut butter", "almond butter", "cashew butter", "nut butter", "pb"], salmon: ["salmon"], shrimp: ["shrimp", "prawns"],
  cod: ["cod", "white fish"], tilapia: ["tilapia"], tuna: ["tuna"], marinara: ["marinara", "pasta sauce", "tomato sauce"], salsa: ["salsa"], bananas: ["banana", "bananas"], apples: ["apple", "apples"], berries: ["berries", "blueberries", "strawberries", "raspberries"],
  quinoa: ["quinoa"], couscous: ["couscous"], feta: ["feta"], cottage_cheese: ["cottage cheese"], sour_cream: ["sour cream"], bacon: ["bacon"], corn: ["corn"], peas: ["peas"], edamame: ["edamame"],
  protein_powder: ["protein powder", "whey", "whey protein"], almond_milk: ["almond milk"], cream_cheese: ["cream cheese"], mayo: ["mayo", "mayonnaise"],
  flour: ["flour", "all purpose flour", "plain flour"], sugar: ["sugar", "granulated sugar", "brown sugar"], jalapeno: ["jalapeno", "jalapenos", "jalapeño", "jalapeños"],
  cabbage: ["cabbage", "red cabbage"], cauliflower: ["cauliflower"], cauliflower_rice: ["cauliflower rice", "riced cauliflower"], frozen_spinach: ["frozen spinach"],
  eggplant: ["eggplant", "aubergine"], plantains: ["plantain", "plantains"], parsley: ["parsley"], mango: ["mango"], cashews: ["cashew", "cashews"], chia: ["chia", "chia seeds"],
  ricotta: ["ricotta"], cannellini: ["cannellini", "white beans", "great northern beans"], refried_beans: ["refried beans"], sauerkraut: ["sauerkraut"], sesame_oil: ["sesame oil"],
  pork_chops: ["pork chop", "pork chops"], english_muffins: ["english muffin", "english muffins"], string_cheese: ["string cheese"], tempeh: ["tempeh"],
  curry_paste: ["curry paste", "red curry paste", "green curry paste"], gochujang: ["gochujang"], taco_seasoning: ["taco seasoning"], pita: ["pita", "pitas", "naan"],
  green_beans: ["green beans", "string beans"], coleslaw_mix: ["coleslaw mix", "coleslaw"], pineapple: ["pineapple"], enchilada_sauce: ["enchilada sauce"],
  teriyaki_sauce: ["teriyaki", "teriyaki sauce"], bbq_sauce: ["bbq sauce", "barbecue sauce"], egg_noodles: ["egg noodles"], rice_noodles: ["rice noodles", "pad thai noodles", "vermicelli"],
  chicken_sausage: ["chicken sausage"], deli_turkey: ["deli turkey", "sliced turkey"], stirfry_veg: ["stir fry vegetables", "stir-fry vegetables"], hummus: ["hummus"], pesto: ["pesto"],
};
/**
 * Words that name a different product from the food before them ("rice vinegar" is not rice,
 * "almond milk" is not almonds). A match must include the word to count.
 */
const PRODUCT_WORDS = new Set(["vinegar", "flour", "milk", "powder", "extract", "sauce", "paste", "oil", "broth", "stock", "butter", "syrup", "seasoning", "noodle", "cheese", "spray", "dressing", "chip", "cracker", "bar"]);

const singular = (w: string) => (w.length > 3 && w.endsWith("es") && /(oes|ches|shes)$/.test(w) ? w.slice(0, -2) : w.length > 3 && w.endsWith("s") && !w.endsWith("ss") ? w.slice(0, -1) : w);
const tokens = (s: string) => s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/\([^)]*\)/g, " ").replace(/[^a-z%\s-]/g, " ").split(/[\s-]+/).filter(Boolean).map(singular);

let ALIASES: { id: string; toks: string[] }[] | null = null;
function aliases() {
  if (ALIASES) return ALIASES;
  const out: { id: string; toks: string[] }[] = [];
  for (const ing of Object.values(INGREDIENTS)) {
    const core = tokens(ing.name).filter((t) => !MODIFIERS.has(t));
    if (core.length) out.push({ id: ing.id, toks: core });
    for (const a of EXTRA_ALIASES[ing.id] ?? []) out.push({ id: ing.id, toks: tokens(a) });
  }
  ALIASES = out;
  return out;
}

/** The catalog ingredient a recipe line is about, preferring the most specific name. */
export function matchIngredient(text: string, opts: ImportOptions = {}): string | null {
  const have = new Set(tokens(text));
  const products = opts.v2 ? [...have].filter((t) => PRODUCT_WORDS.has(t)) : [];
  let best: { id: string; score: number } | null = null;
  for (const a of aliases()) {
    if (!a.toks.every((t) => have.has(t))) continue;
    if (products.some((p) => !a.toks.includes(p) && !(p === "cheese" && CHEESES.has(a.id)))) continue;
    const score = a.toks.length * 10 + a.toks.join("").length / 10;
    if (!best || score > best.score) best = { id: a.id, score };
  }
  return best?.id ?? null;
}

const CHEESES = new Set(["cheddar", "mozzarella", "parmesan", "feta", "ricotta", "cottage_cheese", "cream_cheese", "string_cheese"]);

const editDistance1 = (a: string, b: string) => {
  if (a === b) return true;
  if (Math.abs(a.length - b.length) > 1) return false;
  let i = 0; let j = 0; let edits = 0;
  while (i < a.length && j < b.length) {
    if (a[i] === b[j]) { i++; j++; continue; }
    if (++edits > 1) return false;
    if (a.length > b.length) i++; else if (b.length > a.length) j++; else { i++; j++; }
  }
  return edits + (a.length - i) + (b.length - j) <= 1;
};
/** how well one word of a line stands for one word of a name: exact, a typo, or a shared start */
const wordFit = (w: string, t: string) => (w === t ? 1 : w.length >= 4 && t.length >= 4 && editDistance1(w, t) ? 0.8 : w.length >= 4 && t.length >= 4 && (w.startsWith(t) || t.startsWith(w)) ? 0.6 : 0);

/**
 * Close catalog ingredients for a line that didn't match exactly, best first: typos ("brocoli"),
 * partial names ("cherry tomato" → tomatoes) and near products ("almond butter" → peanut butter).
 */
export function suggestIngredients(text: string, n = 3): string[] {
  const words = tokens(text).filter((w) => w.length > 2 && !MODIFIERS.has(w) && !/^\d/.test(w) && !UNIT_WORDS.has(w));
  if (!words.length) return [];
  const best = new Map<string, number>();
  for (const a of aliases()) {
    let fit = 0;
    for (const t of a.toks) fit += Math.max(0, ...words.map((w) => wordFit(w, t)));
    if (!fit) continue;
    const score = fit / a.toks.length + fit / words.length / 2;
    if (score > (best.get(a.id) ?? 0)) best.set(a.id, score);
  }
  return [...best].filter(([, sc]) => sc >= 0.5).sort((x, y) => y[1] - x[1]).slice(0, n).map(([id]) => id);
}
const UNIT_WORDS = new Set(["cup", "tablespoon", "tbsp", "teaspoon", "tsp", "ounce", "pound", "lb", "gram", "can", "clove", "slice", "piece", "package", "container", "jar", "bag", "bunch", "head", "stalk", "pinch", "dash", "scoop", "stick", "chopped", "diced", "minced", "sliced", "divided", "optional", "taste", "about", "into", "for", "serving", "garnish", "cut", "inch", "piece"]);

/** The amount in a line that doesn't start with one: "Chicken breast, 2 lb" or "juice of 1 lime". */
function trailingAmount(line: string): { n: number; rest: string } | null {
  const m = line.match(/(?:^|[\s,(:])(\d+(?:\.\d+)?(?:\s+\d+\/\d+)?|\d+\/\d+|[½¼¾⅓⅔⅛])\s*([a-zA-Z.]+)?/);
  if (!m) return null;
  const num = parseNumber(m[1]!);
  return num ? { n: num.n, rest: `${m[2] ?? ""} ${line}`.trim() } : null;
}

/** Parse one ingredient line into a catalog ingredient and grams. */
export function parseLine(raw: string, opts: ImportOptions = {}): DraftLine | "skip" {
  const line = raw.replace(/^[-•*▢□\s]+/, "").trim();
  if (!line) return "skip";
  const id = matchIngredient(line, opts);
  if (!id && ALWAYS_ON_HAND.test(line)) return "skip";
  // "vanilla protein powder" names a flavor, not vanilla
  const onHandLine = opts.v2 ? line.replace(/\bvanilla\b(?!\s+(extract|bean))/gi, "") : line;
  if (id && ALWAYS_ON_HAND.test(onHandLine) && !/\b(oil|garlic|onion|pepper)s?\b/i.test(line.replace(/garlic powder|onion powder|black pepper|pepper flakes/gi, ""))) return "skip";
  if (!id) return { raw: line, ingredientId: null, grams: null, sure: false };
  const amount = amountFor(line, id, opts);
  if (amount === "skip") return "skip";
  return { raw: line, ingredientId: id, ...amount };
}

/** Grams of a catalog ingredient that a recipe line calls for, and whether that was measured or guessed. */
export function amountFor(line: string, id: string, opts: ImportOptions = {}): { grams: number | null; sure: boolean } | "skip" {
  const ing = INGREDIENTS[id];
  if (!ing) return { grams: null, sure: false };
  const num = parseNumber(line) ?? (opts.v2 ? trailingAmount(line) : null);
  let grams: number | null = null;
  let sure = false;
  if (num) {
    const unit = num.rest.replace(/^\([^)]*\)\s*/, "").match(UNIT_RE)?.[1]?.toLowerCase() ?? "";
    const n = num.n;
    const cup = CUP_GRAMS[id] ?? 200;
    if (/^(g|grams?)$/.test(unit)) { grams = n; sure = true; }
    else if (/^(kg|kilograms?)$/.test(unit)) { grams = n * 1000; sure = true; }
    else if (/^(oz|ounces?)/.test(unit)) { grams = n * 28.35; sure = true; }
    else if (/^(lbs?|pounds?)/.test(unit)) { grams = n * 453.6; sure = true; }
    else if (/^(cups?|c\.)$/.test(unit)) { grams = n * cup; sure = !!CUP_GRAMS[id]; }
    else if (/^(tablespoons?|tbsps?|tbs|t)\.?$/.test(unit) && unit !== "t") { grams = (n * cup) / 16; sure = !!CUP_GRAMS[id]; }
    else if (unit === "t" && /\bT\b/.test(num.rest)) { grams = (n * cup) / 16; sure = !!CUP_GRAMS[id]; }
    else if (/^(teaspoons?|tsps?|t)\.?$/.test(unit)) { grams = (n * cup) / 48; sure = !!CUP_GRAMS[id]; }
    else if (/^(ml|milliliters?)$/.test(unit)) { grams = (n * cup) / 240; sure = !!CUP_GRAMS[id]; }
    else if (/^(l|liters?)$/.test(unit)) { grams = (n * cup * 1000) / 240; sure = !!CUP_GRAMS[id]; }
    else if (/^cans?$/.test(unit)) { const oz = line.match(/(\d+(?:\.\d+)?)\s*-?\s*(?:oz|ounce)/i); grams = n * (oz ? Number(oz[1]) * 28.35 : /can/i.test(ing.pkg.label) ? ing.pkg.grams : 425); sure = !!oz; }
    else if (/^(packages?|pkg|containers?|jars?|bags?)$/.test(unit)) { const oz = line.match(/(\d+(?:\.\d+)?)\s*-?\s*(?:oz|ounce)/i); grams = n * (oz ? Number(oz[1]) * 28.35 : ing.pkg.grams); sure = !!oz; }
    else if (/^cloves?$/.test(unit)) { grams = n * 5; sure = id === "garlic"; }
    else if (/^(pinch|dash)$/.test(unit)) return "skip";
    else if (opts.v2 && /^slices?$/.test(unit)) { grams = n * (SLICE_GRAMS[id] ?? 20); sure = !!SLICE_GRAMS[id]; }
    else if (opts.v2 && /^scoops?$/.test(unit)) { grams = n * (SCOOP_GRAMS[id] ?? 30); sure = !!SCOOP_GRAMS[id]; }
    else if (opts.v2 && /^sticks?$/.test(unit)) { grams = n * (STICK_GRAMS[id] ?? 113); sure = !!STICK_GRAMS[id]; }
    else { grams = n * (ing.each?.grams ?? ONE_GRAMS[id] ?? 100); sure = !!(ing.each || ONE_GRAMS[id]); }
  }
  return { grams: grams ? Math.round(grams) : null, sure };
}

// ── Whole recipes ──
const isoMinutes = (s: unknown) => {
  if (typeof s !== "string") return 0;
  const m = s.match(/P(?:(\d+)D)?T?(?:(\d+)H)?(?:(\d+)M)?/i);
  return m ? Number(m[1] ?? 0) * 1440 + Number(m[2] ?? 0) * 60 + Number(m[3] ?? 0) : 0;
};
const firstInt = (v: unknown): number => {
  const s = Array.isArray(v) ? v.map(String).join(" ") : String(v ?? "");
  const m = s.match(/\d+/);
  return m ? Number(m[0]) : 0;
};
const decode = (s: string) => s.replace(/<[^>]+>/g, " ").replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/&#39;|&rsquo;|&#8217;/g, "'").replace(/&quot;|&#8220;|&#8221;/g, '"').replace(/&frac12;/g, "½").replace(/&frac14;/g, "¼").replace(/&frac34;/g, "¾").replace(/&#\d+;/g, " ").replace(/\s+/g, " ").trim();

function findRecipeNode(node: unknown): Record<string, unknown> | null {
  if (!node || typeof node !== "object") return null;
  if (Array.isArray(node)) { for (const n of node) { const r = findRecipeNode(n); if (r) return r; } return null; }
  const o = node as Record<string, unknown>;
  const t = o["@type"];
  if (t === "Recipe" || (Array.isArray(t) && t.includes("Recipe"))) return o;
  return findRecipeNode(o["@graph"]) ?? findRecipeNode(o["mainEntity"]);
}
function stepsOf(v: unknown): string[] {
  if (!v) return [];
  if (typeof v === "string") return v.split(/\n+|(?<=\.)\s+(?=[A-Z])/).map(decode).filter(Boolean);
  if (Array.isArray(v)) return v.flatMap(stepsOf);
  const o = v as Record<string, unknown>;
  if (o.itemListElement) return stepsOf(o.itemListElement);
  if (typeof o.text === "string") return [decode(o.text)];
  return [];
}

function guessMeal(name: string): MealType {
  if (/oat|pancake|waffle|breakfast|omelet|frittata|egg muffin|granola|smoothie|french toast|scramble|hash brown/i.test(name)) return "breakfast";
  if (/bites|\bbar(s)?\b|snack|energy ball|dip\b|trail mix|hummus/i.test(name)) return "snack";
  return "main";
}
function guessEquipment(steps: string): Equipment[] {
  const out: Equipment[] = [];
  if (/air fr/i.test(steps)) out.push("airFryer");
  if (/slow cooker|crock/i.test(steps)) out.push("slowCooker");
  if (/instant pot|pressure cook/i.test(steps)) out.push("pressureCooker");
  if (/\boven\b|\bbake|\broast|°f|° f|degrees/i.test(steps)) out.push("oven");
  if (/skillet|\bpan\b|saucepan|\bpot\b|simmer|\bboil|saut[eé]|stir-fry|wok/i.test(steps)) out.push("stovetop");
  if (/\bgrill/i.test(steps)) out.push("grill");
  if (/microwave/i.test(steps) && !out.length) out.push("microwave");
  return out.length ? out : ["noCook"];
}
const PROTEIN_OF: Record<string, ProteinSource> = {
  chicken_breast: "chicken", chicken_thigh: "chicken", ground_chicken: "chicken", chicken_sausage: "chicken", ground_turkey: "turkey", deli_turkey: "turkey",
  ground_beef: "beef", sirloin: "beef", pork_tenderloin: "pork", ground_pork: "pork", bacon: "pork", salmon: "fish", cod: "fish", tilapia: "fish", tuna: "fish",
  shrimp: "shellfish", eggs: "eggs", egg_whites: "eggs", greek_yogurt: "dairy", cottage_cheese: "dairy", tofu: "soy", tempeh: "soy", edamame: "soy",
  black_beans: "legumes", chickpeas: "legumes", pinto_beans: "legumes", kidney_beans: "legumes", lentils: "legumes", red_lentils: "legumes",
};

/** A draft line for one ingredient line, with suggestions when v2 can't match it. */
export function draftLine(raw: string, opts: ImportOptions = {}): DraftLine | "skip" {
  const p = parseLine(raw, opts);
  if (p === "skip" || p.ingredientId || !opts.v2) return p;
  const suggestions = suggestIngredients(p.raw);
  return suggestions.length ? { ...p, suggestions } : p;
}

function draftFrom(name: string, servings: number, ingredientLines: string[], steps: string[], active: number, total: number, source?: string, opts: ImportOptions = {}): RecipeDraft {
  const lines: DraftLine[] = [];
  const skipped: string[] = [];
  for (const raw of ingredientLines) {
    const p = draftLine(decode(raw), opts);
    if (p === "skip") { if (raw.trim()) skipped.push(decode(raw)); } else lines.push(p);
  }
  const proteins = [...new Set(lines.map((l) => (l.ingredientId ? PROTEIN_OF[l.ingredientId] : undefined)).filter((p): p is ProteinSource => !!p))];
  const t = total || active || 30;
  return {
    name: name || "Imported recipe", servings: Math.min(12, Math.max(1, servings || 4)),
    activeMinutes: Math.min(t, active || Math.min(30, t)), totalMinutes: t, meal: guessMeal(name),
    equipment: guessEquipment(steps.join(" ")), proteins, lines, steps, skipped, source,
  };
}

/** A draft from a schema.org Recipe object (from JSON-LD, or sent by the "Save to MacroAisle" bookmark). */
export function draftFromRecipeNode(r: Record<string, unknown>, source?: string, opts: ImportOptions = {}): RecipeDraft {
  const ings = (Array.isArray(r.recipeIngredient) ? r.recipeIngredient : Array.isArray(r.ingredients) ? r.ingredients : typeof r.recipeIngredient === "string" ? r.recipeIngredient.split(/\n+/) : []).map(String);
  return draftFrom(decode(String(r.name ?? "")), firstInt(r.recipeYield), ings, stepsOf(r.recipeInstructions), isoMinutes(r.prepTime), isoMinutes(r.totalTime) || isoMinutes(r.prepTime) + isoMinutes(r.cookTime), source, opts);
}

/** Read a recipe from page HTML (schema.org Recipe JSON-LD) or from pasted recipe text. */
export function parseRecipe(input: string, source?: string, opts: ImportOptions = {}): RecipeDraft {
  if (/<script[^>]+ld\+json/i.test(input)) {
    for (const m of input.matchAll(/<script[^>]+application\/ld\+json[^>]*>([\s\S]*?)<\/script>/gi)) {
      let data: unknown;
      try { data = JSON.parse(m[1]!.trim()); } catch { continue; }
      const r = findRecipeNode(data);
      if (!r) continue;
      if (opts.v2) return draftFromRecipeNode(r, source, opts);
      const ings = (Array.isArray(r.recipeIngredient) ? r.recipeIngredient : Array.isArray(r.ingredients) ? r.ingredients : []).map(String);
      return draftFrom(decode(String(r.name ?? "")), firstInt(r.recipeYield), ings, stepsOf(r.recipeInstructions), isoMinutes(r.prepTime), isoMinutes(r.totalTime) || isoMinutes(r.prepTime) + isoMinutes(r.cookTime), source);
    }
  }
  // plain text
  const text = /<\w+[^>]*>/.test(input) ? input.replace(/<(br|\/p|\/li|\/h\d|\/div)[^>]*>/gi, "\n").replace(/<[^>]+>/g, " ") : input;
  const rows = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  const ingHead = rows.findIndex((l) => /^ingredients:?$/i.test(l));
  const stepHead = rows.findIndex((l) => /^(instructions|directions|method|steps|preparation):?$/i.test(l));
  const name = rows.find((l, i) => i !== ingHead && i !== stepHead && !/^\d/.test(l)) ?? "";
  const serves = firstInt(text.match(/(?:serves|servings|yield|makes)\s*:?\s*(\d+)/i)?.[1] ?? text.match(/(\d+)\s+servings/i)?.[1]);
  const mins = (re: RegExp) => { const m = text.match(re); if (!m) return 0; return Number(m[1] ?? 0) * (/h/i.test(m[2] ?? "") ? 60 : 1); };
  const active = mins(/prep(?:\s*time)?\s*:?\s*(\d+)\s*(min|h)/i);
  const total = mins(/total(?:\s*time)?\s*:?\s*(\d+)\s*(min|h)/i) || active + mins(/cook(?:\s*time)?\s*:?\s*(\d+)\s*(min|h)/i);
  let ingLines: string[];
  let steps: string[];
  if (ingHead >= 0) {
    const end = stepHead > ingHead ? stepHead : rows.length;
    ingLines = rows.slice(ingHead + 1, end);
    steps = stepHead >= 0 ? rows.slice(stepHead + 1) : [];
  } else {
    ingLines = rows.filter((l) => /^[-•*]?\s*[\d½¼¾⅓⅔]/.test(l) && l.length < 90);
    steps = rows.filter((l) => !ingLines.includes(l) && l !== name && l.length >= 40);
  }
  steps = steps.map((s) => s.replace(/^(step\s*)?\d+[.)]\s*/i, "")).filter((s) => s.length > 3 && !/^(notes?|nutrition)/i.test(s));
  return draftFrom(name, serves, ingLines, steps, active, total, source, opts);
}

/** A checked draft as a recipe seed the catalog can build. */
export function draftToSeed(d: RecipeDraft, id: string, cuisine: string, fridgeDays = 4, freezer = false): RecipeSeed {
  const items = new Map<string, number>();
  for (const l of d.lines) if (l.ingredientId && l.grams && l.grams > 0) items.set(l.ingredientId, (items.get(l.ingredientId) ?? 0) + l.grams);
  return {
    id, name: d.name.slice(0, 80), meal: d.meal, cuisines: cuisine, moods: "", flavors: "", protein: d.proteins.join(" "), equipment: d.equipment.join(" "),
    meta: { serv: d.servings, active: d.activeMinutes, total: Math.max(d.totalMinutes, d.activeMinutes), fridge: fridgeDays, freezer },
    items: [...items], steps: d.steps.length ? d.steps : ["Follow the original recipe."], ...(d.source ? { source: d.source } : {}),
  };
}

const MEALS = new Set<MealType>(["breakfast", "main", "snack"]);
/** A saved recipe back into a draft, to edit it. Lines show their amounts in grams. */
export function seedToDraft(seed: RecipeSeed): RecipeDraft {
  const words = (v: string) => v.split(/\s+/).filter(Boolean);
  return {
    name: seed.name, servings: seed.meta.serv, activeMinutes: seed.meta.active, totalMinutes: seed.meta.total,
    meal: MEALS.has(seed.meal as MealType) ? (seed.meal as MealType) : "main",
    equipment: words(seed.equipment) as Equipment[], proteins: words(seed.protein) as ProteinSource[],
    lines: seed.items.map(([id, grams]) => ({ raw: `${Math.round(grams)} g ${INGREDIENTS[id]?.name.toLowerCase() ?? id}`, ingredientId: INGREDIENTS[id] ? id : null, grams, sure: true })),
    steps: seed.steps.filter((x) => x !== "Follow the original recipe."), skipped: [], ...(seed.source ? { source: seed.source } : {}),
  };
}
