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
  runDtePreflight,
  type DtePreflightFailure,
} from "@/modules/finance/billing/dte-preflight";
import {
  callSimpleApi,
  detectApiKeyBlocked,
  getSimpleApiKeyOrThrow,
  isApiKeyAuthenticated,
  type SimpleApiAuth,
  type SimpleApiResponse,
} from "./simpleapi-http";
import type {
  DteProviderAdapter,
  DteIssueRequest,
  DteIssueResponse,
  DteStatusResponse,
  DteVoidRequest,
  DteCedeRequest,
  DteCedeResponse,
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
 * Mapea un dteType a la enumeración `Tipo` que SimpleAPI usa en los
 * endpoints `envio/generar` y `envio/enviar`. Valores válidos según
 * SimpleAPI (mensaje literal del provider en HTTP 400):
 *
 *   - `1` → EnvioDTE   (documentos electrónicos: 33, 34, 56, 61)
 *   - `2` → EnvioBoleta (boletas: 39 afecta, 41 exenta)
 *
 * Si pasás `0` SimpleAPI rechaza con
 *   `{"mensaje":"Tipo incorrecto. 1.EnvioDTE - 2.EnvioBoleta."}`
 */
function envioTipoFromDte(dteType: number): 1 | 2 {
  return dteType === 39 || dteType === 41 ? 2 : 1;
}

/**
 * Tipos DTE que requieren copia cedible (Ley 19.983 — Factoring).
 * Aplica a facturas afectas/exentas y notas de crédito/débito que se
 * pueden ceder a terceros. NO aplica a boletas ni guías de despacho.
 */
const DTE_TYPES_WITH_CEDIBLE = new Set([33, 34, 43, 56, 61]);

/**
 * Limpia el campo `LogoBase64` que se manda al endpoint de impresión
 * de SimpleAPI. El SDK oficial documenta que el logo "Debe ir en
 * base64" — sin prefijo `data:image/png;base64,`. Pero el frontend de
 * OPAI puede tener guardada la versión con prefijo (de UIs viejas) o
 * sin prefijo. Esta función normaliza ambos casos a base64 puro.
 */
function stripDataUrlPrefix(b64: string | null | undefined): string {
  if (!b64) return "";
  const trimmed = b64.trim();
  if (trimmed.startsWith("data:")) {
    const idx = trimmed.indexOf(",");
    return idx >= 0 ? trimmed.slice(idx + 1) : "";
  }
  return trimmed;
}


/**
 * Convierte una respuesta HTTP no-OK de SimpleAPI en un mensaje
 * legible y accionable.
 *
 * Decisión clave (descubierta empíricamente probando contra
 * api.simpleapi.cl): SimpleAPI usa **HTTP 401 con body vacío** para
 * dos casos completamente distintos —
 *
 *   1. Apikey inválida / ausente
 *   2. Apikey OK pero el payload (cert, CAF, JSON) fue rechazado
 *
 * Para distinguirlos miramos los headers `x-rate-limit-*`. SimpleAPI
 * los devuelve SOLO cuando autenticó la apikey y le aplicó el contador
 * de cuota. Si están presentes en un 401, el problema NO es la apikey:
 * casi siempre es certificado .pfx con password mal o vencido, o CAF
 * inválido para el folio reservado.
 *
 * `endpoint` se incluye para distinguir cuál de los pasos del flow
 * falló (`dte/generar`, `envio/generar`, `envio/enviar`,
 * `consulta/envio`, `impresion/pdf/...`).
 */
function describeSimpleApiError(
  endpoint: string,
  res: SimpleApiResponse,
): string {
  const blocked = detectApiKeyBlocked(res);
  if (blocked.blocked && blocked.message) {
    return `SimpleAPI [${endpoint}]: ${blocked.message}`;
  }

  const trimmedBody = res.bodyText.trim();
  const apiKeyOk = isApiKeyAuthenticated(res);

  // Caso A: apikey reconocida (rate-limit headers presentes) pero el
  // request fue rechazado. El problema está en el payload, no en auth.
  // Es el caso más común en producción y antes se reportaba como "401:"
  // sin pistas. Damos un diagnóstico orientado a cert/CAF.
  if (apiKeyOk && (res.status === 401 || res.status === 400 || res.status === 422)) {
    const detail = trimmedBody
      ? ` Detalle del provider: ${trimmedBody.slice(0, 400)}.`
      : "";
    return (
      `SimpleAPI [${endpoint}] HTTP ${res.status} con apikey reconocida — ` +
      `el provider rechazó el payload, NO es problema de SIMPLEAPI_KEY. ` +
      `Causas más comunes: certificado digital con contraseña incorrecta o vencido, ` +
      `CAF inválido o agotado para el tipo de DTE, o datos del emisor/receptor mal ` +
      `formados. Revisá el cert y los CAFs en /opai/configuracion/finanzas/dte.${detail}`
    );
  }

  // Caso B: 401/403 sin rate-limit headers Y body vacío → apikey no
  // reconocida realmente.
  if (
    !trimmedBody &&
    (res.status === 401 || res.status === 403)
  ) {
    return (
      `SimpleAPI [${endpoint}] HTTP ${res.status} sin cuerpo y sin rate-limit headers. ` +
      `Apikey no reconocida por SimpleAPI: verificá SIMPLEAPI_KEY en Vercel ` +
      `(sin espacios ni saltos de línea) y el estado en https://panel.simpleapi.cl/.`
    );
  }

  return `SimpleAPI [${endpoint}] HTTP ${res.status}: ${trimmedBody.slice(0, 500)}`;
}

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
   * Carga config + cert del tenant para operaciones que NO emiten un
   * DTE (getStatus, getPdf, getXml, void). Hace las validaciones
   * mínimas (cert existe + vigente + descifrable) usando el módulo
   * de preflight para mantener un solo camino de error.
   */
  private async loadTenantContext(): Promise<TenantContext> {
    const [config, cert] = await Promise.all([
      prisma.tenantDteConfig.findUnique({ where: { tenantId: this.tenantId } }),
      prisma.tenantDteCertificate.findUnique({
        where: { tenantId: this.tenantId },
      }),
    ]);

    // Re-utilizamos el preflight pero solo nos quedamos con los pasos
    // que NO requieren CAF/folio (estos métodos no emiten). Para eso
    // pasamos un CAF dummy mínimo y un folio cualquiera, e ignoramos
    // los errores específicos de CAF.
    const preflight = runDtePreflight({
      config: config
        ? {
            emisorRut: config.emisorRut,
            emisorRazonSocial: config.emisorRazonSocial,
            emisorGiro: config.emisorGiro,
            emisorActeco: config.emisorActeco,
            emisorDireccion: config.emisorDireccion,
            emisorComuna: config.emisorComuna,
            emisorCiudad: config.emisorCiudad,
            environment: config.environment,
          }
        : null,
      cert: cert
        ? {
            pfxDataEnc: cert.pfxDataEnc,
            passwordEnc: cert.passwordEnc,
            rutTitular: cert.rutTitular,
            notAfter: cert.notAfter,
            fileName: cert.fileName,
          }
        : null,
      // Para operaciones de lectura no validamos CAF; ya está validado
      // en el momento de la emisión y el archivo ni se usa acá.
      cafXml: Buffer.from(""),
      folio: 0,
      dteType: 33,
    });

    if (!preflight.ok) {
      // Las stages que NO aplican a operaciones de lectura las saltamos
      // (read-only no usa CAF). Cualquier otra falla sí bloquea.
      const ignorableStages: DtePreflightFailure["stage"][] = [
        "caf_missing",
        "caf_parse",
        "caf_dte_type",
        "caf_rut_mismatch",
        "caf_folio_out_of_range",
      ];
      if (!ignorableStages.includes(preflight.stage)) {
        throw new Error(preflight.message);
      }
    }

    // Si llegamos acá: el preflight pasó (o solo falló por CAF, que no
    // necesitamos en operaciones read-only). Cuando solo CAF falló, el
    // pfx no quedó descifrado en el resultado: lo hacemos a mano.
    const pfxBuffer = preflight.ok
      ? preflight.pfxBuffer
      : decryptBuffer(Buffer.from(cert!.pfxDataEnc));
    const password = preflight.ok
      ? preflight.pfxPassword
      : decryptString(cert!.passwordEnc);

    return {
      config: {
        environment: config!.environment as "CERTIFICATION" | "PRODUCTION",
        emisorRut: config!.emisorRut!,
        emisorRazonSocial: config!.emisorRazonSocial!,
        emisorGiro: config!.emisorGiro ?? "",
        emisorActeco: config!.emisorActeco ?? 0,
        emisorDireccion: config!.emisorDireccion ?? "",
        emisorComuna: config!.emisorComuna ?? "",
        emisorCiudad: config!.emisorCiudad ?? "",
        emisorTelefono: config!.emisorTelefono,
        emisorEmail: config!.emisorEmail,
        resolNumero: config!.resolNumero,
        resolFecha: config!.resolFecha,
      },
      certificate: {
        pfxBuffer,
        password,
        rutTitular: cert!.rutTitular,
      },
    };
  }

  /**
   * Carga + valida TODO lo necesario para emitir un DTE: config del
   * emisor, certificado .pfx (descifrable, vigente, password correcta,
   * RUT coincide), y CAF (válido, RUT coincide, folio en rango).
   *
   * Devuelve `{ ok: true, ctx }` con el contexto listo, o un error
   * EXACTO en `error` que se le va a mostrar al usuario sin necesidad
   * de adivinar.
   */
  private async loadAndValidateForIssue(
    request: DteIssueRequest,
  ): Promise<
    | { ok: true; ctx: TenantContext }
    | { ok: false; error: string; stage: DtePreflightFailure["stage"] }
  > {
    const [config, cert] = await Promise.all([
      prisma.tenantDteConfig.findUnique({ where: { tenantId: this.tenantId } }),
      prisma.tenantDteCertificate.findUnique({
        where: { tenantId: this.tenantId },
      }),
    ]);

    const preflight = runDtePreflight({
      config: config
        ? {
            emisorRut: config.emisorRut,
            emisorRazonSocial: config.emisorRazonSocial,
            emisorGiro: config.emisorGiro,
            emisorActeco: config.emisorActeco,
            emisorDireccion: config.emisorDireccion,
            emisorComuna: config.emisorComuna,
            emisorCiudad: config.emisorCiudad,
            environment: config.environment,
          }
        : null,
      cert: cert
        ? {
            pfxDataEnc: cert.pfxDataEnc,
            passwordEnc: cert.passwordEnc,
            rutTitular: cert.rutTitular,
            notAfter: cert.notAfter,
            fileName: cert.fileName,
          }
        : null,
      cafXml: request.cafXml ?? null,
      folio: request.folio ?? 0,
      dteType: request.dteType,
    });

    if (!preflight.ok) {
      return { ok: false, error: preflight.message, stage: preflight.stage };
    }

    return {
      ok: true,
      ctx: {
        config: {
          environment: config!.environment as "CERTIFICATION" | "PRODUCTION",
          emisorRut: config!.emisorRut!,
          emisorRazonSocial: config!.emisorRazonSocial!,
          emisorGiro: config!.emisorGiro ?? "",
          emisorActeco: config!.emisorActeco ?? 0,
          emisorDireccion: config!.emisorDireccion ?? "",
          emisorComuna: config!.emisorComuna ?? "",
          emisorCiudad: config!.emisorCiudad ?? "",
          emisorTelefono: config!.emisorTelefono,
          emisorEmail: config!.emisorEmail,
          resolNumero: config!.resolNumero,
          resolFecha: config!.resolFecha,
        },
        certificate: {
          pfxBuffer: preflight.pfxBuffer,
          password: preflight.pfxPassword,
          rutTitular: cert!.rutTitular,
        },
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
      // Si el caller proveyó datos reales (autocompletados del CRM o
      // ingresados a mano), se usan; sino fallback a defaults seguros
      // que el SII acepta (no son ideales pero no rechazan el DTE).
      Giro: (request.receiverGiro ?? "").trim() || "Sin Giro",
      Direccion: (request.receiverDireccion ?? "").trim() || "Sin direccion",
      Comuna: (request.receiverComuna ?? "").trim() || "Santiago",
      Ciudad: (request.receiverCiudad ?? "").trim() || "Santiago",
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
        const ref: Record<string, unknown> = {
          Numero: refs.length + 1,
          TipoDocumento: r.tipoDocRef,
          FolioReferencia: r.folioRef,
          FechaDocumentoReferenciaString: r.fchRef,
        };
        if (r.razonRef && r.razonRef.trim()) {
          ref.RazonReferencia = r.razonRef;
        }
        refs.push(ref);
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
        error: describeSimpleApiError("dte/generar", result),
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
      Tipo: envioTipoFromDte(request.dteType),
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
        error: describeSimpleApiError("envio/generar", result),
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
      Tipo: envioTipoFromDte(request.dteType),
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
        error: describeSimpleApiError("envio/enviar", result),
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

    // Pre-flight EXHAUSTIVO antes de pegarle a SimpleAPI. Valida config,
    // certificado (descifrable, vigente, password correcta, RUT coincide)
    // y CAF (parseable, RUT coincide, folio en rango). Si algo falla acá,
    // el usuario recibe un mensaje EXACTO sin necesidad de adivinar entre
    // posibles causas.
    const preflight = await this.loadAndValidateForIssue(request);
    if (!preflight.ok) {
      return {
        success: false,
        error: preflight.error,
        rawResponse: { preflightStage: preflight.stage },
      };
    }
    const ctx = preflight.ctx;

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
          message: describeSimpleApiError("consulta/envio", result),
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
   * Genera el PDF impreso del DTE LOCALMENTE, sin depender del
   * proveedor externo (SimpleAPI). Esto nos da control total sobre el
   * layout y elimina los campos vacíos / formato pobre que SimpleAPI
   * genera.
   *
   * El flujo es:
   *   1. Recuperar el XML firmado del DTE de BD (lo persistimos en
   *      `FinanceDte.dteXml` cuando se emite).
   *   2. Parsear el XML — incluido el bloque `<TED>` que es la fuente
   *      de verdad del timbre electrónico.
   *   3. Renderizar el PDF con `pdf-lib`:
   *      - PDF417 generado localmente con `bwip-js` desde el TED.
   *      - Layout limpio estilo iPapers/LibreDTE (sin campos vacíos).
   *      - Página 2 con copia cedible (Ley 19.983) para tipos
   *        33/34/43/56/61.
   *
   * Para tipos no-cedibles (boletas 39/41, guías 52) genera 1 sola
   * página. SimpleAPI YA NO se usa para impresión — solo para
   * emisión / consulta de estado / envío al SII.
   */
  async getPdf(dteType: number, folio: number): Promise<Buffer> {
    const dteXml = await this.getXml(dteType, folio);

    const ctx = await this.loadTenantContext();
    const numeroResolucion = ctx.config.resolNumero ?? 80;
    const fechaResolucion =
      ctx.config.resolFecha ?? new Date("2014-08-22T00:00:00Z");

    const rawLogo = await prisma.tenantDteConfig
      .findUnique({
        where: { tenantId: this.tenantId },
        select: { logoBase64: true },
      })
      .then((c) => c?.logoBase64 ?? "");
    const logoBase64 = stripDataUrlPrefix(rawLogo);

    const { parseDteXml } = await import("@/lib/dte-xml-parser");
    const { renderDtePdf } = await import("@/lib/dte-pdf-renderer");

    const parsed = parseDteXml(dteXml);
    return await renderDtePdf(parsed, {
      numeroResolucion,
      fechaResolucion,
      logoBase64,
      cedible: DTE_TYPES_WITH_CEDIBLE.has(dteType),
    });
  }

  // ─────────────────────────────────────────────
  // cede — genera AEC firmado y lo envía al RPETC
  // ─────────────────────────────────────────────

  /**
   * Cede una factura a una empresa de factoring (Bloque factoring v3).
   * Delega en `cedeDteSimpleApi` (adapter dedicado) tras resolver el
   * contexto del tenant. La consulta del estado oficial del SII se
   * hace aparte vía cron SOAP wsRPETCConsulta.
   */
  async cede(request: DteCedeRequest): Promise<DteCedeResponse> {
    const { cedeDteSimpleApi } = await import("./simpleapi-cesion");
    let ctx: TenantContext;
    try {
      ctx = await this.loadTenantContext();
    } catch (err) {
      return {
        success: false,
        error:
          err instanceof Error
            ? err.message
            : "Error cargando contexto del tenant",
      };
    }
    return cedeDteSimpleApi(request, {
      auth: this.auth,
      environment: ctx.config.environment,
      pfxBuffer: ctx.certificate.pfxBuffer,
      pfxPassword: ctx.certificate.password,
      rutTitular: ctx.certificate.rutTitular,
    });
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
