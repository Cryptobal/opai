/**
 * SimpleApi Provider — Chilesystems SimpleAPI integration.
 *
 * Implementa la interfaz `DteProviderAdapter` contra el API REST real de
 * SimpleAPI, basado en el SDK oficial:
 *   https://github.com/chilesystems/SimpleSDK
 *
 * Flujo de emisión (3 pasos secuenciales):
 *
 *   1. POST  api.simpleapi.cl/api/v1/dte/generar
 *      → Recibe JSON del DTE + multipart con cert .pfx + CAF .xml
 *      → Devuelve XML del DTE firmado y timbrado (text/xml ISO-8859-1)
 *
 *   2. POST  api.simpleapi.cl/api/v1/envio/generar
 *      → Recibe JSON del sobre + multipart con cert .pfx + DTE.xml del paso 1
 *      → Devuelve XML del sobre listo para enviar al SII
 *
 *   3. POST  api.simpleapi.cl/api/v1/envio/enviar
 *      → Recibe JSON con datos de auth SII + multipart con cert .pfx + sobre.xml
 *      → Devuelve JSON con TrackId asignado por el SII
 *
 * Consultas de estado (1 paso):
 *   - POST  api.simpleapi.cl/api/v1/consulta/envio   (por TrackId)
 *   - POST  api.simpleapi.cl/api/v1/consulta/dte     (por DTE específico)
 *
 * Folios (otro host):
 *   - GET   servicios.simpleapi.cl/api/folios/get/{tipo}    (consultar)
 *
 * NOTA HISTÓRICA: la versión previa de este archivo fue escrita como esqueleto
 * sin probar contra la API real (los endpoints `/dte/generar-y-enviar` y
 * `/dte/pdf` no existen). Esta versión está alineada con el SDK oficial.
 */

import { prisma } from "@/lib/prisma";
import { decryptBuffer, decryptString } from "@/lib/dte-encryption";
import {
  callSimpleApi,
  getSimpleApiKeyOrThrow,
} from "./simpleapi-http";
import type {
  DteProviderAdapter,
  DteIssueRequest,
  DteIssueResponse,
  DteStatusResponse,
  DteVoidRequest,
} from "./dte-provider.adapter";

// ───────────────────────────────────────────────────────────────────
// Tipos internos del provider
// ───────────────────────────────────────────────────────────────────

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
    pfxBuffer: Buffer;
    password: string;
    rutTitular: string;
  };
}

/**
 * RUT del SII — receptor estándar del sobre cuando se envía al SII.
 * Es siempre el mismo para Chile, no depende del tenant.
 */
const RUT_SII = "60803000-K";

/**
 * Cache en memoria de XMLs generados durante un emit. Se usa para que
 * `getXml()` pueda devolver el XML sin tener que regenerarlo (los endpoints
 * `dte/xml` separados NO existen en SimpleAPI). El cache vive solo durante
 * el ciclo de vida del request — Vercel reutiliza la lambda entre requests
 * pero igual conviene persistir el XML en DB vía `xmlUrl` o un blob storage
 * para acceso cross-request. Por ahora usamos data: URLs como fallback.
 */
const xmlMemoryCache = new Map<string, Buffer>(); // key: `${tipo}-${folio}`

// ───────────────────────────────────────────────────────────────────
// Provider
// ───────────────────────────────────────────────────────────────────

export class SimpleApiProvider implements DteProviderAdapter {
  constructor(private readonly tenantId: string) {
    getSimpleApiKeyOrThrow();
  }

