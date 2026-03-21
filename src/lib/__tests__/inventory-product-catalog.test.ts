/**
 * @vitest-environment node
 */
import { describe, expect, it } from "vitest";
import {
  DEFAULT_INVENTORY_UNIFORM_CATALOG,
  parseBulkCatalogText,
  parseSizesInput,
} from "@/lib/inventory-product-catalog";

describe("inventory-product-catalog", () => {
  it("normaliza tallas separadas por coma o salto de linea", () => {
    const sizes = parseSizesInput(" s, m, L \n xl\nxxl,, ");
    expect(sizes).toEqual(["S", "M", "L", "XL", "XXL"]);
  });

  it("parsea texto en formato producto|tallas", () => {
    const input = `
      Calzado|35,36,37
      Polera|xxs, xs, s, m
    `;
    const parsed = parseBulkCatalogText(input);
    expect(parsed).toEqual([
      { name: "Calzado", category: "uniform", sizes: ["35", "36", "37"] },
      { name: "Polera", category: "uniform", sizes: ["XXS", "XS", "S", "M"] },
    ]);
  });

  it("incluye productos base esperados", () => {
    const names = DEFAULT_INVENTORY_UNIFORM_CATALOG.map((p) => p.name);
    expect(names).toEqual(
      expect.arrayContaining([
        "Calzado",
        "Pantalon",
        "Polera",
        "Camisa",
        "Geologo",
        "Polar",
        "Chaqueta",
      ])
    );
  });
});
