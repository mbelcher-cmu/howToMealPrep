/** Tiny builder for CPLEX LP format, which HiGHS reads. */
export class LpModel {
  private objective = new Map<string, number>();
  private rows: string[] = [];
  private bounds = new Map<string, [number, number | null]>();
  private ints = new Set<string>();
  private bins = new Set<string>();
  private n = 0;

  addObjective(v: string, coef: number) {
    if (coef === 0) return;
    this.objective.set(v, (this.objective.get(v) ?? 0) + coef);
  }
  /** terms: [coef, var][]; sense: <=, >=, = */
  addRow(terms: [number, string][], sense: "<=" | ">=" | "=", rhs: number, name?: string) {
    const merged = new Map<string, number>();
    for (const [c, v] of terms) if (c !== 0 && Number.isFinite(c)) merged.set(v, (merged.get(v) ?? 0) + c);
    if (merged.size === 0) return;
    this.rows.push(` ${name ?? `r${this.n++}`}: ${fmtTerms(merged)} ${sense} ${num(rhs)}`);
  }
  bound(v: string, lo: number, hi: number | null) { this.bounds.set(v, [lo, hi]); }
  integer(v: string) { this.ints.add(v); }
  binary(v: string) { this.bins.add(v); }

  toString(): string {
    const obj = this.objective.size ? fmtTerms(this.objective) : "0 dummy";
    const bounds = [...this.bounds].map(([v, [lo, hi]]) => (hi == null ? ` ${v} >= ${num(lo)}` : ` ${num(lo)} <= ${v} <= ${num(hi)}`));
    return [
      "Minimize", ` obj: ${obj}`, "Subject To", ...this.rows,
      "Bounds", ...bounds,
      ...(this.ints.size ? ["General", ` ${[...this.ints].join(" ")}`] : []),
      ...(this.bins.size ? ["Binary", ` ${[...this.bins].join(" ")}`] : []),
      "End",
    ].join("\n");
  }
}

function num(x: number): string {
  if (!Number.isFinite(x)) throw new Error(`Non-finite number in model: ${x}`);
  const r = Math.round(x * 1e6) / 1e6;
  return r.toFixed(6).replace(/\.?0+$/, "") || "0";
}
function fmtTerms(m: Map<string, number>): string {
  let s = "";
  for (const [v, c] of m) {
    const a = num(Math.abs(c));
    if (a === "0") continue;
    s += `${s ? (c < 0 ? " - " : " + ") : c < 0 ? "- " : ""}${a} ${v}`;
  }
  return s || "0 dummy";
}
