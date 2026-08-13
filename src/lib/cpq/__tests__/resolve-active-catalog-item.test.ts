import { describe, expect, it } from "vitest";
import {
  dedupeQuoteCatalogLines,
  hydrateQuoteCatalogLine,
  hydrateQuoteCatalogLines,
  resolveActiveCatalogItem,
} from "../resolve-active-catalog-item";
import { catalogUnitOptions, defaultCatalogUnit } from "../catalog-units";

const tenantId = "tenant-a";

const oldAltura = {
  id: "old-altura",
  type: "exam",
  name: "Altura",
  tenantId,
  active: false,
  defaultTechnicalSpecs: "Certificación trabajo en altura según normativa vigente.",
};

const newAltura = {
  id: "new-altura",
  type: "exam",
  name: "Altura",
  tenantId,
  active: true,
  defaultTechnicalSpecs: "Evaluación médica de aptitud para trabajo en altura física.",
};

const preocupacional = {
  id: "preocupacional",
  type: "exam",
  name: "Preocupacional",
  tenantId,
  active: true,
  defaultTechnicalSpecs: "Evaluación médica preocupacional para determinar aptitud.",
};

const activeCatalog = [newAltura, preocupacional];

describe("resolveActiveCatalogItem", () => {
  it("devuelve la fila viva del mismo id (precios/textos actuales)", () => {
    const staleCopy = { ...preocupacional, defaultTechnicalSpecs: "texto viejo" };
    const resolved = resolveActiveCatalogItem(staleCopy, activeCatalog, tenantId);
    expect(resolved?.id).toBe("preocupacional");
    expect(resolved?.defaultTechnicalSpecs).toBe(preocupacional.defaultTechnicalSpecs);
  });

  it("reengancha un ítem inactivo al activo del mismo nombre y tipo", () => {
    const resolved = resolveActiveCatalogItem(oldAltura, activeCatalog, tenantId);
    expect(resolved?.id).toBe("new-altura");
    expect(resolved?.defaultTechnicalSpecs).toBe(newAltura.defaultTechnicalSpecs);
  });

  it("normaliza acentos al comparar nombres", () => {
    const referenced = { ...oldAltura, name: "altura" };
    const catalog = [{ ...newAltura, name: "Áltura" }];
    expect(resolveActiveCatalogItem(referenced, catalog, tenantId)?.id).toBe("new-altura");
  });

  it("prefiere el ítem del tenant sobre el global", () => {
    const globalAltura = { ...newAltura, id: "global-altura", tenantId: null };
    const resolved = resolveActiveCatalogItem(oldAltura, [globalAltura, newAltura], tenantId);
    expect(resolved?.id).toBe("new-altura");
  });
});

describe("hydrateQuoteCatalogLine", () => {
  it("actualiza catalogItemId y limpia specs copiadas del ítem viejo", () => {
    const line = hydrateQuoteCatalogLine(
      {
        catalogItemId: oldAltura.id,
        catalogItem: oldAltura,
        technicalSpecs: oldAltura.defaultTechnicalSpecs,
        active: true,
      },
      activeCatalog,
      tenantId,
    );
    expect(line.catalogItemId).toBe("new-altura");
    expect(line.catalogItem?.id).toBe("new-altura");
    expect(line.technicalSpecs).toBeNull();
  });

  it("conserva specs personalizadas al remapear", () => {
    const line = hydrateQuoteCatalogLine(
      {
        catalogItemId: oldAltura.id,
        catalogItem: oldAltura,
        technicalSpecs: "Texto custom de esta cotización",
        active: true,
      },
      activeCatalog,
      tenantId,
    );
    expect(line.catalogItemId).toBe("new-altura");
    expect(line.technicalSpecs).toBe("Texto custom de esta cotización");
  });
});

describe("hydrateQuoteCatalogLines", () => {
  it("deduplica líneas que colapsan al mismo ítem activo", () => {
    const lines = hydrateQuoteCatalogLines(
      [
        { catalogItemId: oldAltura.id, catalogItem: oldAltura, active: true },
        { catalogItemId: newAltura.id, catalogItem: newAltura, active: false },
      ],
      activeCatalog,
      tenantId,
    );
    expect(lines).toHaveLength(1);
    expect(lines[0]?.catalogItemId).toBe("new-altura");
    expect(lines[0]?.active).toBe(true);
  });
});

describe("dedupeQuoteCatalogLines", () => {
  it("prefiere la línea activa", () => {
    const result = dedupeQuoteCatalogLines([
      { catalogItemId: "a", active: false },
      { catalogItemId: "a", active: true },
    ]);
    expect(result).toHaveLength(1);
    expect(result[0]?.active).toBe(true);
  });
});

describe("catalog units", () => {
  it("usa unidad de dominio por tipo", () => {
    expect(defaultCatalogUnit("exam")).toBe("examen");
    expect(defaultCatalogUnit("uniform")).toBe("unidad");
    expect(defaultCatalogUnit("meal")).toBe("comida");
    expect(defaultCatalogUnit("phone")).toBe("mes");
  });

  it("no convierte una unidad existente a mes", () => {
    expect(catalogUnitOptions("exam", "examen")).toContain("examen");
    expect(catalogUnitOptions("exam", "examen")[0]).toBe("examen");
    expect(catalogUnitOptions("exam", "unidad")).toContain("unidad");
  });
});
