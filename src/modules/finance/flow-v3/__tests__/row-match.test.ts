import { describe, it, expect } from "vitest";
import { buildIncomeMatcher } from "../row-match";
import { UNMATCHED_INCOME_KEY, type FlowRowRef } from "../types";

describe("buildIncomeMatcher — 1 fila por programación", () => {
  const rows: FlowRowRef[] = [
    {
      id: "r-20", name: "Transmat 20%", crmAccountId: "acc-T", installationId: "i1",
      recurringTemplateId: "tpl-20", categoryId: null,
      mapping: "ACCOUNT_INSTALLATION", section: "INGRESOS",
    },
    {
      id: "r-80", name: "Transmat 80%", crmAccountId: "acc-T", installationId: "i1",
      recurringTemplateId: "tpl-80", categoryId: null,
      mapping: "ACCOUNT_INSTALLATION", section: "INGRESOS",
    },
    {
      id: "r-gen", name: "Cliente Gen", crmAccountId: "acc-G", installationId: null,
      recurringTemplateId: null, categoryId: null,
      mapping: "ACCOUNT_INSTALLATION", section: "INGRESOS",
    },
  ];
  const match = buildIncomeMatcher(rows);

  it("prioriza fila del template sobre cuenta+instalación", () => {
    expect(match("acc-T", "i1", "tpl-20")).toBe("r-20");
    expect(match("acc-T", "i1", "tpl-80")).toBe("r-80");
  });

  it("Transmat 20/80: DTE sin vínculo y misma instalación → UNMATCHED (ambiguo)", () => {
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

describe("buildIncomeMatcher — sin fallback de cuenta única", () => {
  it("una sola fila de template NO captura DTE de otra instalación", () => {
    const rows: FlowRowRef[] = [
      {
        id: "r-asap", name: "ASAP", crmAccountId: "acc-A", installationId: "i1",
        recurringTemplateId: "tpl-a", categoryId: null,
        mapping: "ACCOUNT_INSTALLATION", section: "INGRESOS",
      },
    ];
    const match = buildIncomeMatcher(rows);
    expect(match("acc-A", "i1", "tpl-a")).toBe("r-asap");
    expect(match("acc-A", "i1", null)).toBe("r-asap");
    expect(match("acc-A", null, null)).toBe(UNMATCHED_INCOME_KEY);
    expect(match("acc-A", "otra", null)).toBe(UNMATCHED_INCOME_KEY);
  });

  it("Pine Pemuco + Llay Llay: cada instalación a su fila; sin mezcla", () => {
    const rows: FlowRowRef[] = [
      {
        id: "r-pine-pemuco", name: "Pine - Pemuco", crmAccountId: "acc-P",
        installationId: "inst-pemuco", recurringTemplateId: "tpl-pemuco", categoryId: null,
        mapping: "ACCOUNT_INSTALLATION", section: "INGRESOS",
      },
      {
        id: "r-pine-llay", name: "Pine - Llay Llay", crmAccountId: "acc-P",
        installationId: "inst-llay", recurringTemplateId: "tpl-llay", categoryId: null,
        mapping: "ACCOUNT_INSTALLATION", section: "INGRESOS",
      },
    ];
    const match = buildIncomeMatcher(rows);
    expect(match("acc-P", "inst-llay", "tpl-llay")).toBe("r-pine-llay");
    expect(match("acc-P", "inst-pemuco", "tpl-pemuco")).toBe("r-pine-pemuco");
    expect(match("acc-P", "inst-llay", null)).toBe("r-pine-llay");
    expect(match("acc-P", "inst-pemuco", null)).toBe("r-pine-pemuco");
    expect(match("acc-P", null, null)).toBe(UNMATCHED_INCOME_KEY);
    expect(match("acc-P", "inst-otra", null)).toBe(UNMATCHED_INCOME_KEY);
  });

  it("fila archivada de template sigue ruteando sus DTEs (histórico)", () => {
    const rows: FlowRowRef[] = [
      {
        id: "r-pine-pemuco", name: "Pine - Pemuco", crmAccountId: "acc-P",
        installationId: "inst-pemuco", recurringTemplateId: "tpl-pemuco", categoryId: null,
        mapping: "ACCOUNT_INSTALLATION", section: "INGRESOS",
      },
      {
        id: "r-pine-llay", name: "Pine - Llay Llay", crmAccountId: "acc-P",
        installationId: "inst-llay", recurringTemplateId: "tpl-llay", categoryId: null,
        mapping: "ACCOUNT_INSTALLATION", section: "INGRESOS",
      },
    ];
    const match = buildIncomeMatcher(rows);
    expect(match("acc-P", "inst-llay", "tpl-llay")).toBe("r-pine-llay");
    expect(match("acc-P", "inst-pemuco", "tpl-pemuco")).toBe("r-pine-pemuco");
  });

  it("cuenta sin filas → UNMATCHED", () => {
    const match = buildIncomeMatcher([]);
    expect(match("acc-X", null, null)).toBe(UNMATCHED_INCOME_KEY);
  });

  it("fallback no roba DTEs con templateId válido", () => {
    const rows: FlowRowRef[] = [
      {
        id: "r-a", name: "A", crmAccountId: "acc-A", installationId: "i1",
        recurringTemplateId: "tpl-a", categoryId: null,
        mapping: "ACCOUNT_INSTALLATION", section: "INGRESOS",
      },
      {
        id: "r-b", name: "B", crmAccountId: "acc-B", installationId: "i2",
        recurringTemplateId: "tpl-b", categoryId: null,
        mapping: "ACCOUNT_INSTALLATION", section: "INGRESOS",
      },
    ];
    const match = buildIncomeMatcher(rows);
    expect(match("acc-A", "i1", "tpl-a")).toBe("r-a");
    // Template de otra cuenta + instalación que identifica inequívocamente
    // la fila de acc-A → la instalación gana (vínculo huérfano).
    expect(match("acc-A", "i1", "tpl-b")).toBe("r-a");
  });

  it("instalación inequívoca de otra programación gana al templateId huérfano", () => {
    const rows: FlowRowRef[] = [
      {
        id: "r-poetas", name: "Ametel - Los Poetas", crmAccountId: "acc-A",
        installationId: "inst-poetas", recurringTemplateId: "tpl-poetas", categoryId: null,
        mapping: "ACCOUNT_INSTALLATION", section: "INGRESOS",
      },
      {
        id: "r-pena", name: "Ametel - Peñablanca", crmAccountId: "acc-A",
        installationId: "inst-pena", recurringTemplateId: "tpl-pena", categoryId: null,
        mapping: "ACCOUNT_INSTALLATION", section: "INGRESOS",
      },
    ];
    const match = buildIncomeMatcher(rows);
    expect(match("acc-A", "inst-poetas", "tpl-pena")).toBe("r-poetas");
    expect(match("acc-A", "inst-pena", "tpl-pena")).toBe("r-pena");
  });

  it("20%/80% misma instalación: el templateId manda (no es inequívoco)", () => {
    const rows: FlowRowRef[] = [
      {
        id: "r-20", name: "Transmat 20%", crmAccountId: "acc-T", installationId: "i1",
        recurringTemplateId: "tpl-20", categoryId: null,
        mapping: "ACCOUNT_INSTALLATION", section: "INGRESOS",
      },
      {
        id: "r-80", name: "Transmat 80%", crmAccountId: "acc-T", installationId: "i1",
        recurringTemplateId: "tpl-80", categoryId: null,
        mapping: "ACCOUNT_INSTALLATION", section: "INGRESOS",
      },
    ];
    const match = buildIncomeMatcher(rows);
    expect(match("acc-T", "i1", "tpl-80")).toBe("r-80");
    expect(match("acc-T", "i1", "tpl-20")).toBe("r-20");
  });

  it("fila MANUAL de ingreso no cuenta para el fallback de cuenta", () => {
    const rows: FlowRowRef[] = [
      {
        id: "r-manual", name: "Devolución préstamo socios", crmAccountId: "acc-A",
        installationId: null, recurringTemplateId: null, categoryId: null,
        mapping: "MANUAL", section: "INGRESOS",
      },
      {
        id: "r-tpl", name: "Cliente A", crmAccountId: "acc-A", installationId: "i1",
        recurringTemplateId: "tpl-a", categoryId: null,
        mapping: "ACCOUNT_INSTALLATION", section: "INGRESOS",
      },
    ];
    const match = buildIncomeMatcher(rows);
    expect(match("acc-A", "i1", null)).toBe("r-tpl");
    expect(match("acc-A", null, null)).toBe(UNMATCHED_INCOME_KEY);
  });
});
