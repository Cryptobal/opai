import { describe, expect, it } from "vitest";
import { fromZonedTime } from "date-fns-tz";
import { CHILE_TZ } from "../dates-cl";
import {
  assignmentCoversDay,
  buildGrillaView,
  chipKind,
  crossesShift,
  deriveDurationMinutes,
  emptyKind,
  formatDurationLabel,
  formatHoursLabel,
  getInitials,
  isOutsideGeofence,
  mapIncident,
  mapVisit,
  shiftFromHour,
  shiftFromStart,
  sortGrillaRows,
  visitMatchesShift,
  type GrillaInstallation,
  type GrillaPayload,
  type GrillaVisit,
  type RawGrillaVisit,
} from "../supervision-grilla";

function at(year: number, month: number, day: number, hour: number, minute = 0): Date {
  return fromZonedTime(new Date(year, month - 1, day, hour, minute, 0, 0), CHILE_TZ);
}

function visit(partial: Partial<GrillaVisit> & Pick<GrillaVisit, "id" | "installationId" | "day" | "shift">): GrillaVisit {
  const name = partial.supervisorName ?? "Ana Bravo";
  return {
    supervisorName: name,
    initials: getInitials(name),
    checkInAt: "2026-08-10T12:00:00.000Z",
    checkOutAt: "2026-08-10T13:42:00.000Z",
    durationMinutes: 102,
    durationLabel: "1 h 42 min",
    crossedShift: false,
    shortVisit: false,
    noCheckout: false,
    outsideGeofence: false,
    status: "completed",
    findingCount: 0,
    ...partial,
  };
}

const siteA: GrillaInstallation = {
  id: "inst-a",
  name: "Mall Centro",
  openFindings: 2,
  nocturnoEnabled: true,
  assignmentWindows: [{ start: "2026-08-01", end: null }],
};

const siteB: GrillaInstallation = {
  id: "inst-b",
  name: "Bodega Norte",
  openFindings: 0,
  nocturnoEnabled: false,
  assignmentWindows: [{ start: "2026-08-01", end: null }],
};

const siteC: GrillaInstallation = {
  id: "inst-c",
  name: "Sin visita",
  openFindings: 0,
  nocturnoEnabled: false,
  assignmentWindows: [{ start: "2026-08-01", end: null }],
};

function payload(over: Partial<GrillaPayload> = {}): GrillaPayload {
  return {
    year: 2026,
    month: 8,
    daysInMonth: 31,
    today: { year: 2026, month: 8, day: 25 },
    installations: [siteA, siteB, siteC],
    visits: [],
    incidents: [],
    ...over,
  };
}

describe("turno según hora de inicio Chile", () => {
  it("Día = 06:00–19:59 y noche = 20:00–05:59", () => {
    expect(shiftFromHour(6)).toBe("day");
    expect(shiftFromHour(19)).toBe("day");
    expect(shiftFromHour(20)).toBe("night");
    expect(shiftFromHour(5)).toBe("night");
    expect(shiftFromHour(0)).toBe("night");
  });

  it("clasifica por hora Chile, no UTC", () => {
    expect(shiftFromStart(at(2026, 8, 25, 19, 59))).toBe("day");
    expect(shiftFromStart(at(2026, 8, 25, 20, 0))).toBe("night");
    expect(shiftFromStart(at(2026, 8, 26, 2, 15))).toBe("night");
  });

  it("una visita que cruza 20:00 queda en el turno de inicio", () => {
    const start = at(2026, 8, 25, 19, 30);
    const end = at(2026, 8, 25, 20, 30);
    expect(shiftFromStart(start)).toBe("day");
    expect(crossesShift(start, end)).toBe(true);
    expect(crossesShift(start, null)).toBe(false);
  });
});

describe("duración", () => {
  it("formatea 1 h 42 min y Sin salida", () => {
    expect(formatDurationLabel(102)).toBe("1 h 42 min");
    expect(formatDurationLabel(60)).toBe("1 h");
    expect(formatDurationLabel(19)).toBe("19 min");
    expect(formatDurationLabel(null)).toBe("Sin salida");
  });

  it("sin checkout no inventa minutos", () => {
    expect(deriveDurationMinutes(at(2026, 8, 25, 8, 0), null)).toBeNull();
  });

  it("deriva minutos desde inicio y fin", () => {
    expect(
      deriveDurationMinutes(at(2026, 8, 25, 8, 0), at(2026, 8, 25, 9, 42)),
    ).toBe(102);
  });

  it("Hrs. usa horas con decimal es-CL", () => {
    expect(formatHoursLabel(90)).toBe("1,5");
    expect(formatHoursLabel(60)).toBe("1");
    expect(formatHoursLabel(0)).toBe("0");
  });
});

