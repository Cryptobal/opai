import { describe, expect, it } from "vitest";
import {
  clusterDuplicateAccounts,
  nameSimilarity,
  normalizeAccountName,
  scoreAccountsAgainstQuery,
  type DuplicateAccountCandidate,
} from "@/lib/crm/account-duplicates";

function acc(
  partial: Partial<DuplicateAccountCandidate> & Pick<DuplicateAccountCandidate, "id" | "name">
): DuplicateAccountCandidate {
  return {
    rut: null,
    legalName: null,
    type: "prospect",
    status: "prospect",
    isActive: true,
    createdAt: new Date("2024-01-01"),
    _count: { contacts: 0, deals: 0, installations: 0 },
    ...partial,
  };
}

describe("normalizeAccountName", () => {
  it("quita acentos y puntuación", () => {
    expect(normalizeAccountName("AC Perforaciones S.A.")).toBe("ac perforaciones sa");
  });
});

describe("nameSimilarity", () => {
  it("detecta igualdad y contención", () => {
    expect(nameSimilarity("Acme SpA", "ACME SPA")).toBe(1);
    expect(nameSimilarity("Acme Seguridad", "Acme")).toBeGreaterThanOrEqual(0.9);
  });
});

describe("scoreAccountsAgainstQuery", () => {
  it("ordena por score y filtra bajo umbral", () => {
    const scored = scoreAccountsAgainstQuery(
      [
        acc({ id: "1", name: "Minera Andina SpA" }),
        acc({ id: "2", name: "Panadería Central" }),
        acc({ id: "3", name: "Minera Andina" }),
      ],
      "Minera Andina",
      0.45
    );
    expect(scored.map((s) => s.id)).toEqual(["3", "1"]);
    expect(scored[0].score).toBeGreaterThanOrEqual(scored[1].score);
  });
});

describe("clusterDuplicateAccounts", () => {
  it("agrupa por mismo RUT", () => {
    const clusters = clusterDuplicateAccounts([
      acc({ id: "a", name: "Empresa Uno", rut: "76.123.456-7", _count: { contacts: 2, deals: 1, installations: 0 } }),
      acc({ id: "b", name: "Empresa Uno SpA", rut: "761234567", _count: { contacts: 0, deals: 0, installations: 0 } }),
      acc({ id: "c", name: "Otra Cosas", rut: "11.111.111-1" }),
    ]);
    expect(clusters).toHaveLength(1);
    expect(clusters[0].reason === "rut" || clusters[0].reason === "rut_name").toBe(true);
    expect(clusters[0].accounts.map((x) => x.id).sort()).toEqual(["a", "b"]);
    // Master sugerido: más relaciones
    expect(clusters[0].accounts[0].id).toBe("a");
  });

  it("agrupa por nombre muy similar", () => {
    const clusters = clusterDuplicateAccounts([
      acc({ id: "1", name: "AC Perforaciones S.A." }),
      acc({ id: "2", name: "AC Perforaciones SA" }),
      acc({ id: "3", name: "Completamente Distinta SpA" }),
    ]);
    expect(clusters.some((c) => c.accounts.some((a) => a.id === "1") && c.accounts.some((a) => a.id === "2"))).toBe(
      true
    );
    expect(clusters.every((c) => !c.accounts.some((a) => a.id === "3") || c.accounts.length === 1)).toBe(true);
  });

  it("no crea clusters con una sola cuenta", () => {
    expect(clusterDuplicateAccounts([acc({ id: "solo", name: "Única" })])).toEqual([]);
  });
});
