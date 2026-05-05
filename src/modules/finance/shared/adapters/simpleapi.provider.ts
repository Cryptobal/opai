/**
 * SimpleApi Provider — Chilesystems SimpleAPI integration.
 *
 * Auth: header "Authorization: ApiKey" (single API key for all OPAI tenants)
 * Per-request: certificate (.pfx) + password + CAF XML are sent base64-encoded.
 *
 * SimpleAPI is multi-RUT: a single API key can be used for multiple emisor RUTs.
 *
 * Docs: https://documentacion.simpleapi.cl/
 *
 * NOTA: la estructura exacta del payload (`/dte/generar-y-enviar`, nombres de
 * campos como `Certificado.Pfx`, etc.) DEBE validarse manualmente contra la doc
 * Postman de SimpleAPI durante la prueba con la API Key gratuita. El esqueleto
 * está basado en el modelo SII estándar pero los wrappers de SimpleAPI pueden
 * tener variaciones menores. Documentar cualquier ajuste necesario aquí.
 */

import { prisma } from "@/lib/prisma";
import { decryptBuffer, decryptString } from "@/lib/dte-encryption";
import type {
  DteProviderAdapter,
  DteIssueRequest,
  DteIssueResponse,
  DteStatusResponse,
  DteVoidRequest,
} from "./dte-provider.adapter";

const BASE_URL = process.env.SIMPLEAPI_BASE_URL ?? "https://api.simpleapi.cl";
const API_KEY = process.env.SIMPLEAPI_KEY ?? "";

interface TenantContext {
  config: {
    environment: "CERTIFICATION" | "PRODUCTION";
    emisorRut: string;
    emisorRazonSocial: string;
    emisorGiro: string;
    emisorActeco: number;
    emisorDireccion: string;
    emisorComuna: string;
    emisorCiudad: string;
    emisorTelefono: string | null;
    emisorEmail: string | null;
    resolNumero: number | null;
    resolFecha: Date | null;
  };
  certificate: {
    pfxBase64: string;
    password: string;
  };
}

export class SimpleApiProvider implements DteProviderAdapter {
  constructor(private readonly tenantId: string) {
    if (!API_KEY) {
      throw new Error(
        "SIMPLEAPI_KEY env var is required for SimpleApiProvider"
      );
    }
  }

  /**
   * Loads tenant config + certificate (decrypted in memory only).
   * The decrypted material MUST NOT be logged or persisted.
   */
  private async loadTenantContext(): Promise<TenantContext> {
    const [config, cert] = await Promise.all([
      prisma.tenantDteConfig.findUnique({ where: { tenantId: this.tenantId } }),
      prisma.tenantDteCertificate.findUnique({
        where: { tenantId: this.tenantId },
      }),
    ]);

    if (!config) {
      throw new Error(`Tenant ${this.tenantId} no tiene TenantDteConfig.`);
    }
    if (!config.emisorRut || !config.emisorRazonSocial) {
      throw new Error(
        "Configuración del emisor incompleta. Completa los datos en /opai/configuracion/finanzas/dte."
      );
    }
    if (!cert) {
      throw new Error(
        "No hay certificado digital cargado para este tenant. Sube un .pfx en /opai/configuracion/finanzas/dte."
      );
    }
    if (cert.notAfter < new Date()) {
      throw new Error(
        `El certificado digital venció el ${cert.notAfter.toISOString().split("T")[0]}. Sube uno nuevo.`
      );
    }

    const pfxBuffer = decryptBuffer(Buffer.from(cert.pfxDataEnc));
    const password = decryptString(cert.passwordEnc);

    return {
      config: {
        environment: config.environment as "CERTIFICATION" | "PRODUCTION",
        emisorRut: config.emisorRut,
        emisorRazonSocial: config.emisorRazonSocial,
        emisorGiro: config.emisorGiro ?? "",
        emisorActeco: config.emisorActeco ?? 0,
        emisorDireccion: config.emisorDireccion ?? "",
        emisorComuna: config.emisorComuna ?? "",
        emisorCiudad: config.emisorCiudad ?? "",
        emisorTelefono: config.emisorTelefono,
        emisorEmail: config.emisorEmail,
        resolNumero: config.resolNumero,
        resolFecha: config.resolFecha,
      },
      certificate: {
        pfxBase64: pfxBuffer.toString("base64"),
        password,
      },
    };
  }