describe("calidad", () => {
  it("fuera de geocerca solo si hubo evaluación", () => {
    expect(isOutsideGeofence(false, 250)).toBe(true);
    expect(isOutsideGeofence(true, 40)).toBe(false);
    expect(isOutsideGeofence(false, null)).toBe(false);
  });

  it("20 min no es visita corta; 19 sí", () => {
    const at20 = mapVisit(
      {
        id: "v20",
        installationId: "inst-a",
        checkInAt: at(2026, 8, 10, 8, 0),
        checkOutAt: at(2026, 8, 10, 8, 20),
        checkInGeoValidada: true,
        checkInDistanciaM: 5,
        status: "completed",
        supervisorName: "Ana Bravo",
        findingCount: 0,
      },
      2026,
      8,
    );
    expect(at20?.shortVisit).toBe(false);
    expect(at20?.durationMinutes).toBe(20);
  });

  it("mapVisit marca corta, sin salida y geocerca", () => {
    const raw: RawGrillaVisit = {
      id: "v1",
      installationId: "inst-a",
      checkInAt: at(2026, 8, 10, 8, 0),
      checkOutAt: at(2026, 8, 10, 8, 12),
      checkInGeoValidada: false,
      checkInDistanciaM: 400,
      status: "completed",
      supervisorName: "Ana Bravo",
      findingCount: 1,
    };
    const mapped = mapVisit(raw, 2026, 8);
    expect(mapped?.shortVisit).toBe(true);
    expect(mapped?.outsideGeofence).toBe(true);
    expect(mapped?.durationLabel).toBe("12 min");
    expect(mapped?.shift).toBe("day");
    expect(mapped?.initials).toBe("AB");
  });

  it("sin fin queda Sin salida y no corta", () => {
    const mapped = mapVisit(
      {
        id: "v2",
        installationId: "inst-a",
        checkInAt: at(2026, 8, 10, 21, 0),
        checkOutAt: null,
        checkInGeoValidada: true,
        checkInDistanciaM: 10,
        status: "in_progress",
        supervisorName: "Luis Soto",
        findingCount: 0,
      },
      2026,
      8,
    );
    expect(mapped?.noCheckout).toBe(true);
    expect(mapped?.shortVisit).toBe(false);
    expect(mapped?.durationLabel).toBe("Sin salida");
    expect(mapped?.shift).toBe("night");
  });
});

describe("chips", () => {
  it("verde diurna, violeta nocturna, azul varias, mixto si hay ambas", () => {
    expect(chipKind([{ shift: "day" }])).toBe("day");
    expect(chipKind([{ shift: "night" }])).toBe("night");
    expect(chipKind([{ shift: "day" }, { shift: "day" }])).toBe("multi");
    expect(chipKind([{ shift: "day" }, { shift: "night" }])).toBe("mixed");
    expect(chipKind([])).toBe("empty");
  });
});

describe("asignación vs sin visita", () => {
  it("cubre el día con la ventana de asignación", () => {
    expect(assignmentCoversDay([{ start: "2026-08-01", end: null }], 2026, 8, 10)).toBe(true);
    expect(assignmentCoversDay([{ start: "2026-08-15", end: null }], 2026, 8, 10)).toBe(false);
    expect(assignmentCoversDay([{ start: "2026-07-01", end: "2026-07-31" }], 2026, 8, 10)).toBe(false);
  });

  it("celda vacía distinta si la asignación no se ejecutó", () => {
    const today = { year: 2026, month: 8, day: 25 };
    const past = { year: 2026, month: 8, day: 10 };
    expect(
      emptyKind({ hasVisit: false, assigned: true, unexecutedRow: true, cell: past, today }),
    ).toBe("missed");
    expect(
      emptyKind({ hasVisit: false, assigned: true, unexecutedRow: false, cell: past, today }),
    ).toBe("idle");
    expect(
      emptyKind({
        hasVisit: false,
        assigned: true,
        unexecutedRow: true,
        cell: { year: 2026, month: 8, day: 28 },
        today,
      }),
    ).toBe("future");
    expect(
      emptyKind({ hasVisit: false, assigned: false, unexecutedRow: false, cell: past, today }),
    ).toBe("none");
    expect(
      emptyKind({
        hasVisit: false,
        assigned: true,
        unexecutedRow: true,
        expected: false,
        cell: past,
        today,
      }),
    ).toBe("none");
  });

  it("en filtro Noche, un sitio sin exigencia nocturna no se marca como sin ejecución", () => {
    const view = buildGrillaView(payload(), "night");
    const bodega = view.rows.find((r) => r.installation.id === "inst-b")!;
    const mall = view.rows.find((r) => r.installation.id === "inst-a")!;
    expect(bodega.installation.nocturnoEnabled).toBe(false);
    expect(bodega.unexecuted).toBe(false);
    expect(bodega.cells[10].empty).toBe("none");
    expect(mall.installation.nocturnoEnabled).toBe(true);
    expect(mall.unexecuted).toBe(true);
    expect(mall.cells[10].empty).toBe("missed");
  });
});

