import { describe, expect, it } from "vitest";
import { nameSimilarity } from "@/lib/crm/account-duplicates";
import {
  conflictsNeedConfirmation,
  pickAutoAccountMatch,
  type StructureAccountMatch,
  type StructureEntityConflicts,
} from "../structure-entity-match";

describe("pickAutoAccountMatch", () => {
  it("prioriza cuenta del hilo", () => {
    const matches: StructureAccountMatch[] = [
      {
        id: "a",
        name: "Coexpan",
        rut: null,
        score: 0.9,
        reason: "similar_name",
      },
      {
        id: "b",
        name: "Coexpan Chile",
        rut: null,
        score: 1,
        reason: "thread",
      },
    ];
    // findStructureAccountMatches ya ordena; simulamos orden correcto
    const ordered = [...matches].sort((a, b) => {
      const rank = { thread: 0, rut: 1, exact_name: 2, similar_name: 3 } as const;
      return rank[a.reason] - rank[b.reason] || b.score - a.score;
    });
    expect(pickAutoAccountMatch(ordered)?.id).toBe("b");
  });

  it("reutiliza Coexpan vs Coexpan Chile por contención de nombre", () => {
    const score = nameSimilarity("Coexpan", "Coexpan Chile");
    expect(score).toBeGreaterThanOrEqual(0.85);
    const match = pickAutoAccountMatch([
      {
        id: "1",
        name: "Coexpan Chile",
        rut: null,
        score,
        reason: "similar_name",
      },
    ]);
    expect(match?.id).toBe("1");
  });

  it("no elige automáticamente si hay dos similares empatados", () => {
    const match = pickAutoAccountMatch([
      {
        id: "1",
        name: "Acme Norte",
        rut: null,
        score: 0.9,
        reason: "similar_name",
      },
      {
        id: "2",
        name: "Acme Sur",
        rut: null,
        score: 0.88,
        reason: "similar_name",
      },
    ]);
    expect(match).toBeNull();
  });
});

describe("conflictsNeedConfirmation", () => {
  it("true si hay cuenta o instalación o contacto o deal", () => {
    const empty: StructureEntityConflicts = {
      accounts: [],
      installations: [],
      contacts: [],
      deal: null,
    };
    expect(conflictsNeedConfirmation(empty)).toBe(false);
    expect(
      conflictsNeedConfirmation({
        ...empty,
        accounts: [
          {
            id: "a",
            name: "X",
            rut: null,
            score: 1,
            reason: "exact_name",
          },
        ],
      }),
    ).toBe(true);
    expect(
      conflictsNeedConfirmation({
        ...empty,
        installations: [
          {
            proposalName: "Planta",
            id: "i",
            name: "Planta",
            address: null,
          },
        ],
      }),
    ).toBe(true);
  });
});
