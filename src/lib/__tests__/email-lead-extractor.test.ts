/**
 * Tests para el extractor de leads desde emails.
 * Valida: detección de basura, reenvíos, respuestas citadas, y extracción con IA (mockeada).
 * @vitest-environment node
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  detectForwardInBody,
  isGarbageEmail,
  parseFromHeader,
  extractLeadFromEmail,
  type ExtractedLeadData,
} from "@/lib/email-lead-extractor";

// Mock OpenAI antes de importar el módulo
vi.mock("@/lib/openai", () => ({
  openai: {
    chat: {
      completions: {
        create: vi.fn(),
      },
    },
  },
}));

// Importar después del mock para que use el mock
const { openai } = await import("@/lib/openai");

const mockCreate = vi.mocked(openai.chat.completions.create);

describe("email-lead-extractor", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // -------------------------------------------------------------------------
  // parseFromHeader
  // -------------------------------------------------------------------------
  describe("parseFromHeader", () => {
    it('parsea "Nombre <email@domain.com>"', () => {
      expect(parseFromHeader("Jaime Muñoz <jomunozb@sice.com>")).toEqual({
        name: "Jaime Muñoz",
        email: "jomunozb@sice.com",
      });
    });

    it('parsea solo email "email@domain.com"', () => {
      expect(parseFromHeader("jomunozb@sice.com")).toEqual({
        name: null,
        email: "jomunozb@sice.com",
      });
    });

    it('parsea "Carlos Irigoyen Garcés <carlos.irigoyen@gard.cl>"', () => {
      expect(parseFromHeader("Carlos Irigoyen Garcés <carlos.irigoyen@gard.cl>")).toEqual({
        name: "Carlos Irigoyen Garcés",
        email: "carlos.irigoyen@gard.cl",
      });
    });
  });

  // -------------------------------------------------------------------------
  // isGarbageEmail
  // -------------------------------------------------------------------------
  describe("isGarbageEmail", () => {
    it("rechaza contenido con 1Password", () => {
      expect(
        isGarbageEmail({
          textBody: "angelica.bruna@polpaicosoluciones.cl. Pulsa el tabulador. El menú de 1Password está disponible.",
        })
      ).toBe(true);
    });

    it("rechaza contenido con Press tab (inglés)", () => {
      expect(
        isGarbageEmail({
          textBody: "test@example.com. Press the tab to insert. Press the arrow to select.",
        })
      ).toBe(true);
    });

    it("acepta correo legítimo de solicitud", () => {
      const body = `Buenas tardes,

Necesito que nos cotice servicio de vigilancia para 2 direcciones.
Razón Social: SICE AGENCIA CHILE S.A
RUT: 59.090.630-1
Contacto: Jaime Muñoz Burgos, jomunozb@sice.com`;
      expect(isGarbageEmail({ textBody: body })).toBe(false);
    });

    it("rechaza cuerpo vacío", () => {
      expect(isGarbageEmail({ textBody: "", htmlBody: null })).toBe(true);
    });

    it("rechaza cuerpo muy corto sin sustancia", () => {
      expect(isGarbageEmail({ textBody: "ok" })).toBe(true);
    });
  });

  // -------------------------------------------------------------------------
  // detectForwardInBody
  // -------------------------------------------------------------------------
  describe("detectForwardInBody", () => {
    it("detecta Gmail forward en inglés", () => {
      const body = `---------- Forwarded message ----------
From: Jaime Muñoz <jomunozb@sice.com>
Date: Wed, Mar 12, 2025
Subject: Cotización

Buenas tardes, necesito cotización.`;
      expect(detectForwardInBody(body)).toBe(true);
    });

    it("detecta Gmail forward en español", () => {
      const body = `---------- Mensaje reenviado ----------
De: Jaime Muñoz <jomunozb@sice.com>
Asunto: Cotización

Buenas tardes.`;
      expect(detectForwardInBody(body)).toBe(true);
    });

    it("detecta Outlook Original Message", () => {
      const body = `-----Original Message-----
From: Jaime Muñoz
Sent: Wednesday, March 12, 2025
To: comercial@gard.cl
Subject: Cotización

Buenas tardes.`;
      expect(detectForwardInBody(body)).toBe(true);
    });

    it("no detecta forward en texto simple", () => {
      expect(detectForwardInBody("Buenas tardes, necesito cotización.")).toBe(false);
    });
  });

  // -------------------------------------------------------------------------
  // extractLeadFromEmail (con OpenAI mockeado)
  // -------------------------------------------------------------------------
  describe("extractLeadFromEmail", () => {
    const SICE_MOCK_RESPONSE: ExtractedLeadData = {
      companyName: "SICE AGENCIA CHILE S.A",
      rut: "59.090.630-1",
      legalName: "SICE AGENCIA CHILE S.A",
      businessActivity: "Otros servicios de telecomunicaciones",
      legalRepresentativeName: null,
      contactFirstName: "Jaime",
      contactLastName: "Muñoz Burgos",
      contactEmail: "jomunozb@sice.com",
      contactPhone: "+56 9 6237 3606",
      contactRole: "Adquisiciones",
      address: "Dardignac #160",
      city: "Santiago",
      commune: "Recoleta",
      serviceType: "Guardias de seguridad 24/7",
      serviceDuration: "indefinido",
      coverageDetails: "24/7, 1 guardia por turno, 4 guardias totales",
      guardsPerShift: "1",
      numberOfLocations: "2",
      startDate: "inmediato",
      summary:
        "SICE solicita cotización de vigilancia para 2 direcciones (Dardignac 160 Recoleta, Brisas del Maipo 0127 La Cisterna). Servicio 24/7, 1 guardia por turno, 4 guardias totales.",
      industry: "telecomunicaciones",
      website: "https://www.sice.com",
    };

    it("extrae datos del cliente cuando hay forward (remitente interno)", async () => {
      mockCreate.mockResolvedValue({
        id: "test",
        choices: [
          {
            index: 0,
            message: {
              role: "assistant",
              content: JSON.stringify(SICE_MOCK_RESPONSE),
            },
            finish_reason: "stop",
          },
        ],
        created: 0,
        model: "",
        object: "chat.completion",
      } as any);

      const forwardBody = `---------- Forwarded message ----------
From: Muñoz Burgos, Jaime Orlando <jomunozb@sice.com>
Date: Wed, Mar 12, 2025 at 1:06 PM
Subject: Cotización vigilancia
To: comercial@gard.cl

Buenas tardes,

Necesito que nos cotice servicio de vigilancia.
Son 2 direcciones:
Dardignac 160 – Recoleta
Brisas del Maipo 0127 – La Cisterna

Considerar servicio 24/7, 1 guardia por turno, 4 guardias.

Datos de la Empresa:
Razón Social: SICE AGENCIA CHILE S.A
Rut: 59.090.630-1
Giro: Otros servicios de telecomunicaciones
Dirección Comercial: Dardignac #160, Recoleta-Santiago de Chile.

Jaime Muñoz Burgos
Adquisiciones
SICE AGENCIA CHILE S.A.
Contact: (+56) 9 6237 3606
E-mail: jomunozb@sice.com | www.sice.com`;

      const result = await extractLeadFromEmail({
        subject: "Fwd: Cotización vigilancia",
        textBody: forwardBody,
        fromEmail: "Carlos Irigoyen <carlos.irigoyen@gard.cl>",
        ownDomain: "gard.cl",
        ownCompanyName: "Gard Security",
      });

      expect(result.companyName).toBe("SICE AGENCIA CHILE S.A");
      expect(result.contactFirstName).toBe("Jaime");
      expect(result.contactLastName).toBe("Muñoz Burgos");
      expect(result.contactEmail).toBe("jomunozb@sice.com");
      expect(result.rut).toBe("59.090.630-1");
      expect(result.guardsPerShift).toBe("1");
      expect(result.numberOfLocations).toBe("2");
      expect(result.summary).toContain("SICE");
      expect(mockCreate).toHaveBeenCalledTimes(1);
    });

    it("extrae del bloque citado cuando es reply (On ... wrote)", async () => {
      mockCreate.mockResolvedValue({
        id: "test",
        choices: [
          {
            index: 0,
            message: {
              role: "assistant",
              content: JSON.stringify(SICE_MOCK_RESPONSE),
            },
            finish_reason: "stop",
          },
        ],
        created: 0,
        model: "",
        object: "chat.completion",
      } as any);

      const replyBody = `Cordialmente,

Carlos Irigoyen Garcés
Director Administración y Finanzas
+56 9 6872 7644
www.gard.cl

On Wed, Mar 12, 2025 at 1:06 PM Muñoz Burgos, Jaime Orlando <jomunozb@sice.com> wrote:
> Buenas tardes,
>
> Necesito que nos cotice servicio de vigilancia.
> Son 2 direcciones: Dardignac 160 – Recoleta, Brisas del Maipo 0127 – La Cisterna.
> Considerar servicio 24/7, 1 guardia por turno, 4 guardias.
>
> Razón Social: SICE AGENCIA CHILE S.A
> Rut: 59.090.630-1
> Contacto: Jaime Muñoz Burgos, jomunozb@sice.com`;

      const result = await extractLeadFromEmail({
        subject: "Re: Cotización vigilancia",
        textBody: replyBody,
        fromEmail: "Carlos Irigoyen <carlos.irigoyen@gard.cl>",
        ownDomain: "gard.cl",
        ownCompanyName: "Gard Security",
      });

      expect(result.companyName).toBe("SICE AGENCIA CHILE S.A");
      expect(result.contactEmail).toBe("jomunozb@sice.com");
      expect(mockCreate).toHaveBeenCalledTimes(1);
      const sentContent = (mockCreate.mock.calls[0][0] as any).messages[1].content;
      expect(sentContent).toContain("SICE");
      expect(sentContent).toContain("jomunozb@sice.com");
      expect(sentContent).not.toContain("Carlos Irigoyen");
    });
  });
});
