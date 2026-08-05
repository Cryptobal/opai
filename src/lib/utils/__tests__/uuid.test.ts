import { describe, expect, it } from "vitest";
import { isUuid, newUuid } from "../uuid";

describe("newUuid", () => {
  it("genera un id no vacío y distinto en llamadas sucesivas", () => {
    const a = newUuid();
    const b = newUuid();
    expect(a.length).toBeGreaterThan(8);
    expect(b.length).toBeGreaterThan(8);
    expect(a).not.toBe(b);
  });

  it("usa crypto.randomUUID cuando está disponible (formato UUID)", () => {
    // En jsdom/Node moderno suele existir; si no, el fallback no es UUID estricto.
    const id = newUuid();
    if (typeof globalThis.crypto?.randomUUID === "function") {
      expect(isUuid(id)).toBe(true);
    } else {
      expect(id.startsWith("id-")).toBe(true);
    }
  });
});
