import { describe, expect, it } from "vitest";
import { parseExtractStructureBody } from "@/modules/crm/email/extract-structure-body";

describe("parseExtractStructureBody", () => {
  it("acepta body vacío / undefined (compat)", () => {
    expect(parseExtractStructureBody(undefined)).toEqual({ ok: true });
    expect(parseExtractStructureBody(null)).toEqual({ ok: true });
    expect(parseExtractStructureBody({})).toEqual({ ok: true });
  });

  it("acepta answers válidas", () => {
    const r = parseExtractStructureBody({
      answers: [{ question: "Dotación?", answer: "26 guardias" }],
    });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.answers).toHaveLength(1);
  });

  it("rechaza claves extras (strict)", () => {
    const r = parseExtractStructureBody({ foo: 1 });
    expect(r.ok).toBe(false);
  });

  it("rechaza answers sobredimensionadas", () => {
    const r = parseExtractStructureBody({
      answers: [{ question: "q", answer: "x".repeat(501) }],
    });
    expect(r.ok).toBe(false);
  });

  it("rechaza más de 10 answers", () => {
    const r = parseExtractStructureBody({
      answers: Array.from({ length: 11 }, (_, i) => ({
        question: `q${i}`,
        answer: `a${i}`,
      })),
    });
    expect(r.ok).toBe(false);
  });

  it("acepta baseProposal y locks válidos", () => {
    const r = parseExtractStructureBody({
      answers: [{ question: "HH?", answer: "42" }],
      baseProposal: { account: { name: "X" } },
      locks: ["account.name", "deal.title"],
    });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.locks).toEqual(["account.name", "deal.title"]);
      expect(r.baseProposal).toEqual({ account: { name: "X" } });
    }
  });

  it("rechaza locks inválidos (>100 o string >200)", () => {
    expect(
      parseExtractStructureBody({ locks: Array.from({ length: 101 }, (_, i) => `p${i}`) }).ok,
    ).toBe(false);
    expect(parseExtractStructureBody({ locks: ["x".repeat(201)] }).ok).toBe(false);
  });
});
