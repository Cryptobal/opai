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
  type SimpleApiAuth,
} from "./simpleapi-http";
import type {
  DteProviderAdapter,
  DteIssueRequest,
  DteIssueResponse,
  DteStatusResponse,
  DteVoidRequest,
} from "./dte-provider.adapter";

/**
 * Overrides inyectados por el factory desde PlatformDteProvider.
 * Si la apiKey o baseUrl viene NULL, el helper HTTP cae en env var.
 */
export interface SimpleApiOverrides {
  apiKey: string | null;
  baseUrl: string | null;
}

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
 * Cache en memoria de XMLs generados durante un emit. Se usa como fallback
 * dentro del mismo request si la persistencia en BD no está disponible.
 * En el flujo normal el XML se persiste en `FinanceDte.dteXml` durante issue(),
 * y se lee desde ahí en getPdf()/getXml() — esto da acceso cross-request.
 */
const xmlMemoryCache = new Map<string, Buffer>(); // key: `${tipo}-${folio}`

// ───────────────────────────────────────────────────────────────────
// Provider
// ───────────────────────────────────────────────────────────────────

export class SimpleApiProvider implements DteProviderAdapter {
  /** Auth/baseUrl resueltos desde PlatformDteProvider (o env fallback). */
  private readonly auth: SimpleApiAuth;

  constructor(
    private readonly tenantId: string,
    overrides?: SimpleApiOverrides,
  ) {
    this.auth = {
      apiKey: overrides?.apiKey ?? null,
      baseUrl: overrides?.baseUrl ?? null,
    };
    // Validación temprana: revienta si NO hay apiKey ni en platform ni en env.
    getSimpleApiKeyOrThrow(this.auth);
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

    // Bloque <Referencia>:
    //   1. Referencia principal (obligatoria para 56/61, opcional otras)
    //   2. Referencias adicionales (OC, HES, Contrato, etc.)
    // SimpleAPI usa nombres distintos en JSON vs los usados en XML:
    //   - "TipoDocumento" → <TpoDocRef>
    //   - "FolioReferencia" → <FolioRef>
    //   - "FechaDocumentoReferenciaString" → <FchRef>
    //   - "CodigoReferencia" → <CodRef>
    //   - "RazonReferencia" → <RazonRef>
    const refs: Array<Record<string, unknown>> = [];
    if (request.reference) {
      refs.push({
        Numero: refs.length + 1,
        TipoDocumento: String(request.reference.dteType),
        FolioReferencia: String(request.reference.folio),
        FechaDocumentoReferenciaString: request.reference.date,
        CodigoReferencia: request.reference.code,
        RazonReferencia: request.reference.reason,
      });
    }
    if (request.additionalReferences && request.additionalReferences.length > 0) {
      for (const r of request.additionalReferences) {
        if (refs.length >= 40) break; // tope SII
        refs.push({
          Numero: refs.length + 1,
          TipoDocumento: r.tipoDocRef,
          FolioReferencia: r.folioRef,
          FechaDocumentoReferenciaString: r.fchRef,
          RazonReferencia: r.razonRef,
        });
      }
    }
    if (refs.length > 0) {
      documento.Referencias = refs;
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
      auth: this.auth,
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
      auth: this.auth,
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
      auth: this.auth,
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
      // Exponemos el XML firmado para que el issuer lo persista en BD.
      // Con eso, getPdf()/getXml() pueden servir el documento cross-request
      // sin re-emitir contra el SII.
      signedXml: dteResult.xml,
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
        auth: this.auth,
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
  // getXml — retorna el XML firmado del DTE
  // ─────────────────────────────────────────────

  /**
   * Estrategia: primero buscar en BD (FinanceDte.dteXml), luego en cache
   * de memoria (mismo request), por último error claro.
   * SimpleAPI no expone endpoint para re-descargar XMLs históricos del SII.
   */
  async getXml(dteType: number, folio: number): Promise<Buffer> {
    const dte = await prisma.financeDte.findFirst({
      where: { tenantId: this.tenantId, direction: "ISSUED", dteType, folio },
      select: { dteXml: true },
    });
    if (dte?.dteXml && dte.dteXml.length > 0) {
      return Buffer.from(dte.dteXml);
    }

    const cached = xmlMemoryCache.get(`${dteType}-${folio}`);
    if (cached) return cached;

    throw new Error(
      `XML del DTE ${dteType}-${folio} no está disponible. Solo se puede acceder al XML de DTEs emitidos por OPAI tras el refactor del provider; DTEs históricos no tienen el XML persistido y SimpleAPI no expone re-descarga.`,
    );
  }

  // ─────────────────────────────────────────────
  // getPdf — genera PDF impreso del DTE vía SimpleAPI
  // ─────────────────────────────────────────────

  /**
   * Llama al endpoint `impresion/pdf/carta/v2` de SimpleAPI con el XML
   * del DTE + datos extra (resolución SII, logo del emisor). Devuelve el
   * PDF como Buffer listo para descargar.
   */
  async getPdf(dteType: number, folio: number): Promise<Buffer> {
    // 1. Recuperar XML del DTE (de BD o cache).
    const dteXml = await this.getXml(dteType, folio);

    // 2. Cargar config del tenant para resolución y logo.
    const ctx = await this.loadTenantContext();
    const numeroResolucion = ctx.config.resolNumero ?? 80;
    const fechaResolucion = (ctx.config.resolFecha ?? new Date("2014-08-22T00:00:00Z"))
      .toISOString()
      .split("T")[0];

    // Logo del tenant (si está cargado en TenantDteConfig.logoBase64).
    const logoBase64 = await prisma.tenantDteConfig
      .findUnique({
        where: { tenantId: this.tenantId },
        select: { logoBase64: true },
      })
      .then((c) => c?.logoBase64 ?? "");

    // 3. Llamar al endpoint impresion/pdf/carta/v2
    const pdfInput: Record<string, unknown> = {
      NumeroResolucion: numeroResolucion,
      FechaResolucion: fechaResolucion,
      LogoBase64: logoBase64,
      TimbreBase64: "", // SimpleAPI lo genera si está vacío
    };

    const result = await callSimpleApi({
      auth: this.auth,
      target: "api",
      path: "impresion/pdf/carta/v2",
      method: "POST",
      parts: [
        { name: "input", content: JSON.stringify(pdfInput) },
        {
          name: "file",
          content: dteXml,
          contentType: "application/xml",
          filename: `dte_${dteType}_${folio}.xml`,
        },
      ],
    });

    if (!result.ok) {
      throw new Error(
        `impresion/pdf HTTP ${result.status}: ${result.bodyText.slice(0, 500)}`,
      );
    }

    // El response es el PDF binario directo. Usamos bodyBuffer para evitar
    // corromper bytes con la decodificación a string.
    const pdfBuffer = result.bodyBuffer;

    // Verificación: PDF válido empieza con magic bytes %PDF (25 50 44 46).
    if (
      pdfBuffer.length < 4 ||
      pdfBuffer[0] !== 0x25 ||
      pdfBuffer[1] !== 0x50 ||
      pdfBuffer[2] !== 0x44 ||
      pdfBuffer[3] !== 0x46
    ) {
      throw new Error(
        `Respuesta de impresion/pdf no parece un PDF válido (magic bytes: ${pdfBuffer.slice(0, 4).toString("hex")}). Body inicial: ${result.bodyText.slice(0, 200)}`,
      );
    }

    return pdfBuffer;
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