  /**
   * Carga config del tenant + certificado (desencriptado en memoria).
   * El material desencriptado NO se loguea ni persiste.
   */
  private async loadTenantContext(): Promise<TenantContext> {
    const [config, cert] = await Promise.all([
      prisma.tenantDteConfig.findUnique({ where: { tenantId: this.tenantId } }),
      prisma.tenantDteCertificate.findUnique({
        where: { tenantId: this.tenantId },
      }),
    ]);

    if (!config) {
      throw new Error(
        `Tenant ${this.tenantId} no tiene TenantDteConfig. Completá los datos en /opai/configuracion/finanzas/dte.`,
      );
    }
    if (!config.emisorRut || !config.emisorRazonSocial) {
      throw new Error(
        "Configuración del emisor incompleta (RUT/Razón Social). Completá los datos en /opai/configuracion/finanzas/dte.",
      );
    }
    if (!cert) {
      throw new Error(
        "No hay certificado digital cargado. Subí un .pfx en /opai/configuracion/finanzas/dte.",
      );
    }
    if (cert.notAfter < new Date()) {
      throw new Error(
        `El certificado digital venció el ${cert.notAfter
          .toISOString()
          .split("T")[0]}. Subí uno vigente.`,
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
        pfxBuffer,
        password,
        rutTitular: cert.rutTitular,
      },
    };
  }

  // ─────────────────────────────────────────────
  // PASO 1: dte/generar — genera XML del DTE
  // ─────────────────────────────────────────────

  /**
   * Construye el payload JSON del DTE en el shape que espera SimpleAPI
   * (basado en JsonConvert.SerializeObject de los modelos C# del SDK,
   * que usa los nombres de propiedades C# como keys del JSON).
   */
  private buildDtePayload(
    request: DteIssueRequest,
    ctx: TenantContext,
  ): Record<string, unknown> {
    const isExenta = request.dteType === 34;
    const isBoleta = request.dteType === 39 || request.dteType === 41;

    const emisor: Record<string, unknown> = {
      Rut: ctx.config.emisorRut,
      DireccionOrigen: ctx.config.emisorDireccion,
      ComunaOrigen: ctx.config.emisorComuna,
      CiudadOrigen: ctx.config.emisorCiudad,
    };
    // Para boletas el campo se llama distinto (RznSocEmisor / GiroEmisor)
    if (isBoleta) {
      emisor.RazonSocialBoleta = ctx.config.emisorRazonSocial;
      emisor.GiroBoleta = ctx.config.emisorGiro;
    } else {
      emisor.RazonSocial = ctx.config.emisorRazonSocial;
      emisor.Giro = ctx.config.emisorGiro;
      emisor.ActividadEconomica = [ctx.config.emisorActeco];
    }
    if (ctx.config.emisorTelefono) {
      emisor.Telefono = [ctx.config.emisorTelefono];
    }
    if (ctx.config.emisorEmail) {
      emisor.CorreoEmisor = ctx.config.emisorEmail;
    }

    const receptor: Record<string, unknown> = {
      Rut: request.receiverRut,
      RazonSocial: request.receiverName,
      // SII rechaza si Giro/Direccion/Comuna van vacíos en facturas (no boletas).
      // Defaults razonables para clientes nuevos sin datos extras.
      Giro: "Sin Giro",
      Direccion: "Sin direccion",
      Comuna: "Santiago",
      Ciudad: "Santiago",
    };
    if (request.receiverEmail) {
      receptor.CorreoRecep = request.receiverEmail;
    }

    const totales: Record<string, unknown> = {
      MontoNeto: request.netAmount,
      MontoExento: request.exemptAmount,
      MontoTotal: request.totalAmount,
    };
    if (!isExenta) {
      totales.TasaIVA = request.taxRate;
      totales.IVA = request.taxAmount;
    }

    const detalles = request.items.map((item) => {
      const detalle: Record<string, unknown> = {
        NumeroLinea: item.lineNumber,
        Nombre: item.itemName,
        Cantidad: item.quantity,
        Precio: item.unitPrice,
        MontoItem: item.netAmount,
      };
      if (item.description) detalle.Descripcion = item.description;
      if (item.unit) detalle.UnidadMedida = item.unit;
      if (item.itemCode) {
        detalle.CodigosItem = [{ TipoCodigo: "INT", VLR: item.itemCode }];
      }
      // IndicadorExento: 1 = exento (segun SII). Solo se setea si el ítem
      // es exento dentro de una factura afecta (mixta).
      if (item.isExempt && !isExenta) {
        detalle.IndicadorExento = 1;
      }
      return detalle;
    });

    const documento: Record<string, unknown> = {
      Id: `T_${Date.now()}`,
      Encabezado: {
        IdentificacionDTE: {
          TipoDTE: request.dteType,
          Folio: request.folio,
          FechaEmisionString: request.date,
        },
        Emisor: emisor,
        Receptor: receptor,
        Totales: totales,
      },
      Detalles: detalles,
    };

    // Bloque <Referencia> obligatorio para tipo 56 (ND) y 61 (NC).
    if (request.reference) {
      documento.Referencias = [
        {
          Numero: 1,
          TipoDocumento: String(request.reference.dteType),
          Folio: String(request.reference.folio),
          FechaReferenciaString: request.reference.date,
          CodigoReferencia: request.reference.code,
          RazonReferencia: request.reference.reason,
        },
      ];
    }

    return {
      Documento: documento,
      Certificado: {
        Rut: ctx.certificate.rutTitular,
        Password: ctx.certificate.password,
      },
    };
  }

