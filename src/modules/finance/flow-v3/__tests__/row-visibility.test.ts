import { describe, it, expect } from "vitest";
import {
  normalizeNameForDedupe,
  pickAdoptionCandidate,
  pickDuplicateKeeper,
  shouldArchiveSurplusAccountRow,
  shouldIncludeFlowRow,
  type AdoptionCandidate,
} from "../row-visibility";

describe("normalizeNameForDedupe", () => {
  it("ignora case, tildes y espacios extremos", () => {
    expect(normalizeNameForDedupe("  Peñablanca ")).toBe(
      normalizeNameForDedupe("peñablanca"),
    );
    expect(normalizeNameForDedupe("Condominio La Florida")).toBe(
      normalizeNameForDedupe("Condominio la florida"),
    );
  });
});

describe("pickAdoptionCandidate", () => {
  const free: AdoptionCandidate[] = [
    {
      id: "r-other-acc",
      crmAccountId: "acc-B",
      installationId: null,
      recurringTemplateId: null,
      name: "Otro",
      createdAt: "2026-01-01",
    },
    {
      id: "r-exact",
      crmAccountId: "acc-A",
      installationId: "inst-1",
      recurringTemplateId: null,
      name: "Ametel algarrobo",
      createdAt: "2026-01-02",
    },
    {
      id: "r-generic",
      crmAccountId: "acc-A",
      installationId: null,
      recurringTemplateId: null,
      name: "Ametel",
      createdAt: "2026-01-01",
    },
    {
      id: "r-named",
      crmAccountId: "acc-C",
      installationId: "inst-x",
      recurringTemplateId: null,
      name: "Pine · Pine pemuco",
      createdAt: "2026-01-01",
    },
    {
      id: "r-taken",
      crmAccountId: "acc-A",
      installationId: "inst-2",
      recurringTemplateId: "tpl-other",
      name: "Ocupada",
      createdAt: "2026-01-01",
    },
  ];

  it("adopta exacta cuenta+instalación", () => {
    const hit = pickAdoptionCandidate(
      { id: "tpl-1", crmAccountId: "acc-A", installationId: "inst-1", name: "X" },
      free,
    );
    expect(hit?.id).toBe("r-exact");
  });

  it("adopta genérica de cuenta si no hay exacta", () => {
    const hit = pickAdoptionCandidate(
      { id: "tpl-2", crmAccountId: "acc-A", installationId: "inst-99", name: "X" },
      free,
    );
    expect(hit?.id).toBe("r-generic");
  });

  it("adopta por nombre normalizado misma cuenta", () => {
    const hit = pickAdoptionCandidate(
      {
        id: "tpl-3",
        crmAccountId: "acc-C",
        installationId: "inst-y",
        name: "Pine · Pine Pemuco",
      },
      free,
    );
    expect(hit?.id).toBe("r-named");
  });

  it("no adopta entre cuentas distintas", () => {
    const hit = pickAdoptionCandidate(
      { id: "tpl-4", crmAccountId: "acc-Z", installationId: null, name: "Ametel" },
      free,
    );
    expect(hit).toBeNull();
  });

  it("no roba fila de otro template", () => {
    // Solo queda r-taken para acc-A si filtramos libres… pick ya exige recurringTemplateId null.
    const onlyTaken: AdoptionCandidate[] = [
      {
        id: "r-taken",
        crmAccountId: "acc-A",
        installationId: "inst-2",
        recurringTemplateId: "tpl-other",
        name: "Ocupada",
        createdAt: "2026-01-01",
      },
    ];
    const hit = pickAdoptionCandidate(
      { id: "tpl-5", crmAccountId: "acc-A", installationId: "inst-2", name: "Ocupada" },
      onlyTaken,
    );
    expect(hit).toBeNull();
  });
});

describe("shouldArchiveSurplusAccountRow", () => {
  it("archiva sobrante sin template activo ni plan", () => {
    expect(
      shouldArchiveSurplusAccountRow({ hasPlanData: false, linkedActiveTemplate: false }),
    ).toBe(true);
  });

  it("no archiva fila ligada a template activo", () => {
    expect(
      shouldArchiveSurplusAccountRow({ hasPlanData: false, linkedActiveTemplate: true }),
    ).toBe(false);
  });

  it("no archiva si tiene plan propio", () => {
    expect(
      shouldArchiveSurplusAccountRow({ hasPlanData: true, linkedActiveTemplate: false }),
    ).toBe(false);
  });

  it("no archiva si hay DTE pendiente con flowRouting OWN_ROW", () => {
    expect(
      shouldArchiveSurplusAccountRow({
        hasPlanData: false,
        linkedActiveTemplate: false,
        hasExplicitOwnRowDte: true,
      }),
    ).toBe(false);
  });
});

