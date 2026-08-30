import { describe, expect, it } from "vitest";
import {
  isDescubiertoPorRetiro,
  isPpcDelDia,
  hasChanges,
  type AsistenciaItem,
} from "@/types/ops-asistencia";
import {
  retiroAnticipadoSchema,
  createAsistenciaAdhocSchema,
} from "@/lib/validations/ops";

function baseItem(over: Partial<AsistenciaItem> = {}): AsistenciaItem {
  return {
    id: "a1",
    date: "2026-08-30",
    slotNumber: 1,
    attendanceStatus: "asistio",
    plannedGuardiaId: "g1",
    installation: { id: "i1", name: "Inst" },
    puesto: { id: "p1", name: "Puesto", shiftStart: "08:00", shiftEnd: "20:00" },
    ...over,
  };
}

describe("isDescubiertoPorRetiro / isPpcDelDia", () => {
  it("PPC clásico sin planificado cuenta como PPC", () => {
    const item = baseItem({ plannedGuardiaId: null, attendanceStatus: "ppc" });
    expect(isPpcDelDia(item)).toBe(true);
    expect(isDescubiertoPorRetiro(item)).toBe(false);
  });

  it("retiro anticipado sin TE cuenta como descubierto y PPC del día", () => {
    const item = baseItem({
      earlyDepartureAt: "2026-08-30T13:00:00.000Z",
      earlyDepartureReason: "malestar",
      turnosExtra: [],
    });
    expect(isDescubiertoPorRetiro(item)).toBe(true);
    expect(isPpcDelDia(item)).toBe(true);
  });

  it("retiro anticipado con TE pending deja de ser descubierto", () => {
    const item = baseItem({
      earlyDepartureAt: "2026-08-30T13:00:00.000Z",
      turnosExtra: [{ id: "te1", status: "pending", amountClp: 30000 }],
    });
    expect(isDescubiertoPorRetiro(item)).toBe(false);
    expect(isPpcDelDia(item)).toBe(false);
  });

  it("TE rejected no cubre el descubierto", () => {
    const item = baseItem({
      earlyDepartureAt: "2026-08-30T13:00:00.000Z",
      turnosExtra: [{ id: "te1", status: "rejected", amountClp: 30000 }],
    });
    expect(isDescubiertoPorRetiro(item)).toBe(true);
  });
});

describe("hasChanges con earlyDeparture", () => {
  it("marca cambios cuando hay retiro anticipado", () => {
    expect(hasChanges(baseItem({ earlyDepartureAt: "2026-08-30T13:00:00.000Z" }))).toBe(true);
  });

  it("asistio sin early ni reemplazo no es cambio respecto a pendiente", () => {
    // attendanceStatus asistio != pendiente → sí hay cambios
    expect(hasChanges(baseItem({ attendanceStatus: "asistio" }))).toBe(true);
    expect(
      hasChanges(baseItem({ attendanceStatus: "pendiente", earlyDepartureAt: null }))
    ).toBe(false);
  });
});

describe("retiroAnticipadoSchema", () => {
  it("acepta payload mínimo", () => {
    const r = retiroAnticipadoSchema.safeParse({
      checkOutAt: "2026-08-30T13:00:00.000Z",
      reason: "malestar",
    });
    expect(r.success).toBe(true);
  });

  it("rechaza motivo corto", () => {
    const r = retiroAnticipadoSchema.safeParse({
      checkOutAt: "2026-08-30T13:00:00.000Z",
      reason: "ab",
    });
    expect(r.success).toBe(false);
  });

  it("acepta cobertura opcional", () => {
    const r = retiroAnticipadoSchema.safeParse({
      checkOutAt: "2026-08-30T13:00:00.000Z",
      reason: "malestar",
      cobertura: {
        guardiaId: "550e8400-e29b-41d4-a716-446655440000",
        amountClp: 35000,
      },
    });
    expect(r.success).toBe(true);
  });
});

describe("createAsistenciaAdhocSchema", () => {
  it("acepta inducción con horarios", () => {
    const r = createAsistenciaAdhocSchema.safeParse({
      installationId: "550e8400-e29b-41d4-a716-446655440000",
      puestoId: "6ba7b810-9dad-11d1-80b4-00c04fd430c8",
      date: "2026-08-30",
      reason: "induccion",
      shiftStart: "08:00",
      shiftEnd: "20:00",
    });
    expect(r.success).toBe(true);
  });

  it("rechaza reason inválido", () => {
    const r = createAsistenciaAdhocSchema.safeParse({
      installationId: "550e8400-e29b-41d4-a716-446655440000",
      puestoId: "6ba7b810-9dad-11d1-80b4-00c04fd430c8",
      date: "2026-08-30",
      reason: "xyz",
    });
    expect(r.success).toBe(false);
  });
});