  /**
   * Llama a `dte/generar` y devuelve el XML del DTE firmado/timbrado.
   */
  private async generarDteXml(
    request: DteIssueRequest,
    ctx: TenantContext,
  ): Promise<{ ok: true; xml: Buffer } | { ok: false; error: string }> {
    if (!request.cafXml) {
      return {
        ok: false,
        error: "Falta CAF XML en request.cafXml (debe pasarlo el folio-tracker).",
      };
    }

    const payload = this.buildDtePayload(request, ctx);

    const result = await callSimpleApi({
      target: "api",
      path: "dte/generar",
      method: "POST",
      parts: [
        { name: "input", content: JSON.stringify(payload) },
        {
          name: "file",
          content: ctx.certificate.pfxBuffer,
          contentType: "application/x-pkcs12",
          filename: "certificado.pfx",
        },
        {
          name: "file",
          content: request.cafXml,
          contentType: "application/xml",
          filename: "caf.xml",
        },
      ],
    });

    if (!result.ok) {
      return {
        ok: false,
        error: `dte/generar HTTP ${result.status}: ${result.bodyText.slice(0, 500)}`,
      };
    }

    return { ok: true, xml: Buffer.from(result.bodyText, "latin1") };
  }

  // ─────────────────────────────────────────────
  // PASO 2: envio/generar — empaqueta DTE en sobre
  // ─────────────────────────────────────────────

  private buildSobrePayload(
    request: DteIssueRequest,
    ctx: TenantContext,
  ): Record<string, unknown> {
    const ambiente = ctx.config.environment === "PRODUCTION" ? 1 : 0;
    // En cert el SII publica resol estándar. Si el tenant no la setea, usamos
    // default cert: NroResol=0, FchResol=2014-08-22 (set público del SII).
    const numeroResolucion = ctx.config.resolNumero ?? 0;
    const fechaResolucion =
      ctx.config.resolFecha ?? new Date("2014-08-22T00:00:00Z");

    return {
      // Tipo del envío: 0 = Documentos (no boletas)
      Tipo: 0,
      Ambiente: ambiente,
      Caratula: {
        RutEmisor: ctx.config.emisorRut,
        RutReceptor: RUT_SII,
        FechaResolucion: fechaResolucion.toISOString().split("T")[0],
        NumeroResolucion: numeroResolucion,
      },
      Certificado: {
        Rut: ctx.certificate.rutTitular,
        Password: ctx.certificate.password,
      },
    };
  }

  private async generarSobreXml(
    request: DteIssueRequest,
    ctx: TenantContext,
    dteXml: Buffer,
  ): Promise<{ ok: true; xml: Buffer } | { ok: false; error: string }> {
    const payload = this.buildSobrePayload(request, ctx);

    const result = await callSimpleApi({
      target: "api",
      path: "envio/generar",
      method: "POST",
      parts: [
        { name: "input", content: JSON.stringify(payload) },
        {
          name: "file",
          content: ctx.certificate.pfxBuffer,
          contentType: "application/x-pkcs12",
          filename: "certificado.pfx",
        },
        {
          name: "file",
          content: dteXml,
          contentType: "application/xml",
          filename: `dte_${request.dteType}_${request.folio}.xml`,
        },
      ],
    });

    if (!result.ok) {
      return {
        ok: false,
        error: `envio/generar HTTP ${result.status}: ${result.bodyText.slice(0, 500)}`,
      };
    }

    return { ok: true, xml: Buffer.from(result.bodyText, "latin1") };
  }

