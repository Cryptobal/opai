import { describe, expect, it } from "vitest";
import {
  CORREO_OPERATOR_REGISTRY,
  getCorreoOperatorKeys,
  getCorreoSearchOperatorChips,
} from "../correos-search-operators";
import {
  buildCorreoSearchConditions,
  parseCorreoSearchQuery,
} from "../correos-search";

describe("CORREO_OPERATOR_REGISTRY", () => {
  it("incluye domain y los operadores anunciados en UI", () => {
    const keys = getCorreoOperatorKeys();
    for (const required of [
      "from",
      "to",
      "cc",
      "domain",
      "subject",
      "has",
      "is",
      "in",
      "vertical",
      "newer_than",
      "older_than",
      "before",
      "after",
    ]) {
      expect(keys.has(required)).toBe(true);
    }
  });

  it("chips derivan del registry (fuente única)", () => {
    const chips = getCorreoSearchOperatorChips();
    expect(chips.some((c) => c.token.startsWith("domain"))).toBe(true);
    expect(chips.some((c) => c.token.startsWith("in:"))).toBe(true);
    expect(chips.every((c) => c.token.length > 0 && c.hint.length > 0)).toBe(true);
  });

  it.each(CORREO_OPERATOR_REGISTRY.map((op) => [op.key, op] as const))(
    "operador %s produce condiciones o parse activo",
    (key, op) => {
      let sample = `${key}:x`;
      if (op.type === "enum" && op.values?.[0]) {
        sample = op.chipToken ?? `${key}:${op.values[0]}`;
      } else if (op.type === "duration") {
        sample = op.chipToken ?? `${key}:7d`;
      } else if (op.type === "date") {
        sample = `${key}:2026-01-15`;
      } else if (key === "domain") {
        sample = "domain:macronet.cl";
      } else if (key === "from" || key === "to" || key === "cc") {
        sample = `${key}:lgonzalez@macronet.cl`;
      } else if (key === "subject") {
        sample = "subject:ACUDA";
      }

      const parsed = parseCorreoSearchQuery(sample);
      expect(parsed).not.toBeNull();
      const conds = buildCorreoSearchConditions(parsed!);
      // Al menos una condición SQL (o folder override / flag booleano activo).
      const hasStructural =
        conds.length > 0 ||
        parsed!.folderOverride != null ||
        parsed!.hasAttachment ||
        parsed!.unread != null ||
        parsed!.starred != null;
      expect(hasStructural).toBe(true);
    },
  );
});

describe("caso Macronet — parser", () => {
  it("macronet acuda → términos AND", () => {
    const p = parseCorreoSearchQuery("macronet acuda");
    expect(p?.terms).toEqual(["macronet", "acuda"]);
  });

  it("from + domain + acuda", () => {
    const p = parseCorreoSearchQuery(
      "from:carlos.irigoyen@gard.cl domain:macronet.cl acuda",
    );
    expect(p?.from).toEqual(["carlos.irigoyen@gard.cl"]);
    expect(p?.domains).toEqual(["macronet.cl"]);
    expect(p?.terms).toEqual(["acuda"]);
  });

  it("cc: se mapea a filtro to", () => {
    const p = parseCorreoSearchQuery("cc:lgonzalez@macronet.cl");
    expect(p?.to).toEqual(["lgonzalez@macronet.cl"]);
  });
});