  async issue(request: DteIssueRequest): Promise<DteIssueResponse> {
    if (!request.folio) {
      return {
        success: false,
        error:
          "SimpleApiProvider requiere folio pre-asignado por el folio-tracker. Llama reserveNextFolio() antes.",
      };
    }

    const ctx = await this.loadTenantContext();

    // Caller is expected to pass cafXml via request.cafXml after reserving folio.
    const cafXml = request.cafXml;
    if (!cafXml) {
      return {
        success: false,
        error: "SimpleApiProvider requires CAF XML in request.cafXml",
      };
    }

    const ambiente = ctx.config.environment === "PRODUCTION" ? 1 : 0;

    // Build SimpleAPI DTE payload (estructura del SII).
    // NOTE: la estructura exacta del request body de /dte/generar puede tener
    // variaciones. Validar contra Postman doc (documentacion.simpleapi.cl) y
    // ajustar nombres de campos durante prueba con API Key gratuita.
    const payload = {
      Documento: {
        Encabezado: {
          IdDoc: {
            TipoDTE: request.dteType,
            Folio: request.folio,
            FchEmis: request.date,
          },
          Emisor: {
            RUTEmisor: ctx.config.emisorRut,
            RznSoc: ctx.config.emisorRazonSocial,
            GiroEmis: ctx.config.emisorGiro,
            Acteco: ctx.config.emisorActeco,
            DirOrigen: ctx.config.emisorDireccion,
            CmnaOrigen: ctx.config.emisorComuna,
            CiudadOrigen: ctx.config.emisorCiudad,
          },
          Receptor: {
            RUTRecep: request.receiverRut,
            RznSocRecep: request.receiverName,
            CorreoRecep: request.receiverEmail,
            DirRecep: "Sin direccion",
            CmnaRecep: "Santiago",
            CiudadRecep: "Santiago",
          },
          Totales: {
            MntNeto: request.netAmount,
            MntExe: request.exemptAmount,
            TasaIVA: request.taxRate,
            IVA: request.taxAmount,
            MntTotal: request.totalAmount,
          },
        },
        Detalle: request.items.map((it, idx) => ({
          NroLinDet: idx + 1,
          NmbItem: it.itemName,
          DscItem: it.description,
          QtyItem: it.quantity,
          UnmdItem: it.unit ?? "un",
          PrcItem: it.unitPrice,
          MontoItem: it.netAmount,
          IndExe: it.isExempt ? 1 : undefined,
        })),
      },
      Caf: cafXml.toString("base64"),
      Certificado: {
        Pfx: ctx.certificate.pfxBase64,
        Password: ctx.certificate.password,
      },
      Ambiente: ambiente,
    };

    try {
      const res = await fetch(`${BASE_URL}/dte/generar-y-enviar`, {
        method: "POST",
        headers: {
          Authorization: API_KEY,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
      });
      const body = await res.json();
      if (!res.ok || body?.status !== 200) {
        return {
          success: false,
          error: body?.message ?? `HTTP ${res.status}`,
          rawResponse: body,
        };
      }
      return {
        success: true,
        trackId: body?.data?.trackId ?? body?.data?.TrackId ?? undefined,
        folio: request.folio,
        pdfUrl: body?.data?.pdfUrl ?? undefined,
        xmlUrl: body?.data?.xmlUrl ?? undefined,
        rawResponse: body,
      };
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Error de red SimpleAPI";
      return { success: false, error: msg };
    }
  }

  async getStatus(trackId: string): Promise<DteStatusResponse> {
    const ctx = await this.loadTenantContext();
    try {
      const res = await fetch(`${BASE_URL}/dte/estado-envio`, {
        method: "POST",
        headers: { Authorization: API_KEY, "Content-Type": "application/json" },
        body: JSON.stringify({
          TrackId: trackId,
          RutEmisor: ctx.config.emisorRut,
          Ambiente: ctx.config.environment === "PRODUCTION" ? 1 : 0,
          Certificado: {
            Pfx: ctx.certificate.pfxBase64,
            Password: ctx.certificate.password,
          },
        }),
      });
      const body = await res.json();
      const status = mapSiiStatus(body?.data?.estado ?? body?.data?.Estado);
      return { status, trackId, rawResponse: body };
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Error consultando estado";
      return { status: "PENDING", trackId, message: msg };
    }
  }

  async void(_request: DteVoidRequest): Promise<DteIssueResponse> {
    // En Chile no se anulan DTE directamente; se emite Nota de Crédito tipo 61.
    // Este método queda como no-op para mantener compatibilidad con la interfaz.
    return {
      success: false,
      error:
        "Anulación directa no soportada por SII. Emite una Nota de Crédito tipo 61.",
    };
  }

  async getPdf(dteType: number, folio: number): Promise<Buffer> {
    const ctx = await this.loadTenantContext();
    const res = await fetch(`${BASE_URL}/dte/pdf`, {
      method: "POST",
      headers: { Authorization: API_KEY, "Content-Type": "application/json" },
      body: JSON.stringify({
        RutEmisor: ctx.config.emisorRut,
        TipoDTE: dteType,
        Folio: folio,
        Ambiente: ctx.config.environment === "PRODUCTION" ? 1 : 0,
        Certificado: {
          Pfx: ctx.certificate.pfxBase64,
          Password: ctx.certificate.password,
        },
      }),
    });
    if (!res.ok) {
      throw new Error(`PDF download failed: HTTP ${res.status}`);
    }
    const arrayBuffer = await res.arrayBuffer();
    return Buffer.from(arrayBuffer);
  }

  async getXml(dteType: number, folio: number): Promise<Buffer> {
    const ctx = await this.loadTenantContext();
    const res = await fetch(`${BASE_URL}/dte/xml`, {
      method: "POST",
      headers: { Authorization: API_KEY, "Content-Type": "application/json" },
      body: JSON.stringify({
        RutEmisor: ctx.config.emisorRut,
        TipoDTE: dteType,
        Folio: folio,
        Ambiente: ctx.config.environment === "PRODUCTION" ? 1 : 0,
        Certificado: {
          Pfx: ctx.certificate.pfxBase64,
          Password: ctx.certificate.password,
        },
      }),
    });
    if (!res.ok) {
      throw new Error(`XML download failed: HTTP ${res.status}`);
    }
    const arrayBuffer = await res.arrayBuffer();
    return Buffer.from(arrayBuffer);
  }
}

function mapSiiStatus(raw: unknown): DteStatusResponse["status"] {
  if (typeof raw !== "string") return "PENDING";
  const r = raw.toUpperCase();
  if (r.includes("ACEPT")) return "ACCEPTED";
  if (r.includes("RECHAZ")) return "REJECTED";
  if (r.includes("REPAR")) return "WITH_OBJECTIONS";
  if (r.includes("ANUL")) return "ANNULLED";
  if (r.includes("ENV")) return "SENT";
  return "PENDING";
}
