import { describe, expect, it } from "vitest";
import {
  ancestorsOf,
  buildAccountTree,
  flattenVisible,
  type AccountNodeInput,
} from "../account-tree";

function acc(
  id: string,
  code: string,
  parentId: string | null,
  level = 1,
): AccountNodeInput {
  return { id, code, parentId, level };
}

describe("buildAccountTree", () => {
  it("árbol nominal 4 niveles: raíces, depthOf, childrenOf", () => {
    const accounts = [
      acc("a1", "1", null, 1),
      acc("a11", "1.1", "a1", 2),
      acc("a1101", "1.1.01", "a11", 3),
      acc("a1101001", "1.1.01.001", "a1101", 4),
      acc("a2", "2", null, 1),
    ];
    const idx = buildAccountTree(accounts);

    expect(idx.roots).toEqual(["a1", "a2"]);
    expect(idx.childrenOf.get("a1")).toEqual(["a11"]);
    expect(idx.childrenOf.get("a11")).toEqual(["a1101"]);
    expect(idx.childrenOf.get("a1101")).toEqual(["a1101001"]);
    expect(idx.childrenOf.get("a1101001")).toEqual([]);
    expect(idx.depthOf.get("a1")).toBe(0);
    expect(idx.depthOf.get("a11")).toBe(1);
    expect(idx.depthOf.get("a1101")).toBe(2);
    expect(idx.depthOf.get("a1101001")).toBe(3);
    expect(idx.parentOf.get("a1101001")).toBe("a1101");
  });

  it("huérfano nivel 2 (parentId null) se reancla por prefijo de code", () => {
    const accounts = [
      acc("g6", "6", null, 1),
      acc("g63", "6.3", null, 2), // wizard: parentId null, level 2
    ];
    const idx = buildAccountTree(accounts);

    expect(idx.roots).toEqual(["g6"]);
    expect(idx.parentOf.get("g63")).toBe("g6");
    expect(idx.childrenOf.get("g6")).toEqual(["g63"]);
    expect(idx.depthOf.get("g63")).toBe(1);
  });

  it("padre ausente: reancla en ancestro por prefijo y no desaparece", () => {
    // 1.1.01 no está en el set (inactivo/ausente)
    const accounts = [
      acc("a1", "1", null, 1),
      acc("a11", "1.1", "a1", 2),
      acc("leaf", "1.1.01.001", "missing-parent", 4),
    ];
    const idx = buildAccountTree(accounts);

    expect(idx.parentOf.get("leaf")).toBe("a11");
    expect(idx.depthOf.get("leaf")).toBe(2);
    expect(idx.childrenOf.get("a11")).toContain("leaf");
    expect(idx.roots).not.toContain("leaf");
  });

  it("sin ancestro alguno → raíz visible depth 0", () => {
    const accounts = [acc("x", "9.9.9", null, 3)];
    const idx = buildAccountTree(accounts);

    expect(idx.roots).toEqual(["x"]);
    expect(idx.depthOf.get("x")).toBe(0);
    expect(idx.parentOf.get("x")).toBeNull();
  });

  it("ciclo artificial: ambos tratados como raíz (no cuelga)", () => {
    const accounts = [
      acc("A", "1.1", "B", 2),
      acc("B", "1.2", "A", 2),
    ];
    const idx = buildAccountTree(accounts);

    expect(idx.roots).toEqual(expect.arrayContaining(["A", "B"]));
    expect(idx.roots).toHaveLength(2);
    expect(idx.parentOf.get("A")).toBeNull();
    expect(idx.parentOf.get("B")).toBeNull();
    expect(idx.depthOf.get("A")).toBe(0);
    expect(idx.depthOf.get("B")).toBe(0);
  });

  it("orden numérico: 6.2 antes que 6.10", () => {
    const accounts = [
      acc("r", "6", null, 1),
      acc("c10", "6.10", "r", 2),
      acc("c2", "6.2", "r", 2),
      acc("c1", "6.1", "r", 2),
    ];
    const idx = buildAccountTree(accounts);

    expect(idx.childrenOf.get("r")).toEqual(["c1", "c2", "c10"]);
  });
});

describe("ancestorsOf", () => {
  it("devuelve la cadena de padres hacia la raíz", () => {
    const accounts = [
      acc("a1", "1", null, 1),
      acc("a11", "1.1", "a1", 2),
      acc("a1101", "1.1.01", "a11", 3),
    ];
    const idx = buildAccountTree(accounts);
    expect(ancestorsOf("a1101", idx)).toEqual(["a11", "a1"]);
    expect(ancestorsOf("a1", idx)).toEqual([]);
  });
});

describe("flattenVisible", () => {
  const accounts = [
    acc("a1", "1", null, 1),
    acc("a11", "1.1", "a1", 2),
    acc("a1101", "1.1.01", "a11", 3),
    acc("a1101001", "1.1.01.001", "a1101", 4),
    acc("a12", "1.2", "a1", 2),
    acc("a2", "2", null, 1),
  ];

  it("expanded vacío → sólo raíces", () => {
    const idx = buildAccountTree(accounts);
    const rows = flattenVisible(accounts, idx, { expanded: new Set() });
    expect(rows.map((r) => r.account.id)).toEqual(["a1", "a2"]);
    expect(rows.every((r) => r.depth === 0)).toBe(true);
  });

  it("un id expandido → raíces + hijos directos, sin nietos", () => {
    const idx = buildAccountTree(accounts);
    const rows = flattenVisible(accounts, idx, {
      expanded: new Set(["a1"]),
    });
    expect(rows.map((r) => r.account.id)).toEqual(["a1", "a11", "a12", "a2"]);
    expect(rows.find((r) => r.account.id === "a1")?.isExpanded).toBe(true);
    expect(rows.find((r) => r.account.id === "a11")?.isExpanded).toBe(false);
  });

  it("restrictTo + forceExpanded (búsqueda) → matches y ancestros en orden", () => {
    const idx = buildAccountTree(accounts);
    const matchId = "a1101001";
    const ancs = ancestorsOf(matchId, idx);
    const restrictTo = new Set([matchId, ...ancs]);
    const force = new Set(ancs);

    const rows = flattenVisible(accounts, idx, {
      expanded: new Set(),
      forceExpanded: force,
      restrictTo,
    });

    expect(rows.map((r) => r.account.id)).toEqual([
      "a1",
      "a11",
      "a1101",
      "a1101001",
    ]);
    // a2 no matchea ni es ancestro
    expect(rows.map((r) => r.account.id)).not.toContain("a2");
    // a12 es hermano de a11, no está en restrictTo
    expect(rows.map((r) => r.account.id)).not.toContain("a12");
  });
});