describe("agregación Día / Noche / Ambas", () => {
  const visits: GrillaVisit[] = [
    visit({ id: "d1", installationId: "inst-a", day: 10, shift: "day", durationMinutes: 102, supervisorName: "Ana Bravo" }),
    visit({ id: "d2", installationId: "inst-a", day: 10, shift: "day", durationMinutes: 40, supervisorName: "Carlos Diaz" }),
    visit({ id: "n1", installationId: "inst-a", day: 10, shift: "night", durationMinutes: 90, supervisorName: "Eva Ruiz" }),
    visit({ id: "b1", installationId: "inst-b", day: 11, shift: "day", durationMinutes: 60, supervisorName: "Ana Bravo" }),
  ];

  const incidents = [
    {
      id: "inc-1",
      installationId: "inst-a",
      day: 10,
      shift: "day" as const,
      status: "open",
      title: "Intrusión",
      code: "INC-1",
    },
    {
      id: "inc-2",
      installationId: "inst-a",
      day: 12,
      shift: "night" as const,
      status: "in_progress",
      title: "Alarma",
      code: "INC-2",
    },
    {
      id: "inc-3",
      installationId: "inst-b",
      day: 11,
      shift: "day" as const,
      status: "resolved",
      title: "Por validar",
      code: "INC-3",
    },
  ];

  const data = payload({ visits, incidents });

  it("Ambas cuenta las 3 visitas del día 10 y Hrs. del mes", () => {
    const view = buildGrillaView(data, "both");
    const row = view.rows.find((r) => r.installation.id === "inst-a")!;
    expect(row.cells[10].count).toBe(3);
    expect(row.cells[10].chip).toBe("mixed");
    expect(row.cells[10].visits.map((v) => v.supervisorName)).toEqual([
      "Ana Bravo",
      "Carlos Diaz",
      "Eva Ruiz",
    ]);
    expect(row.totalVisits).toBe(3);
    expect(row.hoursLabel).toBe("3,9");
    expect(row.cells[10].hasIncident).toBe(true);
    expect(row.openIncidents).toBe(2);
    expect(row.installation.openFindings).toBe(2);
  });

  it("Día oculta la nocturna y recalcula Vis. y Hrs.", () => {
    const view = buildGrillaView(data, "day");
    const row = view.rows.find((r) => r.installation.id === "inst-a")!;
    expect(row.cells[10].count).toBe(2);
    expect(row.cells[10].chip).toBe("multi");
    expect(row.totalVisits).toBe(2);
    expect(row.hoursLabel).toBe("2,4");
    expect(row.cells[12].hasIncident).toBe(false);
    expect(row.openIncidents).toBe(1);
  });

  it("Noche deja la visita nocturna y el incidente de noche", () => {
    const view = buildGrillaView(data, "night");
    const row = view.rows.find((r) => r.installation.id === "inst-a")!;
    expect(row.cells[10].count).toBe(1);
    expect(row.cells[10].chip).toBe("night");
    expect(row.cells[10].initials).toBe("ER");
    expect(row.totalVisits).toBe(1);
    expect(row.hoursLabel).toBe("1,5");
    expect(row.cells[12].hasIncident).toBe(true);
    expect(row.openIncidents).toBe(1);
  });

  it("un incidente aparece en el día aunque no haya visita", () => {
    const view = buildGrillaView(data, "night");
    const row = view.rows.find((r) => r.installation.id === "inst-a")!;
    expect(row.cells[12].count).toBe(0);
    expect(row.cells[12].hasIncident).toBe(true);
    expect(row.cells[12].openIncidents).toHaveLength(1);
  });

  it("sitio con exigencia nocturna y 0 visitas noche queda Sin noche", () => {
    const onlyDay = payload({
      visits: [
        visit({ id: "only-day", installationId: "inst-a", day: 5, shift: "day", durationMinutes: 50 }),
      ],
    });
    const view = buildGrillaView(onlyDay, "both");
    const row = view.rows.find((r) => r.installation.id === "inst-a")!;
    expect(row.missingNight).toBe(true);
    expect(view.kpis.sinNoche).toBe(1);
    const filtered = buildGrillaView(onlyDay, "both", "sin_noche");
    expect(filtered.rows.map((r) => r.installation.id)).toEqual(["inst-a"]);
  });

  it("KPI sin noche no incluye sitios que no la exigen", () => {
    const view = buildGrillaView(data, "both");
    const rowB = view.rows.find((r) => r.installation.id === "inst-b")!;
    expect(rowB.missingNight).toBe(false);
  });

  it("asignación sin ejecución no se ve igual que sin visita de un sitio visitado", () => {
    const view = buildGrillaView(data, "both");
    const visited = view.rows.find((r) => r.installation.id === "inst-b")!;
    const never = view.rows.find((r) => r.installation.id === "inst-c")!;
    expect(visited.unexecuted).toBe(false);
    expect(never.unexecuted).toBe(true);
    expect(visited.cells[10].empty).toBe("idle");
    expect(never.cells[10].empty).toBe("missed");
    expect(never.cells[28].empty).toBe("future");
  });

  it("Hall. no se mezcla con incidentes", () => {
    const view = buildGrillaView(data, "both");
    const row = view.rows.find((r) => r.installation.id === "inst-a")!;
    expect(row.installation.openFindings).toBe(2);
    expect(row.openIncidents).toBe(2);
  });

  it("Por validar cuenta incidentes resolved y filtra el sitio", () => {
    const view = buildGrillaView(data, "both");
    expect(view.kpis.porValidar).toBe(1);
    const filtered = buildGrillaView(data, "both", "por_validar");
    expect(filtered.rows.map((r) => r.installation.id)).toEqual(["inst-b"]);
  });

  it("KPI calidad cuenta cortas y sin salida", () => {
    const dirty = payload({
      visits: [
        visit({
          id: "short",
          installationId: "inst-b",
          day: 4,
          shift: "day",
          durationMinutes: 12,
          shortVisit: true,
        }),
        visit({
          id: "open",
          installationId: "inst-b",
          day: 5,
          shift: "day",
          durationMinutes: null,
          durationLabel: "Sin salida",
          noCheckout: true,
          checkOutAt: null,
        }),
      ],
    });
    const view = buildGrillaView(dirty, "both");
    expect(view.kpis.calidad).toBe(2);
  });
});

