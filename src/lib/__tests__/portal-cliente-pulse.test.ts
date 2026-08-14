import { describe, it, expect } from "vitest";
import { buildRounds24h, resolveOnDuty } from "@/lib/portal-cliente-pulse";

describe("resolveOnDuty", () => {
  const now = new Date("2026-08-13T15:00:00Z");

  it("devuelve null si no hay entrada abierta", () => {
    expect(resolveOnDuty([], now)).toBeNull();
    expect(
      resolveOnDuty(
        [{ tipo: "salida", timestamp: now, guardiaId: "g1", guardName: "A. Ana" }],
        now,
      ),
    ).toBeNull();
  });

  it("elige la entrada vigente más reciente y calcula sinceMinutes", () => {
    const entrada = new Date("2026-08-13T12:00:00Z");
    const duty = resolveOnDuty(
      [
        { tipo: "entrada", timestamp: entrada, guardiaId: "g1", guardName: "P. Juan" },
        { tipo: "salida", timestamp: new Date("2026-08-13T11:00:00Z"), guardiaId: "g2", guardName: "L. Pedro" },
      ],
      now,
    );
    expect(duty).toMatchObject({
      guardName: "P. Juan",
      shiftStart: entrada.toISOString(),
      shiftEnd: null,
      sinceMinutes: 180,
    });
  });

  it("una salida posterior cierra el turno de ese guardia", () => {
    const duty = resolveOnDuty(
      [
        { tipo: "entrada", timestamp: new Date("2026-08-13T10:00:00Z"), guardiaId: "g1", guardName: "P. Juan" },
        { tipo: "salida", timestamp: new Date("2026-08-13T14:00:00Z"), guardiaId: "g1", guardName: "P. Juan" },
      ],
      now,
    );
    expect(duty).toBeNull();
  });
});

describe("buildRounds24h", () => {
  it("emite 12 slots y marca now/ok/warn/pending", () => {
    const now = new Date("2026-08-13T18:00:00Z");
    const slots = buildRounds24h(
      [
        { scheduledAt: new Date("2026-08-13T12:00:00Z"), status: "completada" },
        { scheduledAt: new Date("2026-08-13T08:00:00Z"), status: "incompleta" },
      ],
      now,
      true,
    );
    expect(slots).toHaveLength(12);
    expect(slots.some((s) => s.status === "now")).toBe(true);
    expect(slots.some((s) => s.status === "ok")).toBe(true);
    expect(slots.some((s) => s.status === "warn")).toBe(true);
    expect(slots.every((s) => s.hour >= 0 && s.hour <= 23)).toBe(true);
  });
});
