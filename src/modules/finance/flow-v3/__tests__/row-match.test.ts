import { describe, it, expect } from "vitest";
import { buildIncomeMatcher } from "../row-match";
import { UNMATCHED_INCOME_KEY, type FlowRowRef } from "../types";

describe("buildIncomeMatcher — 1 fila por programación", () => {
  const rows: FlowRowRef[] = [
    {
      id: "r-20", name: "Transmat 20%", crmAccountId: "acc-T", installationId: "i1",
      recurringTemplateId: "tpl-20", categoryId: null,
    },
    {
      id: "r-80", name: "Transmat 80%", crmAccountId: "acc-T", installationId: "i1",
      recurringTemplateId: "tpl-80", categoryId: null,
    },
    {
      id: "r-gen", name: "Cliente Gen", crmAccountId: "acc-G", installationId: null,
      recurringTemplateId: null, categoryId: null,
    },
  ];
  const match = buildIncomeMatcher(rows);

  it("prioriza fila del template sobre cuenta+instalación", () => {
    expect(match("acc-T", "i1", "tpl-20")).toBe("r-20");
    expect(match("acc-T", "i1", "tpl-80")).toBe("r-80");
  });

  it("filas de template no saturan el match genérico de cuenta", () => {
    // Sin templateId y sin fila genérica de acc-T → unmatched (no roba r-20/r-80).
    expect(match("acc-T", "i1", null)).toBe(UNMATCHED_INCOME_KEY);
    expect(match("acc-T", null, null)).toBe(UNMATCHED_INCOME_KEY);
  });

  it("cuenta genérica sin template sigue matcheando one-shots", () => {
    expect(match("acc-G", null, null)).toBe("r-gen");
    expect(match("acc-G", "otra-inst", null)).toBe("r-gen");
  });

  it("cuenta desconocida → Otros ingresos", () => {
    expect(match("acc-Z", null, null)).toBe(UNMATCHED_INCOME_KEY);
    expect(match(null, null, null)).toBe(UNMATCHED_INCOME_KEY);
  });
});
