import { describe, expect, it } from "vitest";
import {
  normalizeIntRange,
  normalizeMobileCl9,
  normalizePhoneCl,
  normalizeWebsite,
} from "@/lib/validations/field-normalizers";
import {
  createAccountSchema,
  updateAccountSchema,
} from "@/lib/validations/crm";

describe("normalizeWebsite", () => {
  it('antepone https:// a "empresa.cl"', () => {
    const r = normalizeWebsite("empresa.cl");
    expect(r).toEqual({
      ok: true,
      value: "https://empresa.cl",
      note: "Se guardó como https://empresa.cl",
    });
  });

  it("deja https://x.cl sin cambio", () => {
    const r = normalizeWebsite("https://x.cl");
    expect(r).toEqual({ ok: true, value: "https://x.cl" });
  });

  it('rechaza "no es url"', () => {
    const r = normalizeWebsite("no es url");
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/URL/i);
  });

  it("vacío → null", () => {
    expect(normalizeWebsite("")).toEqual({ ok: true, value: null });
    expect(normalizeWebsite("   ")).toEqual({ ok: true, value: null });
  });
});

describe("normalizePhoneCl", () => {
  it("normaliza 9 dígitos", () => {
    const r = normalizePhoneCl("987654321");
    expect(r).toEqual({
      ok: true,
      value: "+56 9 8765 4321",
      note: "Se guardó como +56 9 8765 4321",
    });
  });

  it("normaliza con prefijo 56", () => {
    const r = normalizePhoneCl("56987654321");
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.value).toBe("+56 9 8765 4321");
  });

  it("rechaza corto", () => {
    const r = normalizePhoneCl("123");
    expect(r.ok).toBe(false);
  });
});

describe("normalizeMobileCl9", () => {
  it("deja 9 dígitos para Personas/API", () => {
    expect(normalizeMobileCl9("912345678")).toEqual({
      ok: true,
      value: "912345678",
    });
  });

  it("acepta prefijo +56 y nota el guardado", () => {
    const r = normalizeMobileCl9("+56 9 1234 5678");
    expect(r).toEqual({
      ok: true,
      value: "912345678",
      note: "Se guardó como 912345678",
    });
  });

  it("vacío → null", () => {
    expect(normalizeMobileCl9("")).toEqual({ ok: true, value: null });
  });

  it("rechaza fijo u otros", () => {
    expect(normalizeMobileCl9("22334455").ok).toBe(false);
  });
});

describe("normalizeIntRange", () => {
  const n = normalizeIntRange(10, 1000);

  it("rechaza bajo el mínimo", () => {
    expect(n("5").ok).toBe(false);
  });

  it("acepta en rango", () => {
    expect(n("150")).toEqual({ ok: true, value: "150" });
  });

  it("rechaza sobre el máximo", () => {
    expect(n("1500").ok).toBe(false);
  });
});

describe("paridad website create/update", () => {
  it("produce el mismo valor normalizado", () => {
    const created = createAccountSchema.parse({
      name: "Test",
      website: "x.cl",
    });
    const updated = updateAccountSchema.parse({ website: "x.cl" });
    expect(created.website).toBe("https://x.cl");
    expect(updated.website).toBe("https://x.cl");
    expect(created.website).toBe(updated.website);
  });
});
