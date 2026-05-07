/**
 * Tests del resolver de placeholders. Cubre tokens conocidos,
 * case-insensitive, sin tilde, currency CLP/UF, periodPolicy y
 * tokens desconocidos que quedan literales.
 *
 * No tiene I/O — todos los inputs se construyen en memoria.
 */

import { describe, it, expect } from "vitest";
import {
  resolvePlaceholders,
  resolvePeriodFromPolicy,
  buildContext,
  hasPlaceholders,
  type PlaceholderContext,
} from "../placeholders";

const baseCtx: PlaceholderContext = {
  period: { mes: "Mayo", anio: 2026, periodoCorto: "05/2026" },
  uf: { value: 39485, date: new Date(Date.UTC(2026, 4, 1)) },
  cliente: "Andalucía de Montajes Eléctricos",
  instalacion: "Algarrobo 111",
  currency: "UF",
};

describe("resolvePeriodFromPolicy", () => {
  it("CURRENT_MONTH (default) — devuelve el mes del run", () => {
    const r = resolvePeriodFromPolicy("CURRENT_MONTH", new Date(Date.UTC(2026, 4, 1)));
    expect(r.mes).toBe("Mayo");
    expect(r.anio).toBe(2026);
    expect(r.periodoCorto).toBe("05/2026");
  });

  it("PREVIOUS_MONTH — mes anterior al run", () => {
    const r = resolvePeriodFromPolicy("PREVIOUS_MONTH", new Date(Date.UTC(2026, 4, 1)));
    expect(r.mes).toBe("Abril");
    expect(r.anio).toBe(2026);
    expect(r.periodoCorto).toBe("04/2026");
  });

  it("PREVIOUS_MONTH — wrap-around enero → diciembre del año anterior", () => {
    const r = resolvePeriodFromPolicy("PREVIOUS_MONTH", new Date(Date.UTC(2026, 0, 5)));
    expect(r.mes).toBe("Diciembre");
    expect(r.anio).toBe(2025);
    expect(r.periodoCorto).toBe("12/2025");
  });

  it("NEXT_MONTH — mes siguiente al run", () => {
    const r = resolvePeriodFromPolicy("NEXT_MONTH", new Date(Date.UTC(2026, 4, 1)));
    expect(r.mes).toBe("Junio");
    expect(r.anio).toBe(2026);
    expect(r.periodoCorto).toBe("06/2026");
  });

  it("NEXT_MONTH — wrap-around diciembre → enero del año siguiente", () => {
    const r = resolvePeriodFromPolicy("NEXT_MONTH", new Date(Date.UTC(2026, 11, 31)));
    expect(r.mes).toBe("Enero");
    expect(r.anio).toBe(2027);
    expect(r.periodoCorto).toBe("01/2027");
  });
});

describe("resolvePlaceholders — tokens conocidos", () => {
  it("{{periodo}} → mes año", () => {
    expect(resolvePlaceholders("Servicio {{periodo}}", baseCtx)).toBe(
      "Servicio Mayo 2026",
    );
  });

  it("{{periodo_mes}} y {{periodo_anio}} por separado", () => {
    expect(
      resolvePlaceholders("Mes: {{periodo_mes}} / Año: {{periodo_anio}}", baseCtx),
    ).toBe("Mes: Mayo / Año: 2026");
  });

  it("{{periodo_corto}} formato numérico", () => {
    expect(resolvePlaceholders("{{periodo_corto}}", baseCtx)).toBe("05/2026");
  });

  it("{{uf_valor}} formato CLP con $ y separador de miles", () => {
    expect(resolvePlaceholders("UF al día: {{uf_valor}}", baseCtx)).toBe(
      "UF al día: $39.485",
    );
  });

  it("{{uf_fecha}} formato DD/MM/YYYY UTC", () => {
    expect(resolvePlaceholders("Fecha UF {{uf_fecha}}", baseCtx)).toBe(
      "Fecha UF 01/05/2026",
    );
  });

  it("{{uf_monto}} usa ufMonto * quantity con 4 decimales y coma", () => {
    const ctx: PlaceholderContext = {
      ...baseCtx,
      ufMonto: 40.173,
      ufMontoQuantity: 1,
    };
    expect(resolvePlaceholders("Monto: {{uf_monto}}", ctx)).toBe(
      "Monto: 40,1730 UF",
    );
  });

  it("{{uf_monto}} multiplica por quantity > 1", () => {
    const ctx: PlaceholderContext = {
      ...baseCtx,
      ufMonto: 10.5,
      ufMontoQuantity: 3,
    };
    expect(resolvePlaceholders("{{uf_monto}}", ctx)).toBe("31,5000 UF");
  });

  it("{{cliente}} y {{instalacion}}", () => {
    expect(
      resolvePlaceholders("{{cliente}} - {{instalacion}}", baseCtx),
    ).toBe("Andalucía de Montajes Eléctricos - Algarrobo 111");
  });
});

