export type InventoryBulkProductInput = {
  name: string;
  category: "uniform" | "asset";
  sku?: string;
  notes?: string;
  sizes?: string[];
};

const TOP_SIZES = ["XXXS", "XXS", "XS", "S", "M", "L", "XL", "XXL", "XXXL"];

export const DEFAULT_INVENTORY_UNIFORM_CATALOG: InventoryBulkProductInput[] = [
  {
    name: "Calzado",
    category: "uniform",
    sizes: ["35", "36", "37", "38", "39", "40", "41", "42", "43", "44", "45", "46", "47"],
  },
  {
    name: "Pantalon",
    category: "uniform",
    sizes: ["34", "36", "38", "40", "42", "44", "46", "48", "50", "52", "54", "56", "58"],
  },
  { name: "Polera", category: "uniform", sizes: TOP_SIZES },
  { name: "Camisa", category: "uniform", sizes: TOP_SIZES },
  { name: "Geologo", category: "uniform", sizes: TOP_SIZES },
  { name: "Polar", category: "uniform", sizes: TOP_SIZES },
  { name: "Chaqueta", category: "uniform", sizes: TOP_SIZES },
];

export function parseSizesInput(value: string): string[] {
  return Array.from(
    new Set(
      value
        .split(/[\n,;]+/)
        .map((s) => s.trim())
        .filter(Boolean)
        .map((s) => s.toUpperCase())
    )
  );
}

export function parseBulkCatalogText(value: string): InventoryBulkProductInput[] {
  const lines = value
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);

  const result: InventoryBulkProductInput[] = [];
  for (const line of lines) {
    const [rawName, rawSizes = ""] = line.split("|");
    const name = (rawName || "").trim();
    if (!name) continue;
    result.push({
      name,
      category: "uniform",
      sizes: parseSizesInput(rawSizes),
    });
  }
  return result;
}
