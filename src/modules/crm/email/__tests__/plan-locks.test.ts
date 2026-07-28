import { describe, expect, it } from "vitest";
import { applyLocks, mergeAssumptionItems } from "../plan-locks";
import { emptyCrmStructureProposal } from "../email-to-crm-structure.types";

describe("applyLocks", () => {
  it("preserva paths simples y anidados", () => {
    const base = emptyCrmStructureProposal();
    base.account.name = "Empresa Editada";
    base.deal.title = "Negocio Editado";
    base.installations = [
      {
        name: "Sitio A",
        address: "Calle 1",
        commune: null,
        city: null,
        mapsUrl: null,
        coverageSlots: [
          {
            name: "Puesto",
            role: null,
            regimen: "24/7",
            dias: ["lunes"],
            horaInicio: "08:00",
            horaFin: "20:00",
            simultaneous: 2,
            notes: null,
            weeklyHH: 0,
            headcount: 0,
            pattern: "parcial",
            staffingRationale: "",
          },
        ],
      },
    ];

    const next = emptyCrmStructureProposal();
    next.account.name = "Empresa IA";
    next.deal.title = "Negocio IA";
    next.installations = [
      {
        name: "Sitio IA",
        address: null,
        commune: null,
        city: null,
        mapsUrl: null,
        coverageSlots: [
          {
            name: "Puesto IA",
            role: null,
            regimen: null,
            dias: ["martes"],
            horaInicio: "09:00",
            horaFin: "18:00",
            simultaneous: 1,
            notes: null,
            weeklyHH: 0,
            headcount: 0,
            pattern: "parcial",
            staffingRationale: "",
          },
        ],
      },
    ];

    const locked = applyLocks(next, base, [
      "account.name",
      "deal.title",
      "installations.0.coverageSlots.0.simultaneous",
    ]);

    expect(locked.account.name).toBe("Empresa Editada");
    expect(locked.deal.title).toBe("Negocio Editado");
    expect(locked.installations[0].coverageSlots[0].simultaneous).toBe(2);
    expect(locked.installations[0].name).toBe("Sitio IA");
  });

  it("ignora paths inválidos e índices inexistentes", () => {
    const base = emptyCrmStructureProposal();
    base.account.name = "X";
    const next = emptyCrmStructureProposal();
    next.account.name = "Y";
    const locked = applyLocks(next, base, [
      "account.noExiste",
      "installations.5.name",
      "",
      "staffingTotals.weeklyHH",
    ]);
    expect(locked.account.name).toBe("Y");
    expect(locked.staffingTotals).toEqual(next.staffingTotals);
  });
});

describe("mergeAssumptionItems", () => {
  it("conserva supuestos user/edited y agrega nuevos de IA", () => {
    const base = [
      {
        id: "a-0-abc",
        text: "Editado por usuario",
        originalText: "Original IA",
        origin: "edited" as const,
      },
    ];
    const next = [
      {
        id: "a-0-abc",
        text: "Regenerado",
        originalText: "Regenerado",
        origin: "inference" as const,
      },
      {
        id: "a-1-def",
        text: "Nuevo de IA",
        originalText: "Nuevo de IA",
        origin: "inference" as const,
      },
    ];
    const merged = mergeAssumptionItems(next, base);
    expect(merged).toHaveLength(2);
    expect(merged[0].text).toBe("Editado por usuario");
    expect(merged[0].origin).toBe("edited");
    expect(merged[1].text).toBe("Nuevo de IA");
  });
});
