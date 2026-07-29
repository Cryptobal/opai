import { describe, expect, it } from "vitest";
import {
  ENTITY_TINTS,
  tintClasses,
  tintFromId,
  type EntityTint,
} from "@/lib/entity-tint";

describe("tintFromId", () => {
  it("es determinista: misma entrada → misma salida", () => {
    const samples = [
      "acc_abc123",
      "cuid_xyz",
      "a",
      "00000000-0000-0000-0000-000000000001",
      "cliente-gard",
    ];
    for (const id of samples) {
      expect(tintFromId(id)).toBe(tintFromId(id));
    }
  });

  it("fallback estable con id nulo o vacío", () => {
    expect(tintFromId(null)).toBe("teal");
    expect(tintFromId(undefined)).toBe("teal");
    expect(tintFromId("")).toBe("teal");
  });

  it("respeta override manual antes del hash", () => {
    const id = "acc_frequent";
    const hashed = tintFromId(id);
    const forced: EntityTint =
      hashed === "rose" ? "emerald" : "rose";
    expect(tintFromId(id, { [id]: forced })).toBe(forced);
    expect(tintFromId(id)).toBe(hashed);
  });

  it("distribuye ~uniforme entre 6 tints sobre 1000 ids", () => {
    const counts = Object.fromEntries(ENTITY_TINTS.map((t) => [t, 0])) as Record<
      EntityTint,
      number
    >;
    for (let i = 0; i < 1000; i++) {
      const tint = tintFromId(`entity-${i}-seed`);
      counts[tint]++;
    }
    // Con 1000/6 ≈ 166.7; toleramos [80, 280] (hash no criptográfico).
    for (const tint of ENTITY_TINTS) {
      expect(counts[tint]).toBeGreaterThanOrEqual(80);
      expect(counts[tint]).toBeLessThanOrEqual(280);
    }
    const total = Object.values(counts).reduce((a, b) => a + b, 0);
    expect(total).toBe(1000);
  });

  it("determinismo sobre 1000 ids consecutivos", () => {
    for (let i = 0; i < 1000; i++) {
      const id = `id-${i}`;
      expect(tintFromId(id)).toBe(tintFromId(id));
      expect(ENTITY_TINTS).toContain(tintFromId(id));
    }
  });
});

describe("tintClasses", () => {
  it("devuelve clases Tailwind estáticas sin interpolación", () => {
    const expectedBg: Record<string, string> = {
      emerald: "bg-tint-emerald",
      violet: "bg-tint-violet",
      amber: "bg-tint-amber",
      sky: "bg-tint-sky",
      rose: "bg-tint-rose",
      teal: "bg-tint-teal",
    };
    const expectedFg: Record<string, string> = {
      emerald: "text-tint-emerald-fg",
      violet: "text-tint-violet-fg",
      amber: "text-tint-amber-fg",
      sky: "text-tint-sky-fg",
      rose: "text-tint-rose-fg",
      teal: "text-tint-teal-fg",
    };
    for (const tint of ENTITY_TINTS) {
      const c = tintClasses(tint);
      expect(c.bg).toBe(expectedBg[tint]);
      expect(c.fg).toBe(expectedFg[tint]);
      expect(c.rail).toContain("inset_3px_0_0");
      expect(c.bg.includes("$" + "{")).toBe(false);
      expect(c.fg.includes("$" + "{")).toBe(false);
    }
  });
});