describe("orden", () => {
  it("cobertura pone sin noche primero y no premia cantidad de chips", () => {
    const data = payload({
      visits: [
        visit({ id: "many-1", installationId: "inst-b", day: 1, shift: "day", durationMinutes: 20 }),
        visit({ id: "many-2", installationId: "inst-b", day: 2, shift: "day", durationMinutes: 20 }),
        visit({ id: "many-3", installationId: "inst-b", day: 3, shift: "day", durationMinutes: 20 }),
        visit({ id: "few", installationId: "inst-a", day: 1, shift: "day", durationMinutes: 180 }),
      ],
    });
    const view = buildGrillaView(data, "both");
    const sorted = sortGrillaRows(view.rows, "cobertura");
    expect(sorted[0].installation.id).toBe("inst-a");
    expect(sorted[0].missingNight).toBe(true);
    const byHrs = sortGrillaRows(view.rows, "hrs");
    expect(byHrs[0].installation.id).toBe("inst-a");
  });
});

describe("mapIncident respeta el mes Chile", () => {
  it("descarta un incidente de otro mes", () => {
    expect(
      mapIncident(
        {
          id: "x",
          installationId: "inst-a",
          createdAt: at(2026, 7, 31, 23, 0),
          status: "open",
          title: "Otro mes",
          code: "INC-X",
        },
        2026,
        8,
      ),
    ).toBeNull();
  });
});

describe("visitMatchesShift", () => {
  it("Ambas acepta ambos turnos", () => {
    expect(visitMatchesShift("day", "both")).toBe(true);
    expect(visitMatchesShift("night", "day")).toBe(false);
    expect(visitMatchesShift("night", "night")).toBe(true);
  });
});