  // ─────────────────────────────────────────────
  // PASO 3: envio/enviar — manda sobre al SII
  // ─────────────────────────────────────────────

  private async enviarSobreSii(
    request: DteIssueRequest,
    ctx: TenantContext,
    sobreXml: Buffer,
  ): Promise<
    { ok: true; trackId: string } | { ok: false; error: string }
  > {
    const ambiente = ctx.config.environment === "PRODUCTION" ? 1 : 0;
    const payload = {
      Tipo: 0, // Documentos (no boletas)
      Ambiente: ambiente,
      Certificado: {
        Rut: ctx.certificate.rutTitular,
        Password: ctx.certificate.password,
      },
    };

    const result = await callSimpleApi({
      target: "api",
      path: "envio/enviar",
      method: "POST",
      parts: [
        { name: "input", content: JSON.stringify(payload) },
        {
          name: "file",
          content: ctx.certificate.pfxBuffer,
          contentType: "application/x-pkcs12",
          filename: "certificado.pfx",
        },
        {
          name: "file",
          content: sobreXml,
          contentType: "application/xml",
          filename: `envio_${request.dteType}_${request.folio}.xml`,
        },
      ],
    });

    if (!result.ok) {
      return {
        ok: false,
        error: `envio/enviar HTTP ${result.status}: ${result.bodyText.slice(0, 500)}`,
      };
    }

    // El response es JSON con shape EnvioResult. TrackId puede venir como
    // número o string según versión de SimpleAPI.
    const json = result.bodyJson as
      | { TrackId?: number | string; trackId?: number | string; Estado?: string; ResponseXml?: string }
      | null;

    const trackId = json?.TrackId ?? json?.trackId;
    if (trackId === undefined || trackId === null || trackId === "" || trackId === 0) {
      return {
        ok: false,
        error: `envio/enviar OK pero sin TrackId. Estado: ${json?.Estado ?? "desconocido"}. Response: ${result.bodyText.slice(0, 300)}`,
      };
    }

    return { ok: true, trackId: String(trackId) };
  }

  // ─────────────────────────────────────────────
  // PUBLIC: issue — orquesta los 3 pasos
  // ─────────────────────────────────────────────

  async issue(request: DteIssueRequest): Promise<DteIssueResponse> {
    if (!request.folio) {
      return {
        success: false,
        error:
          "SimpleApiProvider requiere folio pre-asignado por el folio-tracker. Llamá reserveNextFolio() antes.",
      };
    }

    let ctx: TenantContext;
    try {
      ctx = await this.loadTenantContext();
    } catch (err) {
      return {
        success: false,
        error: err instanceof Error ? err.message : "Error cargando contexto del tenant",
      };
    }

    // PASO 1
    const dteResult = await this.generarDteXml(request, ctx);
    if (!dteResult.ok) {
      return { success: false, error: dteResult.error };
    }

    // Cache del XML para que getXml() lo pueda servir sin regenerar
    xmlMemoryCache.set(`${request.dteType}-${request.folio}`, dteResult.xml);

    // PASO 2
    const sobreResult = await this.generarSobreXml(request, ctx, dteResult.xml);
    if (!sobreResult.ok) {
      return { success: false, error: sobreResult.error };
    }

    // PASO 3
    const sendResult = await this.enviarSobreSii(request, ctx, sobreResult.xml);
    if (!sendResult.ok) {
      return { success: false, error: sendResult.error };
    }

    return {
      success: true,
      trackId: sendResult.trackId,
      folio: request.folio,
      pdfUrl: undefined,
      xmlUrl: undefined,
      rawResponse: { dteXmlBytes: dteResult.xml.length },
    };
  }

  // ─────────────────────────────────────────────
  // getStatus — consulta estado del envío al SII
  // ─────────────────────────────────────────────

