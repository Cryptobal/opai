import { describe, expect, it } from "vitest";
import { parseDateOnly } from "@/lib/ops";
import {
  resolvePautaCellState,
  resolveSlotHeader,
  slotHeaderExportLabel,
} from "../pauta-cell-state";

const d = (iso: string) => parseDateOnly(iso);

describe("resolvePautaCellState", () => {
  it("reemplazo gana sobre ausencia y fantasma", () => {
    const state = resolvePautaCellState({
      dateKey: "2026-09-05",
      shiftCode: "T",
      plannedGuardiaId: null,
      replacementGuardiaId: "rep-1",
      previousGuardiaId: "g-old",
      absenceCode: "L",
    });
    expect(state.kind).toBe("replacement");
    expect(state.code).toBe("PR");
    expect(state.isPpc).toBe(false);
  });

  it("ausencia en día de trabajo muestra el código y PPC", () => {
    const state = resolvePautaCellState({
      dateKey: "2026-09-05",
      shiftCode: "T",
      plannedGuardiaId: "g1",
      absenceCode: "L",
    });
    expect(state.kind).toBe("absence_work");
    expect(state.code).toBe("L");
    expect(state.isPpc).toBe(true);
    expect(state.styleKey).toBe("L");
  });

  it("ausencia en descanso no es PPC", () => {
    const state = resolvePautaCellState({
      dateKey: "2026-09-06",
      shiftCode: "-",
      plannedGuardiaId: "g1",
      absenceCode: "V",
    });
    expect(state.kind).toBe("absence_rest");
    expect(state.code).toBe("V");
    expect(state.isPpc).toBe(false);
  });

  it("planificado con terminatedAt en el futuro muestra F pre-fecha", () => {
    const state = resolvePautaCellState({
      dateKey: "2026-09-03",
      shiftCode: "T",
      plannedGuardiaId: "g1",
      plannedGuardia: { terminatedAt: "2026-09-10" },
    });
    expect(state.kind).toBe("finiquito_pre");
    expect(state.code).toBe("T");
    expect(state.isPpc).toBe(false);
  });

  it("fantasma finiquito = F + PPC en día T", () => {
    const state = resolvePautaCellState({
      dateKey: "2026-09-05",
      shiftCode: "T",
      plannedGuardiaId: null,
      previousGuardiaId: "g1",
      previousGuardiaName: "Miguel Flores",
      unassignedReason: "finiquito",
      unassignedAt: "2026-09-04",
    });
    expect(state.kind).toBe("ghost_finiquito");
    expect(state.code).toBe("F");
    expect(state.isPpc).toBe(true);
    expect(state.tooltip).toContain("Miguel Flores");
    expect(state.tooltip).toContain("Finiquito");
  });

  it("fantasma CI cuando hay destino en otra instalación", () => {
    const state = resolvePautaCellState({
      dateKey: "2026-09-05",
      shiftCode: "T",
      plannedGuardiaId: null,
      previousGuardiaId: "g1",
      previousGuardiaName: "Miguel Flores",
      unassignedReason: "reasignacion",
      currentInstallationId: "inst-a",
      ghostAsignaciones: [
        {
          startDate: d("2026-09-04"),
          endDate: null,
          installationId: "inst-b",
          installationName: "Mall Plaza",
          puestoName: "Acceso",
        },
      ],
    });
    expect(state.kind).toBe("ghost_traslado_instalacion");
    expect(state.code).toBe("CI");
    expect(state.isPpc).toBe(true);
    expect(state.tooltip).toContain("Mall Plaza");
    expect(state.tooltip).toContain("04/09");
  });

  it("fantasma CP cuando el destino es otro puesto de la misma instalación", () => {
    const state = resolvePautaCellState({
      dateKey: "2026-09-05",
      shiftCode: "T",
      plannedGuardiaId: null,
      previousGuardiaId: "g1",
      previousGuardiaName: "Ana Soto",
      unassignedReason: "reasignacion",
      currentInstallationId: "inst-a",
      ghostAsignaciones: [
        {
          startDate: d("2026-09-04"),
          endDate: null,
          installationId: "inst-a",
          installationName: "Origen",
          puestoName: "Bodega",
        },
      ],
    });
    expect(state.kind).toBe("ghost_traslado_puesto");
    expect(state.code).toBe("CP");
    expect(state.tooltip).toContain("Bodega");
  });

  it("fantasma DES sin destino", () => {
    const state = resolvePautaCellState({
      dateKey: "2026-09-05",
      shiftCode: "T",
      plannedGuardiaId: null,
      previousGuardiaId: "g1",
      previousGuardiaName: "Ana Soto",
      unassignedReason: "desasignacion_manual",
      unassignedAt: "2026-09-02",
    });
    expect(state.kind).toBe("ghost_desasignado");
    expect(state.code).toBe("DES");
    expect(state.isPpc).toBe(true);
  });

  it("PPC sin fantasma", () => {
    const state = resolvePautaCellState({
      dateKey: "2026-09-05",
      shiftCode: "T",
      plannedGuardiaId: null,
    });
    expect(state.kind).toBe("ppc");
    expect(state.code).toBe("PPC");
    expect(state.isPpc).toBe(true);
  });

  it("descanso y vacío", () => {
    expect(
      resolvePautaCellState({
        dateKey: "2026-09-05",
        shiftCode: "-",
        plannedGuardiaId: "g1",
      }).kind,
    ).toBe("rest");
    expect(
      resolvePautaCellState({
        dateKey: "2026-09-05",
        shiftCode: null,
        plannedGuardiaId: null,
      }).kind,
    ).toBe("empty");
  });

  it("día de transición: origen fantasma CI, no planificado", () => {
    const state = resolvePautaCellState({
      dateKey: "2026-09-04",
      shiftCode: "T",
      plannedGuardiaId: null,
      previousGuardiaId: "g1",
      previousGuardiaName: "Miguel",
      unassignedReason: "reasignacion",
      currentInstallationId: "inst-a",
      ghostAsignaciones: [
        {
          startDate: d("2026-09-04"),
          endDate: null,
          installationId: "inst-b",
          installationName: "Destino",
          puestoName: "Acceso",
        },
      ],
    });
    expect(state.code).toBe("CI");
  });
});

