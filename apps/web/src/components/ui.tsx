"use client";
import { useEffect, useId, useState, type ReactNode } from "react";
import { cx } from "@/lib/format";

export function Card({ children, className, id, as: As = "section" }: { children: ReactNode; className?: string; id?: string; as?: "section" | "div" | "article" }) {
  return <As id={id} className={cx("card p-4 sm:p-5", className)}>{children}</As>;
}

export function PageHeader({ title, lead, action, eyebrow }: { title: string; lead?: ReactNode; action?: ReactNode; eyebrow?: ReactNode }) {
  return (
    <header className="mb-5 flex flex-wrap items-end justify-between gap-3">
      <div className="min-w-0">
        {eyebrow && <p className="label mb-1.5">{eyebrow}</p>}
        <h1 className="page-title font-display text-[28px] font-bold leading-tight tracking-tight sm:text-[32px]">{title}</h1>
        {lead && <p className="mt-1 max-w-[62ch] text-muted">{lead}</p>}
      </div>
      {action}
    </header>
  );
}

export function SectionTitle({ children, aside }: { children: ReactNode; aside?: ReactNode }) {
  return (
    <div className="mb-3 flex items-center justify-between gap-3">
      <h2 className="font-display text-lg font-bold">{children}</h2>
      {aside}
    </div>
  );
}

/**
 * Number input that updates its value on every keystroke that forms a valid number
 * (so plans recalculate live), and snaps to the allowed range when it loses focus.
 */
export function NumberField({
  label, value, onChange, min, max, step = 1, suffix, prefix, hint, id: idProp, compact, hideLabel,
}: {
  label: string; value: number; onChange: (v: number) => void; min?: number; max?: number; step?: number;
  suffix?: string; prefix?: string; hint?: ReactNode; id?: string; compact?: boolean;
  /** keep the label for screen readers but show a blank line in its place (e.g. inches next to feet) */
  hideLabel?: boolean;
}) {
  const auto = useId();
  const id = idProp ?? auto;
  const [text, setText] = useState(String(value));
  const [focused, setFocused] = useState(false);
  useEffect(() => { if (!focused) setText(String(value)); }, [value, focused]);
  const clamp = (n: number) => Math.min(max ?? Infinity, Math.max(min ?? -Infinity, n));
  return (
    <div className="grid min-w-0 gap-1">
      <label htmlFor={id} className={cx("text-[13px] text-muted", compact && "text-xs")}>{hideLabel ? <><span aria-hidden>&nbsp;</span><span className="sr-only">{label}</span></> : label}</label>
      <div className="relative flex items-center">
        {prefix && <span className="pointer-events-none absolute left-3 text-muted">{prefix}</span>}
        <input
          id={id}
          inputMode="decimal"
          className={cx("input num pr-9", prefix && "pl-6")}
          value={text}
          onFocus={() => setFocused(true)}
          onChange={(e) => {
            setText(e.target.value);
            const n = Number(e.target.value);
            if (e.target.value.trim() !== "" && Number.isFinite(n) && n >= (min ?? -Infinity) && n <= (max ?? Infinity)) onChange(n);
          }}
          onBlur={() => {
            setFocused(false);
            const n = Number(text);
            const v = Number.isFinite(n) && text.trim() !== "" ? clamp(n) : value;
            if (v !== value) onChange(v);
            setText(String(v));
          }}
          onKeyDown={(e) => {
            if (e.key !== "ArrowUp" && e.key !== "ArrowDown") return;
            e.preventDefault();
            const v = clamp(value + (e.key === "ArrowUp" ? step : -step));
            onChange(v);
            setText(String(v));
          }}
        />
        {suffix && <span className="pointer-events-none absolute right-3 text-sm text-muted">{suffix}</span>}
      </div>
      {hint && <div className="text-xs text-muted">{hint}</div>}
    </div>
  );
}

export function Stepper({ label, value, onChange, min, max, format }: { label: string; value: number; onChange: (v: number) => void; min: number; max: number; format?: (v: number) => string }) {
  const id = useId();
  return (
    <div className="grid gap-1">
      <span id={id} className="text-[13px] text-muted">{label}</span>
      <div role="group" aria-labelledby={id} className="stepper flex items-center overflow-hidden rounded-lg border border-line bg-bg">
        <button type="button" className="press h-10 w-11 text-lg font-semibold hover:bg-sunk active:bg-sunk disabled:opacity-40" onClick={() => onChange(Math.max(min, value - 1))} disabled={value <= min} aria-label={`Fewer ${label.toLowerCase()}`}>−</button>
        <output className="num flex-1 text-center font-semibold" aria-live="polite">{format ? format(value) : value}</output>
        <button type="button" className="press h-10 w-11 text-lg font-semibold hover:bg-sunk active:bg-sunk disabled:opacity-40" onClick={() => onChange(Math.min(max, value + 1))} disabled={value >= max} aria-label={`More ${label.toLowerCase()}`}>+</button>
      </div>
    </div>
  );
}

