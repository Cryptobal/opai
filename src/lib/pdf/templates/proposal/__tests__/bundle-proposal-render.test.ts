// @vitest-environment node

import { describe, expect, it } from "vitest";
import type { ProposalProps } from "../build-proposal-props";
import { renderProposalHTML, type ProposalAssets } from "../render-proposal-html";

const assets: ProposalAssets = {
  logoUrl: "",
  escudoUrl: "",
  clientLogos: [],
  guardPhotos: [],
};

const monoFixture: ProposalProps = {
  companyName: "Cliente Demo",
  quotationCode: "CPQ-2026-001",
  proposalDate: "30-07-2026",
  contactName: "Ana Pérez",
  contactPosition: "Gerente",
  ai: {
    descripcionBreve: "Servicio de seguridad integral.",
    resumenEjecutivo: "Resumen ejecutivo de prueba.\n\nSegundo párrafo.",
    analisisNecesidades: "Análisis de necesidades.\n\nMás detalle.",
    sectoresRelevantes: ["Logística"],
  },
  serviceType: "Seguridad integral",
  installationName: "Planta Norte",
  installationAddress: "Av. Industrial 100",
  coverageSchedule: "Lun-Dom 24h",
  staffingCount: 4,
  staffingRegime: "4x4",
  supervisionFrequency: "2x por turno",
  items: [
    {
      index: 1,
      description: "Guardia diurno",
      quantity: 2,
      unitPrice: 100,
      subtotal: 200,
      unitPriceFormatted: "UF 100",
      subtotalFormatted: "UF 200",
    },
  ],
  totalNeto: 200,
  totalNetoFormatted: "UF 200",
  currency: "UF",
  paymentTerms: "Mensual, contra entrega de factura",
  providerLogo: "",
  opaiLogo: "",
  lx3Logo: "",
  clientLogos: [],
  portalScreenshots: {},
  companyConfig: {
    commercialName: "Gard Security",
    companyName: "Gard Security",
    brandNameUpper: "GARD SECURITY",
    website: "https://gard.cl",
    phone: "+56 9 0000 0000",
    email: "comercial@example.com",
  },
  clientLogosWithNames: [],
  companyStats: {
    yearsInOperation: "",
    activeGuards: "",
    protectedFacilities: "",
    regionsCount: "",
  },
  proposalMetrics: [],
  regimeExplanation: "Régimen 4x4",
  includedItems: [],
};

describe("renderProposalHTML — regresión mono + bundle", () => {
  it("sin installations produce HTML idéntico (mono-instalación)", () => {
    const a = renderProposalHTML(monoFixture, assets);
    const b = renderProposalHTML(
      { ...monoFixture, installations: undefined, consolidatedSummary: undefined },
      assets,
    );
    expect(a).toBe(b);
    expect(a).toContain("<!-- PÁG 17: INVERSIÓN -->");
    expect(a).toContain("Inversión Mensual");
    expect(a).not.toContain("data-bundle-consolidated");
  });

  it("con installations renderiza cuadro consolidado y detalle aperturado", () => {
    const html = renderProposalHTML(
      {
        ...monoFixture,
        quotationCode: "PROP-2026-001",
        installations: [
          {
            quoteCode: "CPQ-2026-001",
            name: "Ovalle",
            city: "Ovalle",
            address: "Calle 1",
            staffingCount: 4,
            totalPositions: 2,
            coverageSchedule: "24h",
            monthly: 200,
            monthlyFormatted: "UF 200",
            items: monoFixture.items,
          },
          {
            quoteCode: "CPQ-2026-002",
            name: "La Serena",
            address: "Calle 2",
            staffingCount: 2,
            totalPositions: 1,
            coverageSchedule: "Diurno",
            monthly: 100,
            monthlyFormatted: "UF 100",
            items: monoFixture.items,
          },
        ],
        consolidatedSummary: {
          totalMonthly: 300,
          totalMonthlyFormatted: "UF 300",
          totalGuards: 6,
          totalPositions: 3,
          installationCount: 2,
          currency: "UF",
        },
      },
      assets,
    );
    expect(html).toContain("data-bundle-consolidated");
    expect(html).toContain("Cuadro consolidado por instalación");
    expect(html).toContain("TOTAL GENERAL (2 instalaciones)");
    expect(html).toContain("Detalle — Ovalle");
    expect(html).toContain("Detalle — La Serena");
    expect(html).not.toContain("<!-- PÁG 17: INVERSIÓN -->");
  });
});