describe("resolvePlaceholders — case-insensitive y sin tilde", () => {
  it("{{Periodo}}, {{PERIODO}}, {{periodo}} son equivalentes", () => {
    expect(resolvePlaceholders("{{Periodo}}", baseCtx)).toBe("Mayo 2026");
    expect(resolvePlaceholders("{{PERIODO}}", baseCtx)).toBe("Mayo 2026");
    expect(resolvePlaceholders("{{periodo}}", baseCtx)).toBe("Mayo 2026");
  });

  it("{{periodo_anio}} y {{periodo_año}} son equivalentes", () => {
    expect(resolvePlaceholders("{{periodo_año}}", baseCtx)).toBe("2026");
    expect(resolvePlaceholders("{{periodo_anio}}", baseCtx)).toBe("2026");
  });

  it("{{Cliente}} ≡ {{CLIENTE}}", () => {
    expect(resolvePlaceholders("{{Cliente}}", baseCtx)).toBe(
      "Andalucía de Montajes Eléctricos",
    );
    expect(resolvePlaceholders("{{CLIENTE}}", baseCtx)).toBe(
      "Andalucía de Montajes Eléctricos",
    );
  });
});

describe("resolvePlaceholders — fallbacks y tokens desconocidos", () => {
  it("token desconocido queda literal", () => {
    expect(resolvePlaceholders("Ref: {{contrato}}", baseCtx)).toBe(
      "Ref: {{contrato}}",
    );
  });

  it("uf_monto con currency=CLP queda string vacío", () => {
    const ctx: PlaceholderContext = {
      ...baseCtx,
      currency: "CLP",
      ufMonto: 40,
      ufMontoQuantity: 1,
    };
    expect(resolvePlaceholders("Monto: {{uf_monto}}", ctx)).toBe("Monto: ");
  });

  it("uf_monto sin ufMonto definido queda vacío aunque currency=UF", () => {
    expect(resolvePlaceholders("Monto: {{uf_monto}}", baseCtx)).toBe(
      "Monto: ",
    );
  });

  it("uf_valor sin uf disponible (uf=null) queda vacío", () => {
    const ctx: PlaceholderContext = { ...baseCtx, uf: null };
    expect(resolvePlaceholders("UF: {{uf_valor}}", ctx)).toBe("UF: ");
  });

  it("instalacion null queda vacío", () => {
    const ctx: PlaceholderContext = { ...baseCtx, instalacion: null };
    expect(resolvePlaceholders("Inst: {{instalacion}}", ctx)).toBe("Inst: ");
  });

  it("texto vacío devuelve vacío", () => {
    expect(resolvePlaceholders("", baseCtx)).toBe("");
  });

  it("texto sin tokens no se modifica", () => {
    expect(resolvePlaceholders("Servicio mensual", baseCtx)).toBe(
      "Servicio mensual",
    );
  });

  it("varios tokens en el mismo texto", () => {
    const ctx: PlaceholderContext = {
      ...baseCtx,
      ufMonto: 40.173,
      ufMontoQuantity: 1,
    };
    expect(
      resolvePlaceholders(
        "Período {{periodo}}\nValor UF al día {{uf_fecha}}: {{uf_valor}}\nMonto: {{uf_monto}}",
        ctx,
      ),
    ).toBe(
      "Período Mayo 2026\nValor UF al día 01/05/2026: $39.485\nMonto: 40,1730 UF",
    );
  });
});

describe("hasPlaceholders", () => {
  it("detecta tokens", () => {
    expect(hasPlaceholders("Servicio {{periodo}}")).toBe(true);
    expect(hasPlaceholders("{{cliente}}")).toBe(true);
  });

  it("ignora texto sin tokens", () => {
    expect(hasPlaceholders("Servicio mensual")).toBe(false);
    expect(hasPlaceholders("")).toBe(false);
    expect(hasPlaceholders(null)).toBe(false);
    expect(hasPlaceholders(undefined)).toBe(false);
  });

  it("detecta token con caracteres en español", () => {
    expect(hasPlaceholders("{{periodo_año}}")).toBe(true);
  });
});

describe("buildContext", () => {
  it("arma el contexto con período resuelto desde la policy", () => {
    const ctx = buildContext({
      periodPolicy: "PREVIOUS_MONTH",
      runDate: new Date(Date.UTC(2026, 5, 1)),
      uf: { value: 40000, date: new Date(Date.UTC(2026, 4, 31)) },
      cliente: "Cliente X",
      instalacion: null,
      currency: "UF",
    });
    expect(ctx.period.mes).toBe("Mayo");
    expect(ctx.period.anio).toBe(2026);
    expect(ctx.uf?.value).toBe(40000);
    expect(ctx.cliente).toBe("Cliente X");
    expect(ctx.instalacion).toBeNull();
    expect(ctx.currency).toBe("UF");
  });
});
