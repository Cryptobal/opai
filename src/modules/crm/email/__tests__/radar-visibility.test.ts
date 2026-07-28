import { describe, it, expect } from "vitest";
import {
  radarItemVisible,
  radarBadgeFor,
  capabilityForItem,
  verticalForItem,
  effectiveVertical,
  visibleVertical,
  type RadarCapability,
} from "../radar-types";

const caps = (...c: RadarCapability[]) => new Set<RadarCapability>(c);

describe("capabilityForItem / verticalForItem", () => {
  it("deriva vertical del kind (fijo) y de sugerencia (del item)", () => {
    expect(verticalForItem("nuevo_lead", null)).toBe("comercial");
    expect(verticalForItem("reclamo_cliente", null)).toBe("operaciones");
    expect(verticalForItem("cobranza", null)).toBe("finanzas");
    expect(verticalForItem("sugerencia", "rrhh")).toBe("rrhh");
  });
  it("mapea vertical → capability", () => {
    expect(capabilityForItem("nuevo_lead", null)).toBe("radar_comercial");
    expect(capabilityForItem("solicitud_operativa", null)).toBe("radar_operaciones");
    expect(capabilityForItem("postulacion", null)).toBe("radar_rrhh");
    expect(capabilityForItem("disputa_factura", null)).toBe("radar_finanzas");
  });
});

describe("radarItemVisible — filtro de servidor por capability", () => {
  it("un usuario con solo radar_operaciones NO ve items comerciales", () => {
    const ops = caps("radar_operaciones");
    expect(radarItemVisible("nuevo_lead", null, ops)).toBe(false);
    expect(radarItemVisible("senal_compra", null, ops)).toBe(false);
    // pero SÍ ve los operativos
    expect(radarItemVisible("reclamo_cliente", null, ops)).toBe(true);
    expect(radarItemVisible("solicitud_operativa", null, ops)).toBe(true);
    // y NO los de otras verticales
    expect(radarItemVisible("cobranza", null, ops)).toBe(false);
    expect(radarItemVisible("solicitud_laboral", null, ops)).toBe(false);
  });

  it("un usuario con radar_comercial ve comerciales, no operativos", () => {
    const com = caps("radar_comercial");
    expect(radarItemVisible("nuevo_lead", null, com)).toBe(true);
    expect(radarItemVisible("reclamo_cliente", null, com)).toBe(false);
  });

  it("sin capabilities no ve nada", () => {
    const none = caps();
    for (const k of ["nuevo_lead", "reclamo_cliente", "cobranza", "solicitud_laboral"]) {
      expect(radarItemVisible(k, null, none)).toBe(false);
    }
  });

  it("sugerencia se filtra por la vertical del item", () => {
    expect(radarItemVisible("sugerencia", "operaciones", caps("radar_operaciones"))).toBe(true);
    expect(radarItemVisible("sugerencia", "operaciones", caps("radar_comercial"))).toBe(false);
  });
});

describe("radarBadgeFor — badge de bandeja por vertical", () => {
  it("sólo devuelve badge si el solicitante tiene la capability", () => {
    expect(radarBadgeFor("operaciones", caps("radar_operaciones"))?.label).toContain("Operativo");
    expect(radarBadgeFor("operaciones", caps("radar_comercial"))).toBeNull();
    expect(radarBadgeFor("comercial", caps("radar_comercial"))?.label).toContain("Lead");
    expect(radarBadgeFor("cobranza", caps("radar_finanzas"))?.tone).toBe("ok");
    expect(radarBadgeFor(null, caps("radar_comercial"))).toBeNull();
  });
});

describe("effectiveVertical — override humano manda", () => {
  it("usa override cuando existe", () => {
    expect(effectiveVertical("comercial", "cobranza")).toBe("cobranza");
  });
  it("cae a aiVertical sin override", () => {
    expect(effectiveVertical("operaciones", null)).toBe("operaciones");
  });
  it("otro e inválidos → null", () => {
    expect(effectiveVertical("otro", null)).toBeNull();
    expect(effectiveVertical("desconocido", null)).toBeNull();
    expect(effectiveVertical(null, null)).toBeNull();
  });
  it("override a otro no es válido → null", () => {
    expect(effectiveVertical("comercial", "otro")).toBeNull();
  });
});

describe("visibleVertical — capability del solicitante", () => {
  it("sin capability → null", () => {
    expect(visibleVertical("comercial", caps("radar_operaciones"))).toBeNull();
  });
  it("cobranza requiere radar_finanzas", () => {
    expect(visibleVertical("cobranza", caps("radar_finanzas"))).toBe("cobranza");
    expect(visibleVertical("cobranza", caps("radar_comercial"))).toBeNull();
  });
  it("null se propaga", () => {
    expect(visibleVertical(null, caps("radar_comercial"))).toBeNull();
  });
});
