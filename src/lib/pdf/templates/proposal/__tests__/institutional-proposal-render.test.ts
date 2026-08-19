// @vitest-environment node

import { describe, expect, it } from "vitest";
import { PDFDocument } from "pdf-lib";
import type { ProposalProps } from "../build-proposal-props";
import { renderInstitutionalProposalToBufferFromProps } from "../institutional-layout";

const fixture: ProposalProps = {
  variant: "technical",
  watermark: "BORRADOR",
  proposalStatus: "borrador",
  companyName: "Cliente Industrial SpA",
  quotationCode: "CPQ-2026-321",
  proposalDate: "15-08-2026",
  contactName: "Ana Pérez",
  contactPosition: "Gerenta de Operaciones",
  ai: {
    descripcionBreve: "Propuesta institucional y económica.",
    resumenEjecutivo: "Resumen ejecutivo.",
    analisisNecesidades: "Comprensión del servicio.",
    sectoresRelevantes: [],
    organigramRoles: [
      "Gerencia General",
      "Gerencia de Operaciones",
      "Supervisión de terreno",
    ],
    certifications: [
      "Acreditación OS-10 de Carabineros de Chile",
    ],
  },
  serviceType: "Seguridad integral",
  installationName: "Planta Norte",
  installationAddress: "Av. Industrial 100",
  coverageSchedule: "Continuo",
  staffingCount: 4,
  staffingRegime: "4x4",
  supervisionFrequency: "Según SLA",
  items: [
    {
      index: 1,
      description: "Servicio de seguridad integral",
      quantity: 1,
      unitPrice: 1_500_000,
      subtotal: 1_500_000,
      unitPriceFormatted: "$1.500.000",
      subtotalFormatted: "$1.500.000",
    },
  ],
  totalNeto: 1_500_000,
  totalNetoFormatted: "$1.500.000",
  currency: "CLP",
  paymentTerms: "30 días",
  providerLogo: "",
  opaiLogo: "",
  lx3Logo: "",
  clientLogos: [],
  portalScreenshots: {},
  companyConfig: {
    commercialName: "Proveedor Security",
    companyName: "Proveedor Security SpA",
    brandNameUpper: "PROVEEDOR SECURITY",
    website: "https://example.com",
    phone: "+56 9 0000 0000",
    email: "comercial@example.com",
  },
  offerer: {
    commercialName: "Proveedor Security",
    legalName: "Proveedor Security SpA",
    rut: "76.123.456-7",
    address: "Santiago, Chile",
    legalRepresentative: {
      name: "Representante Legal",
      rut: "12.345.678-9",
    },
  },
  referenceAccounts: [
    {
      id: "reference-1",
      name: "Cuenta Referencia",
      industry: "Logística",
      city: "Santiago",
    },
  ],
  clientLogosWithNames: [],
  companyStats: {
    yearsInOperation: "",
    activeGuards: "",
    protectedFacilities: "",
    regionsCount: "",
  },
  proposalMetrics: [
    { value: "98%", label: "Cumplimiento documentado" },
  ],
  regimeExplanation: "",
  proposalSections: [
    {
      id: "summary",
      order: 0,
      title: "Resumen ejecutivo",
      content: "Una propuesta preventiva, trazable y medible.",
    },
    {
      id: "dotacion",
      order: 1.5,
      title: "Dotación",
      content:
        "### Turnos\n\n| Cargo | Cantidad |\n| --- | ---: |\n| Guardia | **4** |\n\n*Dotación total:** 4 personas",
    },
    {
      id: "who",
      order: 1,
      title: "Quiénes somos y organigrama",
      content: "Estructura institucional basada en cargos y responsabilidades.",
    },
    {
      id: "experience",
      order: 2,
      title: "Experiencia y certificaciones",
      content: "Experiencia en operaciones industriales y logísticas.",
    },
    {
      id: "economic",
      order: 3,
      title: "Oferta económica — apertura completa",
      content: "",
      kind: "oferta_economica",
    },
  ],
  complianceMatrix: [
    {
      ref: "§ 3.1",
      requirement: "Presentar experiencia comprobable",
      sectionTitle: "Experiencia y certificaciones",
      level: "CUMPLE",
    },
  ],
};

describe("renderInstitutionalProposalToBufferFromProps", () => {
  it(
    "genera el documento institucional A4 completo desde secciones v2",
    async () => {
      const buffer = await renderInstitutionalProposalToBufferFromProps(fixture);

      expect(buffer.subarray(0, 4).toString()).toBe("%PDF");
      expect(buffer.byteLength).toBeGreaterThan(20_000);
      const document = await PDFDocument.load(Uint8Array.from(buffer));
      expect(document.getPageCount()).toBeGreaterThanOrEqual(8);
      expect(document.getTitle()).toBe(
        "Propuesta técnica y económica - Cliente Industrial SpA",
      );
      for (const page of document.getPages()) {
        const { width, height } = page.getSize();
        expect(width).toBeCloseTo(595.28, 0);
        expect(height).toBeCloseTo(841.89, 0);
      }
    },
    30_000,
  );

  it(
    "omite capítulos con cuerpo vacío (no emite páginas solo-título)",
    async () => {
      const withEmpty = {
        ...fixture,
        proposalSections: [
          ...fixture.proposalSections!,
          {
            id: "gantt-empty",
            order: 99,
            title: "Carta Gantt",
            content: "",
          },
          {
            id: "empty-caps",
            order: 100,
            title: "Capacitación",
            content: "   ",
          },
        ],
      };
      const baseline = await renderInstitutionalProposalToBufferFromProps(fixture);
      const withEmpties = await renderInstitutionalProposalToBufferFromProps(withEmpty);
      const baseDoc = await PDFDocument.load(Uint8Array.from(baseline));
      const emptyDoc = await PDFDocument.load(Uint8Array.from(withEmpties));
      // Misma cantidad de páginas: los vacíos no agregan A4
      expect(emptyDoc.getPageCount()).toBe(baseDoc.getPageCount());
    },
    30_000,
  );
});
