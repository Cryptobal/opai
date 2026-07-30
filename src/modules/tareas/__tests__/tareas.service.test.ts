import { describe, it, expect } from "vitest";
import {
  groupTasksByDue,
  byDueThenPriority,
  computeBoundaries,
  bucketForDueYmd,
  TAREA_BUCKET_ORDER,
  OPEN_TASK_STATUSES,
  isOpenTaskStatus,
  priorityRank,
} from "../tareas.service";
import { groupTasksBy } from "../tareas-group";
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

  it("ordena dentro del bucket por dueAt y luego prioridad", () => {
    const groups = groupTasksByDue(
      [
        { id: "low", dueAt: dueOn(b.today), priority: "low" },
        { id: "high", dueAt: dueOn(b.today), priority: "high" },
        { id: "med", dueAt: dueOn(b.today), priority: "medium" },
      ],
      now,
    );
    expect(groups[0].tasks.map((t) => t.id)).toEqual(["high", "med", "low"]);
  });
});

describe("byDueThenPriority / priorityRank", () => {
  it("prioriza high > medium > low > null", () => {
    expect(priorityRank("high")).toBeLessThan(priorityRank("medium"));
    expect(priorityRank("medium")).toBeLessThan(priorityRank("low"));
    expect(priorityRank("low")).toBeLessThan(priorityRank(null));
  });

  it("pone sin fecha al final", () => {
    const a = { dueAt: dueOn(b.today), priority: "low" as const };
    const bTask = { dueAt: null, priority: "high" as const };
    expect(byDueThenPriority(a, bTask)).toBeLessThan(0);
  });
});

describe("groupTasksBy", () => {
  const items = [
    {
      id: "a",
      dueAt: dueOn(b.today),
      priority: "high" as const,
      emailThreadId: "t1",
      dealId: null,
      assigneeIds: ["u1"],
    },
    {
      id: "b",
      dueAt: dueOn(shift(3)),
      priority: "low" as const,
      emailThreadId: null,
      dealId: "d1",
      assigneeIds: ["u2"],
    },
    {
      id: "c",
      dueAt: null,
      priority: null,
      emailThreadId: null,
      dealId: null,
      assigneeIds: [] as string[],
    },
  ];

  it("vista fecha delega en groupTasksByDue", () => {
    const g = groupTasksBy("fecha", items, { now });
    expect(g.map((x) => x.key)).toEqual(["hoy", "semana", "sin_fecha"]);
  });

  it("vista prioridad agrupa high/low/none", () => {
    const g = groupTasksBy("prioridad", items, { now });
    expect(g.map((x) => x.key)).toEqual(["high", "low", "none"]);
    expect(g[0].label).toBe("Alta");
  });

  it("vista responsable usa nombres del ctx", () => {
    const g = groupTasksBy("responsable", items, {
      now,
      assigneeNames: { u1: "Ana", u2: "Beto" },
    });
    expect(g.find((x) => x.key === "u1")?.label).toBe("Ana");
    expect(g.find((x) => x.key === "sin_responsable")?.tasks.map((t) => t.id)).toEqual(["c"]);
  });

  it("vista origen distingue mail/deal/manual", () => {
    const g = groupTasksBy("origen", items, { now });
    expect(g.map((x) => x.key)).toEqual(["mail", "deal", "manual"]);
  });
});
