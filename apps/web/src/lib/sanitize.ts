/**
 * Loading a save from this device (or from the cloud) must never crash the app. Saved values whose
 * shape doesn't match the defaults (null where an object belongs, a string where a list belongs) are
 * dropped so the default is used, and saved objects are laid over the default object one level deep,
 * so a field added in a later release gets its default instead of undefined.
 */
type Kind = "array" | "null" | "object" | "number" | "string" | "boolean" | "undefined" | "other";
const kind = (v: unknown): Kind => (v === null ? "null" : Array.isArray(v) ? "array" : (["object", "number", "string", "boolean", "undefined"].includes(typeof v) ? (typeof v as Kind) : "other"));
const isPlain = (v: unknown): v is Record<string, unknown> => kind(v) === "object";

/** True when a saved value can stand in for the default. Defaults of null or undefined accept anything. */
function fits(saved: unknown, def: unknown): boolean {
  const d = kind(def);
  if (d === "null" || d === "undefined") return true;
  if (d === "number") return typeof saved === "number" && !Number.isNaN(saved);
  return kind(saved) === d;
}

function layer(saved: Record<string, unknown>, defaults: Record<string, unknown>, depth: number): Record<string, unknown> {
  const out: Record<string, unknown> = { ...defaults };
  for (const [k, v] of Object.entries(saved)) {
    if (!(k in defaults)) { out[k] = v; continue; }
    const d = defaults[k];
    if (!fits(v, d)) continue;
    out[k] = depth > 0 && isPlain(v) && isPlain(d) ? layer(v, d, depth - 1) : v;
  }
  return out;
}

/** The state to start from: defaults, overlaid with whatever of the save is usable. */
export function mergeSaved<T extends object>(saved: unknown, defaults: T): T {
  if (!isPlain(saved)) return defaults;
  return layer(saved, defaults as Record<string, unknown>, 1) as T;
}
