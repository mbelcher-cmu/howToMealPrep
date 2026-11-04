/** Minimal iCalendar (RFC 5545) builder for prep reminders. Times are written in local "floating" time. */
export interface CalEvent { uid: string; start: Date; minutes: number; title: string; description?: string; alarmMinutesBefore?: number }

const pad = (n: number) => String(n).padStart(2, "0");
const stamp = (d: Date) => `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}T${pad(d.getHours())}${pad(d.getMinutes())}00`;
const utcStamp = (d: Date) => d.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
/** Escape text and fold long lines at 74 characters, as the format requires. */
const text = (s: string) => s.replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\r?\n/g, "\\n");
const fold = (line: string) => {
  const out: string[] = [];
  for (let i = 0; i < line.length; i += 73) out.push((i ? " " : "") + line.slice(i, i + 73));
  return out.join("\r\n");
};

export function buildIcs(events: CalEvent[]): string {
  const now = utcStamp(new Date());
  const lines = ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//Prep Cart//Meal prep//EN", "CALSCALE:GREGORIAN"];
  for (const e of events) {
    const end = new Date(e.start.getTime() + e.minutes * 60000);
    lines.push("BEGIN:VEVENT", `UID:${e.uid}@prepcart`, `DTSTAMP:${now}`, `DTSTART:${stamp(e.start)}`, `DTEND:${stamp(end)}`, fold(`SUMMARY:${text(e.title)}`));
    if (e.description) lines.push(fold(`DESCRIPTION:${text(e.description)}`));
    if (e.alarmMinutesBefore != null) lines.push("BEGIN:VALARM", "ACTION:DISPLAY", fold(`DESCRIPTION:${text(e.title)}`), `TRIGGER:-PT${e.alarmMinutesBefore}M`, "END:VALARM");
    lines.push("END:VEVENT");
  }
  lines.push("END:VCALENDAR");
  return lines.join("\r\n") + "\r\n";
}

/** The next date (today or later) that falls on a weekday, 0 = Monday. */
export function nextWeekday(weekday: number, from = new Date()): Date {
  const d = new Date(from.getFullYear(), from.getMonth(), from.getDate());
  const cur = (d.getDay() + 6) % 7;
  d.setDate(d.getDate() + ((weekday - cur + 7) % 7));
  return d;
}

export function at(day: Date, hhmm: string, plusDays = 0): Date {
  const [h, m] = hhmm.split(":").map(Number);
  const d = new Date(day.getFullYear(), day.getMonth(), day.getDate() + plusDays, h ?? 0, m ?? 0);
  return d;
}

export function downloadText(name: string, body: string, type: string) {
  const url = URL.createObjectURL(new Blob([body], { type }));
  const a = Object.assign(document.createElement("a"), { href: url, download: name });
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