describe("pickDuplicateKeeper", () => {
  it("archiva la más nueva/vacía: conserva la con template o más antigua", () => {
    const keeper = pickDuplicateKeeper([
      {
        id: "new",
        recurringTemplateId: null,
        hasPlanData: false,
        createdAt: "2026-06-01",
      },
      {
        id: "old",
        recurringTemplateId: null,
        hasPlanData: false,
        createdAt: "2026-01-01",
      },
    ]);
    expect(keeper.id).toBe("old");
  });
});

describe("shouldIncludeFlowRow — visibilidad universal", () => {
  const base = {
    windowStartYmd: "2026-07-06",
    hasDataInWindow: false,
    hasDataBeforeCutoff: false,
    archivedCutoffYmd: null as string | null,
    template: null as null | { id: string; isActive: boolean; endDateYmd: string | null },
  };

  it("manual vacía visible", () => {
    expect(
      shouldIncludeFlowRow({
        ...base,
        row: { id: "r1", mapping: "MANUAL", archivedAt: null },
      }),
    ).toBe(true);
  });

  it("template activo sin datos visible", () => {
    expect(
      shouldIncludeFlowRow({
        ...base,
        row: {
          id: "r1",
          mapping: "ACCOUNT_INSTALLATION",
          archivedAt: null,
          recurringTemplateId: "tpl-1",
        },
        template: { id: "tpl-1", isActive: true, endDateYmd: null },
      }),
    ).toBe(true);
  });

  it("pausada sin datos fuera de ventana → oculta", () => {
    expect(
      shouldIncludeFlowRow({
        ...base,
        row: {
          id: "r1",
          mapping: "ACCOUNT_INSTALLATION",
          archivedAt: null,
          recurringTemplateId: "tpl-1",
        },
        template: { id: "tpl-1", isActive: false, endDateYmd: null },
        hasDataInWindow: false,
      }),
    ).toBe(false);
  });

  it("misma fila visible al pedir ventana pasada con pagos", () => {
    expect(
      shouldIncludeFlowRow({
        ...base,
        row: {
          id: "r1",
          mapping: "ACCOUNT_INSTALLATION",
          archivedAt: null,
          recurringTemplateId: "tpl-1",
        },
        template: { id: "tpl-1", isActive: false, endDateYmd: null },
        hasDataInWindow: true,
      }),
    ).toBe(true);
  });

  it("huérfana (template eliminado) solo por datos", () => {
    expect(
      shouldIncludeFlowRow({
        ...base,
        row: {
          id: "r1",
          mapping: "ACCOUNT_INSTALLATION",
          archivedAt: null,
          recurringTemplateId: "tpl-gone",
        },
        template: null,
        hasDataInWindow: false,
      }),
    ).toBe(false);
  });

  it("CATEGORY (sueldos) siempre visible", () => {
    expect(
      shouldIncludeFlowRow({
        ...base,
        row: { id: "r1", mapping: "CATEGORY", archivedAt: null },
      }),
    ).toBe(true);
  });

  it("fallback canónico vacío → oculta (v4.3)", () => {
    expect(
      shouldIncludeFlowRow({
        ...base,
        row: {
          id: "otros",
          mapping: "MANUAL",
          archivedAt: null,
          isCanonicalFallback: true,
        },
        hasDataInWindow: false,
      }),
    ).toBe(false);
  });

  it("fallback canónico con datos → visible", () => {
    expect(
      shouldIncludeFlowRow({
        ...base,
        row: {
          id: "otros",
          mapping: "MANUAL",
          archivedAt: null,
          isCanonicalFallback: true,
        },
        hasDataInWindow: true,
      }),
    ).toBe(true);
  });

  it("MANUAL de socios vacía sigue siempre visible", () => {
    expect(
      shouldIncludeFlowRow({
        ...base,
        row: { id: "socio", mapping: "MANUAL", archivedAt: null },
        hasDataInWindow: false,
      }),
    ).toBe(true);
  });
});
