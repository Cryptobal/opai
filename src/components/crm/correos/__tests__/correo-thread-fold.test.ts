import { describe, expect, it } from "vitest";
import { foldThread, unreadMessageIds } from "../correo-thread-fold";

function chain(n: number, patch: Record<number, { isDraft?: boolean }> = {}) {
  return Array.from({ length: n }, (_, i) => ({ id: `m${i}`, ...(patch[i] ?? {}) }));
}

describe("foldThread", () => {
  it("hilo vacío no rompe", () => {
    const fold = foldThread([]);
    expect(fold.visible).toEqual([]);
    expect(fold.hiddenCount).toBe(0);
    expect(fold.separatorAfterIndex).toBeNull();
  });

  it("n=3 muestra la cadena completa sin separador", () => {
    const fold = foldThread(chain(3));
    expect(fold.visible).toEqual([0, 1, 2]);
    expect(fold.hiddenCount).toBe(0);
    expect(fold.separatorAfterIndex).toBeNull();
    expect(fold.expanded).toEqual([2]);
  });

  it("n=4 con 1 oculto no agrupa (mínimo 2)", () => {
    const fold = foldThread(chain(4));
    expect(fold.visible).toEqual([0, 1, 2, 3]);
    expect(fold.hiddenCount).toBe(0);
    expect(fold.separatorAfterIndex).toBeNull();
  });

  it("n=6 agrupa 3 detrás del contador", () => {
    const fold = foldThread(chain(6));
    expect(fold.visible).toEqual([0, 4, 5]);
    expect(fold.hidden).toEqual([1, 2, 3]);
    expect(fold.hiddenCount).toBe(3);
    expect(fold.separatorAfterIndex).toBe(0);
    expect(fold.expanded).toEqual([5]);
  });

  it("n=37 agrupa 34 (caso real del brief)", () => {
    const fold = foldThread(chain(37));
    expect(fold.visible).toEqual([0, 35, 36]);
    expect(fold.hiddenCount).toBe(34);
    expect(fold.separatorAfterIndex).toBe(0);
  });

  it("no leídos intermedios quedan visibles y expandidos, y no cuentan al contador", () => {
    const fold = foldThread(chain(10), { unreadIds: ["m4", "m7"] });
    expect(fold.visible).toEqual([0, 4, 7, 8, 9]);
    expect(fold.hiddenCount).toBe(5);
    expect(fold.hidden).toEqual([1, 2, 3, 5, 6]);
    // La píldora se ancla tras el primer visible previo al primer oculto.
    expect(fold.separatorAfterIndex).toBe(0);
    expect(fold.expanded).toEqual([4, 7, 9]);
  });

  it("borradores nunca se agrupan (aunque no abran expandidos)", () => {
    const fold = foldThread(chain(8, { 3: { isDraft: true } }));
    expect(fold.visible).toContain(3);
    expect(fold.hidden).not.toContain(3);
    expect(fold.hiddenCount).toBe(4);
    expect(fold.expanded).toEqual([7]);
  });

  it("deep-link dentro del grupo lo saca del contador y lo expande", () => {
    const fold = foldThread(chain(10), { forceExpandId: "m2" });
    expect(fold.visible).toEqual([0, 2, 8, 9]);
    expect(fold.hiddenCount).toBe(6);
    expect(fold.expanded).toEqual([2, 9]);
  });

  it("si al sacar el deep-link quedan <2 ocultos, no agrupa", () => {
    const fold = foldThread(chain(5), { forceExpandId: "m1" });
    expect(fold.visible).toEqual([0, 1, 2, 3, 4]);
    expect(fold.hiddenCount).toBe(0);
    expect(fold.expanded).toEqual([1, 4]);
  });
});

describe("unreadMessageIds", () => {
  const messages = [
    { id: "a", direction: "in", sentAt: "2026-01-01T10:00:00.000Z" },
    { id: "b", direction: "out", sentAt: "2026-01-02T10:00:00.000Z" },
    { id: "c", direction: "in", sentAt: "2026-01-03T10:00:00.000Z" },
    { id: "d", direction: "in", sentAt: "2026-01-04T10:00:00.000Z", isDraft: true },
  ];

  it("sin cursor no marca nada", () => {
    expect(unreadMessageIds(messages, null)).toEqual([]);
  });

  it("marca solo entrantes posteriores al cursor", () => {
    expect(unreadMessageIds(messages, "2026-01-02T00:00:00.000Z")).toEqual(["c"]);
  });

  it("ignora salientes, borradores y fechas inválidas", () => {
    expect(unreadMessageIds(messages, "2025-01-01T00:00:00.000Z")).toEqual(["a", "c"]);
    expect(unreadMessageIds(messages, "no-es-fecha")).toEqual([]);
  });
});
