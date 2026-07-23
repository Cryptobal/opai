import { describe, expect, it } from "vitest";
import { resolveNavContext } from "../resolve-context";

describe("resolveNavContext", () => {
  it("resuelve el Hub (módulo raíz → sub-vista Resumen con href /hub)", () => {
    const ctx = resolveNavContext("/hub");
    expect(ctx).not.toBeNull();
    expect(ctx?.moduleNode.key).toBe("hub");
    // /hub matchea el hijo hub-summary (href /hub, exactMatch) como leaf.
    expect(ctx?.node.key).toBe("hub-summary");
    expect(ctx?.title).toBeTruthy();
    expect(ctx?.shortTitle).toBeTruthy();
    expect(ctx?.icon).toBeTruthy();
  });

  it("resuelve cotizaciones bajo el módulo Comercial", () => {
    const ctx = resolveNavContext("/crm/cotizaciones");
    expect(ctx?.moduleNode.key).toBe("crm");
    expect(ctx?.node.key).toBe("crm-quotes");
    expect(ctx?.title).toBe("Cotizaciones");
  });

  it("resuelve una ruta de Pautas (hermana plana) hacia su leaf N3", () => {
    const ctx = resolveNavContext("/ops/ppc");
    expect(ctx?.moduleNode.key).toBe("ops");
    // el leaf real es la sub-sección PPC
    expect(ctx?.node.key).toBe("pautas-ppc");
    expect(ctx?.title).toBe("PPC");
  });

  it("resuelve una ruta sin N3 (Agenda, hermana plana de Productividad)", () => {
    const ctx = resolveNavContext("/opai/agenda");
    expect(ctx?.moduleNode.key).toBe("productividad");
    expect(ctx?.node.key).toBe("productividad-agenda");
    expect(ctx?.title).toBe("Agenda");
  });

  it("una ficha [id] expone el listado padre como destino de volver", () => {
    const ctx = resolveNavContext("/crm/leads/123");
    expect(ctx?.moduleNode.key).toBe("crm");
    // El nodo más específico del registry para la ficha es el listado Leads.
    expect(ctx?.node.key).toBe("crm-leads");
    // El botón "volver" apunta al listado, no al módulo.
    expect(ctx?.parentHref).toBe("/crm/leads");
    expect(ctx?.parentLabel).toBe("Leads");
  });

  it("devuelve null para rutas fuera del registry", () => {
    expect(resolveNavContext("/totally/unknown")).toBeNull();
  });
});
