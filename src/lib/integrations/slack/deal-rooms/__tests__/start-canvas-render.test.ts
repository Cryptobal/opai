import { describe, expect, it } from "vitest";
import { renderStartCanvasMarkdown } from "../start-canvas-render";
import type { StartCanvasData } from "../start-canvas-data";

const START = new Date("2026-08-01T00:00:00Z");

function baseData(overrides: Partial<StartCanvasData> = {}): StartCanvasData {
  return {
    dealId: "deal-1",
    title: "Servicio Mall Plaza",
    accountName: "Mall Plaza SpA",
    serviceStartDate: START,
    isOngoingService: true,
    contractDurationMonths: null,
    serviceEndDate: null,
    totalGuards: 4,
    positions: [
      { name: "Acceso principal", weekdays: ["Lun", "Mar", "Mié", "Jue", "Vie"], startTime: "08:00", endTime: "20:00", numGuards: 2 },
    ],
    cargoSueldo: [{ cargo: "Guardia", netSalary: 550000, baseSalary: 700000 }],
    amount: 3200000,
    monthlyAmount: 3200000,
    quoteLabel: "Q-187 · aceptada",
    mapsUrl: "https://maps.google.com/?q=x",
    addressText: "Av. Siempre Viva 742",
    contact: { name: "Juan Pérez", phone: "+56911112222", email: "juan@cliente.cl" },
    extras: null,
    steps: [
      { title: "Contrato cliente firmado", team: "finanzas", dueDate: new Date("2026-07-17T00:00:00Z"), isExtra: false },
      { title: "Uniforme entregado", team: "inventario", dueDate: new Date("2026-07-29T00:00:00Z"), isExtra: false },
    ],
    files: [{ fileName: "contrato.pdf", downloadUrl: "https://r2/contrato.pdf", portalVisible: true }],
    opaiDealUrl: "https://opai/crm/deals/deal-1",
    quoteUrl: "https://opai/cpq/quotes/q1",
    accountUrl: "https://opai/crm/accounts/acc1",
    ...overrides,
  };
}

describe("renderStartCanvasMarkdown", () => {
  it("renderiza las 4 secciones con data mínima completa", () => {
    const md = renderStartCanvasMarkdown(baseData(), Date.parse("2026-07-25T12:00:00Z"));
    expect(md).toContain("🏁 Inicio de servicio · Mall Plaza SpA");
    expect(md).toContain("## 📋 Condiciones del servicio");
    expect(md).toContain("## ✅ Checklist de inicio");
    expect(md).toContain("## 📎 Documentos del negocio");
    expect(md).toContain("## 🔗 Enlaces");
    // Dotación y monto
    expect(md).toContain("**4 guardias** · 1 puesto");
    expect(md).toContain("**$3.200.000 + IVA**");
    // Checklist ordenado por vencimiento (contrato 17-07 antes que uniforme 29-07)
    const idxContrato = md.indexOf("Contrato cliente firmado");
    const idxUniforme = md.indexOf("Uniforme entregado");
    expect(idxContrato).toBeGreaterThan(-1);
    expect(idxContrato).toBeLessThan(idxUniforme);
    expect(md).toContain("- [ ] Contrato cliente firmado — @finanzas · vence 17-07");
    // Archivo como link
    expect(md).toContain("- [contrato.pdf](https://r2/contrato.pdf)");
  });

  it("countdown futuro / hoy / pasado", () => {
    expect(renderStartCanvasMarkdown(baseData(), Date.parse("2026-07-25T12:00:00Z"))).toContain("faltan 7 días");
    expect(renderStartCanvasMarkdown(baseData(), Date.parse("2026-08-01T09:00:00Z"))).toContain("¡inicia hoy!");
    expect(renderStartCanvasMarkdown(baseData(), Date.parse("2026-08-05T09:00:00Z"))).toContain("iniciado hace 4 días");
  });

  it("incluye extras cuando existen", () => {
    const md = renderStartCanvasMarkdown(baseData({ extras: "Traer llaves con portería" }), START.getTime());
    expect(md).toContain("| Extras | Traer llaves con portería |");
  });

  it("marca pasos EXTRA con estrella", () => {
    const md = renderStartCanvasMarkdown(
      baseData({ steps: [{ title: "Coordinar acceso especial", team: "ops", dueDate: START, isExtra: true }] }),
      START.getTime(),
    );
    expect(md).toContain("⭐ EXTRA");
  });

  it("degrada con 0 archivos y sin cotización", () => {
    const md = renderStartCanvasMarkdown(
      baseData({ files: [], quoteLabel: null, quoteUrl: null }),
      START.getTime(),
    );
    expect(md).toContain("_Sin documentos vinculados aún._");
    expect(md).not.toContain("| Cotización |");
    // Sin quoteUrl no se pinta el enlace de cotización
    expect(md).not.toContain("[📄 Cotización]");
  });

  it("modalidad servicio continuo (default)", () => {
    const md = renderStartCanvasMarkdown(baseData(), START.getTime());
    expect(md).toContain("🔁 Servicio continuo (indefinido)");
    expect(md).toContain("| Modalidad | Servicio continuo |");
    expect(md).not.toContain("Término estimado");
    expect(md).not.toContain("⏳ Plazo definido");
  });

  it("modalidad plazo definido con fecha de término", () => {
    const md = renderStartCanvasMarkdown(
      baseData({
        isOngoingService: false,
        contractDurationMonths: 2,
        serviceEndDate: new Date("2026-10-01T00:00:00Z"),
      }),
      START.getTime(),
    );
    expect(md).toContain("⏳ Plazo definido · 2 meses · termina el");
    expect(md).toContain("| Modalidad | Plazo definido (2 meses) |");
    expect(md).toMatch(/\| Término estimado \| .*octubre.*2026 \|/);
    expect(md).not.toContain("🔁 Servicio continuo");
  });

  it("escapa pipes y saltos en celdas de tabla", () => {
    const md = renderStartCanvasMarkdown(
      baseData({ extras: "línea1\nlínea2 | con pipe" }),
      START.getTime(),
    );
    expect(md).toContain("línea1<br>línea2 \\| con pipe");
  });
});