describe("resolveSlotHeader", () => {
  const month = {
    monthStartKey: "2026-09-01",
    monthEndKey: "2026-09-30",
    todayKey: "2026-08-31",
  };

  it("usa hoy si está dentro del mes", () => {
    const header = resolveSlotHeader({
      ...month,
      todayKey: "2026-09-02",
      ghost: null,
      asignaciones: [
        {
          guardiaId: "g1",
          name: "Miguel Flores",
          startDate: d("2026-08-01"),
          endDate: d("2026-09-03"),
        },
        {
          guardiaId: "g1",
          name: "Miguel Flores",
          startDate: d("2026-09-04"),
          endDate: null,
        },
      ],
    });
    expect(header?.name).toBe("Miguel Flores");
    expect(header?.chips.some((c) => c.code === "hasta")).toBe(true);
    expect(header?.chips.find((c) => c.code === "hasta")?.label).toBe("hasta 03/09");
  });

  it("mes futuro: muestra el entrante con desde", () => {
    const header = resolveSlotHeader({
      monthStartKey: "2026-09-01",
      monthEndKey: "2026-09-30",
      todayKey: "2026-08-31",
      ghost: null,
      asignaciones: [
        {
          guardiaId: "g1",
          name: "Miguel Flores",
          startDate: d("2026-09-04"),
          endDate: null,
        },
      ],
    });
    expect(header?.chips.find((c) => c.code === "desde")?.label).toBe("desde 04/09");
    expect(header?.tone).toBe("info");
  });

  it("mes pasado: referencia = último día del mes", () => {
    const header = resolveSlotHeader({
      monthStartKey: "2026-08-01",
      monthEndKey: "2026-08-31",
      todayKey: "2026-09-01",
      ghost: null,
      asignaciones: [
        {
          guardiaId: "g1",
          name: "Miguel Flores",
          startDate: d("2026-08-01"),
          endDate: d("2026-08-31"),
        },
      ],
    });
    expect(header?.name).toBe("Miguel Flores");
    expect(header?.chips.find((c) => c.code === "hasta")?.label).toBe("hasta 31/08");
  });

  it("F · hasta cuando hay terminatedAt", () => {
    const header = resolveSlotHeader({
      monthStartKey: "2026-09-01",
      monthEndKey: "2026-09-30",
      todayKey: "2026-09-02",
      ghost: null,
      asignaciones: [
        {
          guardiaId: "g1",
          name: "Miguel Flores",
          startDate: d("2026-08-01"),
          endDate: d("2026-09-10"),
          terminatedAt: "2026-09-10",
        },
      ],
    });
    expect(header?.tone).toBe("danger");
    expect(header?.chips[0]?.code).toBe("F");
    expect(header?.chips[0]?.label).toContain("hasta");
  });

  it("fantasma si no hay asignación que solape el mes", () => {
    const header = resolveSlotHeader({
      ...month,
      todayKey: "2026-09-15",
      asignaciones: [],
      ghost: { guardiaId: "g1", name: "Miguel Flores", reason: "finiquito" },
    });
    expect(header?.name).toBe("Miguel Flores");
    expect(header?.tone).toBe("muted");
    expect(header?.chips[0]?.code).toBe("F");
  });

  it("null (sin asignar) solo si no hay asignación ni fantasma", () => {
    expect(
      resolveSlotHeader({
        ...month,
        asignaciones: [],
        ghost: null,
      }),
    ).toBeNull();
  });

  it("+N con tooltip de las otras asignaciones del mes", () => {
    const header = resolveSlotHeader({
      monthStartKey: "2026-09-01",
      monthEndKey: "2026-09-30",
      todayKey: "2026-09-02",
      ghost: null,
      asignaciones: [
        {
          guardiaId: "g1",
          name: "Miguel Flores",
          startDate: d("2026-08-01"),
          endDate: d("2026-09-03"),
        },
        {
          guardiaId: "g2",
          name: "Ana Soto",
          startDate: d("2026-09-10"),
          endDate: null,
        },
      ],
    });
    const more = header?.chips.find((c) => c.code === "more");
    expect(more?.label).toBe("+1");
    expect(more?.tooltip).toContain("Ana Soto");
  });

  it("asignación que empieza el día 1 no muestra desde", () => {
    const header = resolveSlotHeader({
      monthStartKey: "2026-09-01",
      monthEndKey: "2026-09-30",
      todayKey: "2026-09-01",
      ghost: null,
      asignaciones: [
        { guardiaId: "g1", name: "Ana", startDate: d("2026-09-01"), endDate: null },
      ],
    });
    expect(header?.chips.some((c) => c.code === "desde")).toBe(false);
  });
});

describe("slotHeaderExportLabel", () => {
  it("null → Sin asignar", () => {
    expect(slotHeaderExportLabel(null)).toBe("Sin asignar");
  });

  it("incluye hasta dd/mm cuando el chip existe", () => {
    const header = resolveSlotHeader({
      monthStartKey: "2026-09-01",
      monthEndKey: "2026-09-30",
      todayKey: "2026-09-02",
      ghost: null,
      asignaciones: [
        {
          guardiaId: "g1",
          name: "Miguel Flores",
          startDate: d("2026-08-01"),
          endDate: d("2026-09-03"),
        },
      ],
    });
    expect(slotHeaderExportLabel(header)).toBe("Miguel Flores (hasta 03/09)");
  });
});
