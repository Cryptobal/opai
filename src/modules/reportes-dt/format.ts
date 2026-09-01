import { ymdInChile } from "@/lib/dates-cl";

/** dd/mm/aa (Art. 27). */
export function fmtDdMmAa(date: Date | string): string {
  const ymd = typeof date === "string" && /^\d{4}-\d{2}-\d{2}/.test(date)
    ? date.slice(0, 10)
    : ymdInChile(typeof date === "string" ? new Date(date) : date);
  const [y, m, d] = ymd.split("-");
  return `${d}/${m}/${y.slice(2)}`;
}

export function fmtHms(value: Date | string | null | undefined): string {
  if (!value) return "";
  const d = typeof value === "string" ? new Date(value) : value;
  if (Number.isNaN(d.getTime())) {
    const m = String(value).match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?$/);
    if (m) return `${m[1]!.padStart(2, "0")}:${m[2]}:${(m[3] ?? "00").padStart(2, "0")}`;
    return "";
  }
  return d.toLocaleTimeString("es-CL", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
    timeZone: "America/Santiago",
  });
}

export function minutesToHms(totalMinutes: number, sign: "+" | "-" | "" = ""): string {
  const abs = Math.abs(Math.round(totalMinutes));
  const h = Math.floor(abs / 60);
  const m = abs % 60;
  const core = `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:00`;
  if (sign === "-") return `-${core}`;
  if (sign === "+") return `+${core}`;
  return core;
}

export function shiftRangeHms(start: string | null | undefined, end: string | null | undefined): string {
  if (!start || !end) return "";
  const toHms = (s: string) => {
    const parts = s.split(":");
    const hh = (parts[0] ?? "00").padStart(2, "0");
    const mm = (parts[1] ?? "00").padStart(2, "0");
    const ss = (parts[2] ?? "00").padStart(2, "0");
    return `${hh}:${mm}:${ss}`;
  };
  return `${toHms(start)} - ${toHms(end)}`;
}

export function fullName(firstName: string, lastName: string): string {
  return `${firstName} ${lastName}`.trim();
}
