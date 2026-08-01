import { describe, expect, it } from "vitest";
import { pathMatchesNode, type NavNode } from "../registry";

/** Helper: build a minimal node with just the matching-relevant fields. */
function node(partial: Pick<NavNode, "href"> & Partial<NavNode>) {
  return partial as Pick<NavNode, "href" | "exactMatch" | "activePaths">;
}

describe("pathMatchesNode", () => {
  describe("href exacto / prefijo", () => {
    it("matchea cuando pathname === href", () => {
      expect(pathMatchesNode("/finanzas/bancos", node({ href: "/finanzas/bancos" }))).toBe(true);
    });

    it("matchea sub-rutas por prefijo (href + '/')", () => {
      expect(
        pathMatchesNode("/finanzas/bancos/cartola", node({ href: "/finanzas/bancos" })),
      ).toBe(true);
    });

    it("NO matchea otra ruta que solo comparte prefijo de string sin '/'", () => {
      // /finanzas/bancos-legacy NO debe activar /finanzas/bancos
      expect(
        pathMatchesNode("/finanzas/bancos-legacy", node({ href: "/finanzas/bancos" })),
      ).toBe(false);
    });

    it("NO matchea un path totalmente distinto", () => {
      expect(pathMatchesNode("/crm/leads", node({ href: "/finanzas/bancos" }))).toBe(false);
    });
  });

  describe("exactMatch", () => {
    it("con exactMatch solo iguala con ===", () => {
      const n = node({ href: "/finanzas", exactMatch: true });
      expect(pathMatchesNode("/finanzas", n)).toBe(true);
      expect(pathMatchesNode("/finanzas/facturacion", n)).toBe(false);
    });
  });

  describe("activePaths", () => {
    const banca = node({
      href: "/finanzas/bancos",
      activePaths: ["/finanzas/conciliacion"],
    });
    const flujo = node({
      href: "/finanzas/flujo-caja/planilla",
      activePaths: ["/finanzas/flujo-caja"],
    });

    it("matchea un activePath exacto", () => {
      expect(pathMatchesNode("/finanzas/conciliacion", banca)).toBe(true);
      expect(pathMatchesNode("/finanzas/flujo-caja", flujo)).toBe(true);
    });

    it("matchea sub-rutas de un activePath (prefijo + '/')", () => {
      expect(pathMatchesNode("/finanzas/conciliacion/123", banca)).toBe(true);
      expect(pathMatchesNode("/finanzas/flujo-caja/cierre", flujo)).toBe(true);
    });

    it("sigue matcheando el href propio además de los activePaths", () => {
      expect(pathMatchesNode("/finanzas/bancos", banca)).toBe(true);
      expect(pathMatchesNode("/finanzas/bancos/cuenta-1", banca)).toBe(true);
      expect(pathMatchesNode("/finanzas/flujo-caja/planilla", flujo)).toBe(true);
    });

    it("NO matchea un prefijo de string parcial de un activePath (exige '/')", () => {
      // /finanzas/flujo NO debe activar /finanzas/flujo-caja
      expect(pathMatchesNode("/finanzas/flujo", flujo)).toBe(false);
    });

    it("NO matchea rutas fuera del href y de los activePaths", () => {
      expect(pathMatchesNode("/finanzas/reportes", banca)).toBe(false);
      expect(pathMatchesNode("/finanzas/flujo-caja", banca)).toBe(false);
    });
  });

  describe("no-match parcial (regresión startsWith sin '/')", () => {
    it("/finanzas/flujo NO matchea href /finanzas/flujo-caja", () => {
      expect(
        pathMatchesNode("/finanzas/flujo", node({ href: "/finanzas/flujo-caja" })),
      ).toBe(false);
    });
  });
});
