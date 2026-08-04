/**
 * v5.1 — arrastre multi-mes de ventas proyectadas (clamp con todayYmd).
 *
 * Estos tests protegen el comportamiento de `deriveCommittedIncome` en la
 * matriz (celda semanal). La base de ventas IVA/retiro pasó a emisión en
 * v5.2 — ver `emission-ventas.test.ts`.
 */
import { describe, it, expect } from "vitest";
import { deriveCommittedIncome } from "../derive-committed-income";
import type { FlowRowRef } from "../types";
import { enumerateWeeks } from "../weeks";

const REAL_TODAY = "2026-07-21"; // semana actual = 2026-07-20
const ROWS: FlowRowRef[] = [
  {
    id: "row-a",
    section: "INGRESOS",
    crmAccountId: "acc-A",
    installationId: null,
    categoryId: null,
    name: "Cliente A",
  },
];
const HORIZON = enumerateWeeks(
  new Date(Date.UTC(2026, 4, 1)),
  new Date(Date.UTC(2026, 10, 30)),
);

describe("arrastre multi-mes — clamp con todayYmd falso (causa raíz)", () => {
  it("con hoy = fin de septiembre, un borrador de mayo cae en semanas de septiembre", () => {
    const septWeeks = HORIZON.filter((w) => w.startsWith("2026-09"));
    const fakeToday = "2026-09-28"; // fin del mes objetivo (bug pre-v5.1)
    const { committed: out } = deriveCommittedIncome({
      rows: ROWS,
      weeks: septWeeks,
      todayYmd: fakeToday,
      dtes: [],
      drafts: [{
        id: "draft-may",
        templateId: "tpl-1",
        dateYmd: "2026-05-10",
        totalClp: 11_900_000,
        receiverName: "Cliente A",
        crmAccountId: "acc-A",
        installationId: null,
        templateEndDateYmd: null,
      }],
      templates: [],
      coveredPeriods: new Set(),
    });
    const currentWeekInSept = "2026-09-28"; // lunes de la semana del 28-sep
    let total = 0;
    for (const w of septWeeks) total += out.get("row-a")?.get(w)?.total ?? 0;
    expect(total).toBe(11_900_000);
    expect(out.get("row-a")?.get(currentWeekInSept)?.total).toBe(11_900_000);
  });

  it("con hoy real (julio), el mismo borrador NO aparece en semanas de septiembre", () => {
    const septWeeks = HORIZON.filter((w) => w.startsWith("2026-09"));
    const { committed: out } = deriveCommittedIncome({
      rows: ROWS,
      weeks: septWeeks,
      todayYmd: REAL_TODAY,
      dtes: [],
      drafts: [{
        id: "draft-may",
        templateId: "tpl-1",
        dateYmd: "2026-05-10",
        totalClp: 11_900_000,
        receiverName: "Cliente A",
        crmAccountId: "acc-A",
        installationId: null,
        templateEndDateYmd: null,
      }],
      templates: [],
      coveredPeriods: new Set(),
    });
    let total = 0;
    for (const w of septWeeks) total += out.get("row-a")?.get(w)?.total ?? 0;
    expect(total).toBe(0);
  });
});
