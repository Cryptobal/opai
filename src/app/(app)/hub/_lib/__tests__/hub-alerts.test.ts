import { describe, expect, it } from "vitest";
import { getAlerts } from "../hub-queries";
import type { OpsMetrics } from "../hub-types";

function opsMetricsWith(overrides: Partial<OpsMetrics> = {}): OpsMetrics {
  return {
    activePuestos: 10,
    activeGuardias: 20,
    guardiasNuevosMes: 1,
    pendingTE: 0,
    refuerzosActivosHoy: 0,
    refuerzosProximos: 0,
    refuerzosPendientesFacturarCount: 0,
    refuerzosPendientesFacturarAmount: 0,
    ppcGaps: 0,
    attendance: {
      present: 18,
      absent: 0,
      pending: 2,
      replacement: 0,
      total: 20,
      coveragePercent: 90,
    },
    rounds: {
      scheduled: 0,
      completed: 0,
      inProgress: 0,
      missed: 0,
      completionPercent: 0,
    },
    unresolvedAlerts: 0,
    criticalAlerts: 0,
    attendanceTrend7d: [],
    roundsTrend7d: [],
    ...overrides,
  };
}

describe("getAlerts", () => {
  it("pendingTE > 0 ya NO produce la alerta transversal te-pending", () => {
    const alerts = getAlerts(opsMetricsWith({ pendingTE: 7 }), null, null, 0);
    expect(alerts.find((a) => a.id === "te-pending")).toBeUndefined();
    expect(alerts.some((a) => a.href.startsWith("/ops/turnos-extra"))).toBe(false);
    expect(alerts.some((a) => a.message.includes("turno"))).toBe(false);
  });

  it("mantiene la alerta de ausencias sin reemplazo", () => {
    const alerts = getAlerts(
      opsMetricsWith({
        attendance: {
          present: 15,
          absent: 3,
          pending: 2,
          replacement: 0,
          total: 20,
          coveragePercent: 75,
        },
      }),
      null,
      null,
      0,
    );
    const absent = alerts.find((a) => a.id === "attendance-absent");
    expect(absent).toBeDefined();
    expect(absent?.severity).toBe("critical");
  });

  it("mantiene la alerta de seguimientos vencidos y ordena por severidad", () => {
    const alerts = getAlerts(
      opsMetricsWith({
        pendingTE: 4,
        attendance: {
          present: 16,
          absent: 4,
          pending: 0,
          replacement: 0,
          total: 20,
          coveragePercent: 80,
        },
      }),
      null,
      null,
      2,
    );
    expect(alerts.map((a) => a.id)).toEqual([
      "attendance-absent",
      "followups-overdue",
    ]);
  });

  it("sin métricas ni seguimientos → sin alertas", () => {
    expect(getAlerts(null, null, null, 0)).toEqual([]);
  });
});
