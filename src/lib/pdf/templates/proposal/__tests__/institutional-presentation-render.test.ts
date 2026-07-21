// @vitest-environment node

import { describe, expect, it } from "vitest";
import { PDFDocument } from "pdf-lib";
import type { ProposalProps } from "../build-proposal-props";
import { renderInstitutionalPresentationToBufferFromProps } from "../render-institutional-presentation";

const fixture: ProposalProps & { portalUrl?: string } = {
  variant: "institutional",
  companyName: "Empresa de Prueba",
  quotationCode: "",
  proposalDate: "21-07-2026",
  contactName: "Contacto de Prueba",
  contactPosition: "Gerencia de Operaciones",
  portalUrl: "https://example.com/portal/cliente?section=presentacion",
  ai: {
    descripcionBreve:
      "Operación logística con requerimientos críticos de acceso y trazabilidad.",
    resumenEjecutivo:
      "La continuidad operacional exige saber quién accede, qué ocurre en cada punto crítico y cómo se responde ante una desviación.\nNuestro modelo integra personal capacitado, supervisión y la plataforma OPAI para documentar la operación en tiempo real.",
    analisisNecesidades:
      "Los principales riesgos son los accesos no autorizados, la falta de evidencia y los tiempos de respuesta poco claros.\nGard convierte esos riesgos en protocolos verificables, responsables definidos y reportabilidad para el cliente.",
    sectoresRelevantes: [
      "Logística y Bodegas",
      "Manufactura e Industria",
      "Corporativo/Oficinas",
    ],
  },
  serviceType: "Servicio de seguridad integral",
  installationName: "-",
  installationAddress: "-",
  coverageSchedule: "",
  staffingCount: 0,
  staffingRegime: "",
  supervisionFrequency: "",
  items: [],
  totalNeto: 0,
  totalNetoFormatted: "",
  currency: "CLP",
  paymentTerms: "",
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
    phone: "+56 9 6872 7644",
    email: "comercial@gard.cl",
  },
  clientLogosWithNames: [],
  companyStats: {
    yearsInOperation: "",
    activeGuards: "",
    protectedFacilities: "",
    regionsCount: "",
  },
  proposalMetrics: [],
  regimeExplanation: "",
  includedItems: [],
};

describe("renderInstitutionalPresentationToBufferFromProps", () => {
  it(
    "genera un deck PDF 16:9 de dieciséis páginas",
    async () => {
      const buffer =
        await renderInstitutionalPresentationToBufferFromProps(fixture);

      expect(buffer.subarray(0, 4).toString()).toBe("%PDF");
      expect(buffer.byteLength).toBeGreaterThan(100_000);

      // En jsdom, Buffer y Uint8Array viven en realms distintos; convertir
      // explícitamente evita que pdf-lib rechace el Buffer aunque sea válido.
      const document = await PDFDocument.load(Uint8Array.from(buffer));
      expect(document.getPageCount()).toBe(16);
      expect(document.getTitle()).toBe(
        "Presentación comercial - Empresa de Prueba",
      );

      for (const [index, page] of document.getPages().entries()) {
        const { width, height } = page.getSize();
        expect(width, `ancho de página ${index + 1}`).toBeCloseTo(960, 0);
        expect(height, `alto de página ${index + 1}`).toBeCloseTo(540, 0);
        expect(width / height, `proporción de página ${index + 1}`).toBeCloseTo(
          16 / 9,
          2,
        );
      }
    },
    30_000,
  );
});