  async getStatus(trackId: string): Promise<DteStatusResponse> {
    let ctx: TenantContext;
    try {
      ctx = await this.loadTenantContext();
    } catch (err) {
      return {
        status: "PENDING",
        trackId,
        message: err instanceof Error ? err.message : "Error cargando contexto",
      };
    }

    const ambiente = ctx.config.environment === "PRODUCTION" ? 1 : 0;
    const payload = {
      RutEmpresa: ctx.config.emisorRut,
      TrackId: Number(trackId),
      Ambiente: ambiente,
      Certificado: {
        Rut: ctx.certificate.rutTitular,
        Password: ctx.certificate.password,
      },
    };

    try {
      const result = await callSimpleApi({
        target: "api",
        path: "consulta/envio",
        method: "POST",
        parts: [
          { name: "input", content: JSON.stringify(payload) },
          {
            name: "file",
            content: ctx.certificate.pfxBuffer,
            contentType: "application/x-pkcs12",
            filename: "certificado.pfx",
          },
        ],
      });

      if (!result.ok) {
        return {
          status: "PENDING",
          trackId,
          message: `consulta/envio HTTP ${result.status}: ${result.bodyText.slice(0, 200)}`,
        };
      }

      const json = result.bodyJson as
        | { Estado?: string; estado?: string; ResponseXml?: string }
        | null;
      const rawEstado = json?.Estado ?? json?.estado ?? "";
      const status = mapSiiStatus(rawEstado);

      return {
        status,
        trackId,
        message: rawEstado || undefined,
        rawResponse: json ?? result.bodyText,
      };
    } catch (err) {
      return {
        status: "PENDING",
        trackId,
        message: err instanceof Error ? err.message : "Error consultando estado",
      };
    }
  }

  // ─────────────────────────────────────────────
  // void — Chile no anula DTE, se emite NC tipo 61
  // ─────────────────────────────────────────────

  async void(_request: DteVoidRequest): Promise<DteIssueResponse> {
    return {
      success: false,
      error:
        "Anulación directa no soportada por SII. Emitir Nota de Crédito tipo 61 referenciando el DTE original.",
    };
  }

  // ─────────────────────────────────────────────
  // getXml — retorna el XML del DTE generado en issue()
  // ─────────────────────────────────────────────

  async getXml(dteType: number, folio: number): Promise<Buffer> {
    const key = `${dteType}-${folio}`;
    const cached = xmlMemoryCache.get(key);
    if (cached) return cached;

    // Si no está en cache (lambda nueva o cleanup), informamos que el XML
    // debería estar persistido en blob storage. Por ahora retornamos un
    // mensaje stub indicando la limitación.
    throw new Error(
      `XML del DTE ${dteType}-${folio} no está en cache de memoria del provider. ` +
        `SimpleAPI no expone endpoints para re-descargar XMLs ya emitidos. ` +
        `TODO: persistir el XML en R2/Blob storage al emitir.`,
    );
  }

  // ─────────────────────────────────────────────
  // getPdf — generación de PDF a partir del XML
  // ─────────────────────────────────────────────

  async getPdf(dteType: number, folio: number): Promise<Buffer> {
    // SimpleAPI no expone un endpoint `dte/pdf` directo. Para generar el
    // PDF hay que: (1) reconstruir el XML, (2) llamar a `pdf/generar` con
    // el XML como input. Eso lo dejamos para una sesión futura — por ahora
    // tiramos error claro para que el caller lo maneje.
    throw new Error(
      `Generación de PDF para DTE ${dteType}-${folio} no implementada todavía. ` +
        `SimpleAPI requiere un flujo separado pdf/generar que aún no está cableado en OPAI.`,
    );
  }
}

// ───────────────────────────────────────────────────────────────────
// Helpers
// ───────────────────────────────────────────────────────────────────

function mapSiiStatus(raw: unknown): DteStatusResponse["status"] {
  if (typeof raw !== "string") return "PENDING";
  const r = raw.toUpperCase();
  if (r.includes("ACEPT")) return "ACCEPTED";
  if (r.includes("RECHAZ") || r === "RFR" || r === "REJ") return "REJECTED";
  if (r.includes("REPAR") || r === "RAP" || r === "RFP") return "WITH_OBJECTIONS";
  if (r.includes("ANUL") || r === "ANC") return "ANNULLED";
  if (r.includes("ENV") || r === "EPR") return "SENT";
  return "PENDING";
}