export function Segmented<T extends string>({ label, value, options, onChange, size = "md" }: { label: string; value: T; options: { value: T; label: string }[]; onChange: (v: T) => void; size?: "sm" | "md" }) {
  return (
    <div role="radiogroup" aria-label={label} className="seg grid auto-cols-fr grid-flow-col overflow-hidden rounded-lg border border-line">
      {options.map((o, i) => (
        <button
          key={o.value}
          type="button"
          role="radio"
          aria-checked={value === o.value}
          onClick={() => onChange(o.value)}
          className={cx(
            "px-2 text-center transition-colors active:bg-sunk",
            size === "sm" ? "min-h-[34px] text-[13px]" : "min-h-[40px] text-sm",
            i > 0 && "border-l border-line",
            value === o.value ? "bg-accent-soft font-semibold text-ink" : "bg-bg text-muted hover:bg-sunk",
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function Chip({ selected, onClick, children, tone = "accent", title }: { selected: boolean; onClick: () => void; children: ReactNode; tone?: "accent" | "warn"; title?: string }) {
  return (
    <button
      type="button"
      aria-pressed={selected}
      title={title}
      onClick={onClick}
      className={cx(
        "press min-h-[36px] shrink-0 whitespace-nowrap rounded-full border px-3.5 text-[13px]",
        selected ? (tone === "warn" ? "border-warn bg-warn-soft font-semibold text-warn" : "border-accent bg-accent font-semibold text-accent-ink") : "border-line bg-surface text-ink hover:bg-sunk",
      )}
    >
      {children}
    </button>
  );
}

/** A tag that cycles through nothing → want → must → avoid. */
export function WishChip({ label, wish, onChange }: { label: string; wish: "must" | "nice" | "avoid" | undefined; onChange: (w: "must" | "nice" | "avoid" | null) => void }) {
  const next = { undefined: "nice", nice: "must", must: "avoid", avoid: null } as const;
  const text = wish === "must" ? "Must" : wish === "nice" ? "Want" : wish === "avoid" ? "Avoid" : null;
  return (
    <button
      type="button"
      onClick={() => onChange(next[String(wish) as keyof typeof next] as never)}
      aria-label={`${label}: ${text ?? "no preference"}. Tap to change.`}
      className={cx(
        "press inline-flex min-h-[34px] items-center gap-1.5 rounded-full border px-3 text-[13px]",
        wish === "must" && "border-accent bg-accent font-semibold text-accent-ink",
        wish === "nice" && "border-accent bg-accent-soft font-semibold text-ink",
        wish === "avoid" && "border-warn bg-warn-soft text-warn line-through decoration-1",
        !wish && "border-line bg-bg hover:bg-sunk",
      )}
    >
      {label}
      {text && wish !== "avoid" && <span className="text-[11px] font-semibold uppercase tracking-wide opacity-80">{text}</span>}
    </button>
  );
}

export function Toggle({ checked, onChange, label, detail }: { checked: boolean; onChange: (v: boolean) => void; label: string; detail?: string }) {
  const id = useId();
  return (
    <label htmlFor={id} className="flex cursor-pointer items-center justify-between gap-3 py-1">
      <span className="min-w-0">
        <span className="block text-sm font-medium">{label}</span>
        {detail && <span className="block text-xs text-muted">{detail}</span>}
      </span>
      <span className="relative inline-flex shrink-0">
        <input id={id} type="checkbox" role="switch" className="peer sr-only" checked={checked} onChange={(e) => onChange(e.target.checked)} />
        <span className="h-6 w-11 rounded-full bg-line transition-colors peer-checked:bg-accent peer-focus-visible:outline peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-accent" />
        <span className="absolute left-0.5 top-0.5 h-5 w-5 rounded-full bg-surface shadow transition-transform peer-checked:translate-x-5" />
      </span>
    </label>
  );
}

export function Slider({ label, value, onChange, min, max, step, left, right }: { label: string; value: number; onChange: (v: number) => void; min: number; max: number; step: number; left: string; right: string }) {
  const id = useId();
  return (
    <div className="grid gap-1">
      <label htmlFor={id} className="text-[13px] text-muted">{label}</label>
      <input id={id} type="range" min={min} max={max} step={step} value={value} onChange={(e) => onChange(Number(e.target.value))} className="w-full accent-[rgb(var(--accent))]" />
      <div className="flex justify-between text-xs text-muted"><span>{left}</span><span>{right}</span></div>
    </div>
  );
}

/** Actual vs target with a target tick. */
export function MacroMeter({ label, actual, target, unit, color }: { label: string; actual: number; target: number; unit: string; color: string }) {
  const max = Math.max(target * 1.3, actual * 1.05, 1);
  const off = target > 0 ? (actual - target) / target : 0;
  return (
    <div className="min-w-0">
      <div className="label">{label}</div>
      <div className="num mt-0.5 text-[22px] font-semibold leading-tight">
        {Math.round(actual).toLocaleString()}<span className="text-sm font-normal text-muted">{unit}</span>
      </div>
      <div className="text-xs text-muted">
        target {Math.round(target).toLocaleString()}{unit}
        {Math.abs(off) >= 0.01 && <span className={cx("ml-1", (label === "Protein" ? off < -0.1 : Math.abs(off) > 0.15) ? "text-warn" : "")}>({off > 0 ? "+" : ""}{Math.round(off * 100)}%)</span>}
      </div>
      <div className="relative mt-1.5 h-1.5 rounded-full bg-sunk" role="img" aria-label={`${label} ${Math.round(actual)} of ${Math.round(target)} ${unit}`}>
        <div className="h-full rounded-full transition-[width]" style={{ width: `${(actual / max) * 100}%`, background: color }} />
        <div className="absolute -bottom-0.5 -top-0.5 w-0.5 bg-ink/50" style={{ left: `${(target / max) * 100}%` }} />
      </div>
    </div>
  );
}

export function EmptyState({ title, children, action }: { title: string; children?: ReactNode; action?: ReactNode }) {
  return (
    <div className="card grid place-items-center gap-2 px-6 py-12 text-center">
      <h2 className="font-display text-lg font-bold">{title}</h2>
      {children && <div className="max-w-[48ch] text-muted">{children}</div>}
      {action && <div className="mt-2">{action}</div>}
    </div>
  );
}

export function Tag({ children }: { children: ReactNode }) {
  return <span className="tag rounded bg-sunk px-1.5 py-0.5 text-[11px] font-semibold uppercase tracking-wide text-muted">{children}</span>;
}

/** Your own 1 to 5 star rating. Tap the current rating again to clear it. */
export function Stars({ value, onChange, label = "Your rating" }: { value: number | undefined; onChange: (v: number | null) => void; label?: string }) {
  const words = ["", "Never plan it", "Not for me", "It's fine", "Like it", "Love it"];
  return (
    <div className="flex items-center gap-2">
      <div role="radiogroup" aria-label={label} className="flex">
        {[1, 2, 3, 4, 5].map((n) => (
          <button key={n} role="radio" aria-checked={value === n} aria-label={`${n} star${n === 1 ? "" : "s"}: ${words[n]}`} onClick={() => onChange(value === n ? null : n)}
            className={`grid h-9 w-8 place-items-center text-xl leading-none ${value && n <= value ? "text-carbs" : "text-line hover:text-muted"}`}>★</button>
        ))}
      </div>
      <span className="text-xs text-muted">{value ? words[value] : label}</span>
    </div>
  );
}

/** A progress ring with an optional icon in the middle. value/target, capped at a full ring. */
export function Ring({ value, target, size = 64, stroke = 6, color, children, label }: { value: number; target: number; size?: number; stroke?: number; color: string; children?: ReactNode; label: string }) {
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const share = target > 0 ? Math.min(1, Math.max(0, value / target)) : 0;
  return (
    <span className="relative inline-grid shrink-0 place-items-center" style={{ width: size, height: size }} role="img" aria-label={label}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="absolute inset-0 -rotate-90" aria-hidden>
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="rgb(var(--sunk))" strokeWidth={stroke} />
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={color} strokeWidth={stroke} strokeLinecap="round"
          strokeDasharray={c} strokeDashoffset={c * (1 - share)} style={{ transition: "stroke-dashoffset 600ms var(--ease-out)" }} />
      </svg>
      {children && <span className="relative grid place-items-center" aria-hidden>{children}</span>}
    </span>
  );
}
