import { describe, it, expect } from "vitest";
import {
  groupTasksByDue,
  computeBoundaries,
  bucketForDueYmd,
  TAREA_BUCKET_ORDER,
  OPEN_TASK_STATUSES,
  isOpenTaskStatus,
} from "../tareas.service";
import { utcDateFromYmd, ymdInChile, addDaysChile } from "@/lib/dates-cl";

const now = new Date("2026-07-15T15:00:00Z");
const b = computeBoundaries(now);

/** ymd desplazado N días desde hoy (Chile). */
function shift(days: number): string {
  return ymdInChile(addDaysChile(now, days));
}
/** Mañana Chile del ymd (12:00 UTC = mañana Chile, mismo día). */
function dueOn(ymd: string): string {
  return new Date(utcDateFromYmd(ymd).getTime() + 12 * 3600 * 1000).toISOString();
}

describe("OPEN_TASK_STATUSES", () => {
  it("incluye recordatorios ya notificados como pendientes", () => {
    expect(OPEN_TASK_STATUSES).toEqual(["open", "notified", "notified_no_slack"]);
    expect(isOpenTaskStatus("open")).toBe(true);
    expect(isOpenTaskStatus("notified")).toBe(true);
    expect(isOpenTaskStatus("notified_no_slack")).toBe(true);
    expect(isOpenTaskStatus("done")).toBe(false);
    expect(isOpenTaskStatus("cancelled")).toBe(false);
  });
});

describe("bucketForDueYmd", () => {
  it("clasifica cada frontera correctamente", () => {
    expect(bucketForDueYmd(null, b)).toBe("sin_fecha");
    expect(bucketForDueYmd(shift(-1), b)).toBe("vencidas");
    expect(bucketForDueYmd(b.today, b)).toBe("hoy");
    expect(bucketForDueYmd(b.tomorrow, b)).toBe("manana");
    expect(bucketForDueYmd(shift(4), b)).toBe("semana");
    expect(bucketForDueYmd(b.weekEnd, b)).toBe("semana"); // inclusive
    expect(bucketForDueYmd(shift(20), b)).toBe("adelante");
  });
});

describe("groupTasksByDue", () => {
  const tasks = [
    { id: "past", dueAt: dueOn(shift(-3)) },
    { id: "today", dueAt: dueOn(b.today) },
    { id: "tomorrow", dueAt: dueOn(b.tomorrow) },
    { id: "week", dueAt: dueOn(shift(3)) },
    { id: "ahead", dueAt: dueOn(shift(20)) },
    { id: "none", dueAt: null },
  ];

  it("agrupa en el orden canónico y omite grupos vacíos", () => {
    const groups = groupTasksByDue(tasks, now);
    expect(groups.map((g) => g.bucket)).toEqual([
      "vencidas",
      "hoy",
      "manana",
      "semana",
      "adelante",
      "sin_fecha",
    ]);
    expect(groups.find((g) => g.bucket === "hoy")?.tasks.map((t) => t.id)).toEqual(["today"]);
    expect(groups.find((g) => g.bucket === "sin_fecha")?.tasks.map((t) => t.id)).toEqual(["none"]);
  });

  it("omite grupos sin tareas", () => {
    const groups = groupTasksByDue([{ id: "x", dueAt: null }], now);
    expect(groups).toHaveLength(1);
    expect(groups[0].bucket).toBe("sin_fecha");
  });

  it("respeta el orden global de buckets", () => {
    expect(TAREA_BUCKET_ORDER[0]).toBe("vencidas");
    expect(TAREA_BUCKET_ORDER.at(-1)).toBe("sin_fecha");
  });
});
