/**
 * Adapter de cesión electrónica vía App Octava.
 *
 * Octava firma y envía el AEC al RPETC del SII por nosotros, usando nuestro
 * cert digital. Es la alternativa simple a `sii-direct-cesion` (que firma y
 * envía directamente). Se elige con `TenantDteConfig.cessionProvider="OCTAVA"`.
 *
 * Flujo:
 *   1. Asegurar credenciales: si no hay PassAccesoApi en el tenant, llamar
 *      RegistraCedente con cert+password (one-time setup automático).
 *   2. Asegurar token vigente: si el cache TTL expiró, llamar ObtenerToken.
 *   3. CargaXmlCesion con el XML del DTE original.
 *   4. CedeDte con datos del cesionario.
 *   5. (opcional) Polling ConsultaEstadoAEC para obtener URL del AEC firmado
 *      cuando el SII lo acepta EOK; descargarlo y devolverlo en aecXml.
 *
 * Multi-tenant: TODAS las operaciones leen/escriben en TenantDteConfig del
 * tenantId del request. La password de cert digital se descifra in-memory
 * y NUNCA se persiste — solo viaja a Octava una vez para registro inicial.
 */

import { prisma } from "@/lib/prisma";
import {
  decryptBuffer,
  encryptBuffer,
} from "@/lib/dte-encryption";
import {
  cargaXmlCesion,
  cedeDte as octavaCedeDte,
  obtenerToken,
  pollConsultaEstadoAec,
  registraCedente,
  OctavaApiError,
  type OctavaAmbiente,
} from "@/lib/octava/octava-client";
import type {
  DteCedeRequest,
  DteCedeResponse,
} from "./dte-provider.adapter";

const TOKEN_TTL_MS = 5.5 * 60 * 60 * 1000; // 5h30 (margen vs los 6h reales de Octava)

/** Campo Bytes de Prisma: typings esperan `Uint8Array<ArrayBuffer>` (no Node Buffer ni ArrayBufferLike). */
function toPrismaBytes(buf: Buffer): Uint8Array<ArrayBuffer> {
  const out = new Uint8Array(buf.length);
  out.set(buf);
  return out as Uint8Array<ArrayBuffer>;
}

/**
 * Contexto que el caller debe proveer junto con el DteCedeRequest:
 *   - tenantId: para persistir credenciales/token en TenantDteConfig
 *   - environment: "PRODUCTION" | "CERTIFICATION"
 *   - pfxBuffer + pfxPassword: cert ya descifrado (in-memory)
 *   - rutTitular: RUT autorizado del cert
 *   - nombreTitular: nombre del titular del cert
 *   - razonSocialEmisor: razón social del cedente
 */
export interface OctavaCedeContext {
  tenantId: string;
  environment: "PRODUCTION" | "CERTIFICATION";
  pfxBuffer: Buffer;
  pfxPassword: string;
  rutTitular: string;
  nombreTitular: string;
  razonSocialEmisor: string;
}

interface OctavaIntegradorCreds {
  rut: string;
  password: string;
}

function loadIntegradorCreds(): OctavaIntegradorCreds {
  const rut = process.env.OCTAVA_INTEGRADOR_RUT;
  const password = process.env.OCTAVA_INTEGRADOR_PASSWORD;
  if (!rut || !password) {
    throw new Error(
      "Octava no configurado: faltan OCTAVA_INTEGRADOR_RUT y/o " +
        "OCTAVA_INTEGRADOR_PASSWORD en variables de entorno.",
    );
  }
  return { rut, password };
}

function envToAmbiente(env: "PRODUCTION" | "CERTIFICATION"): OctavaAmbiente {
  return env === "PRODUCTION" ? "1" : "0";
}

/** Octava suele responder Token/Url `"NULL"` (string); ignora igual que vacío. */
function normalizeOctavaToken(raw: string | undefined | null): string | null {
  if (raw == null) return null;
  const t = String(raw).trim();
  if (!t || t === "NULL" || t.toLowerCase() === "null") return null;
  return t;
}

/** URL S3 del AEC; Octava puede devolver el string `"NULL"`. */
function normalizeOctavaUrl(raw: string | undefined | null): string | null {
  const u = normalizeOctavaToken(raw);
  if (!u) return null;
  if (!/^https?:\/\//i.test(u)) return null;
  return u;
}

/**
 * Asegura que el tenant tenga `octavaPassAccesoApiEnc` en TenantDteConfig.
 * Si no, llama a RegistraCedente y persiste la password de acceso devuelta.
 *
 * Devuelve la password de acceso descifrada (lista para usar con ObtenerToken).
 */
async function ensureCedenteRegistered(
  ctx: OctavaCedeContext,
  signal?: AbortSignal,
): Promise<string> {
  const cfg = await prisma.tenantDteConfig.findUnique({
    where: { tenantId: ctx.tenantId },
    select: { octavaPassAccesoApiEnc: true, emisorRut: true },
  });
  if (cfg?.octavaPassAccesoApiEnc) {
    // Buffer puede llegar como Bytes (Uint8Array) — normalizamos
    const buf =
      cfg.octavaPassAccesoApiEnc instanceof Buffer
        ? cfg.octavaPassAccesoApiEnc
        : Buffer.from(cfg.octavaPassAccesoApiEnc);
    return decryptBuffer(buf).toString("utf8");
  }

  // No hay password — registramos el cedente.
  const integrador = loadIntegradorCreds();
  const cedenteRut = cfg?.emisorRut ?? ctx.rutTitular;
  const res = await registraCedente(
    {
      RUT: cedenteRut,
      RAZONSOCIAL: ctx.razonSocialEmisor,
      RUTAUTORIZADOSII: ctx.rutTitular,
      NOMBREAUTORIZADOSII: ctx.nombreTitular,
      CERTDIGBASE64: ctx.pfxBuffer.toString("base64"),
      PASSCERTDIG: ctx.pfxPassword,
      INTEGRADOR: integrador.rut,
      PASSWORDINTEGRADOR: integrador.password,
    },
    signal,
  );

  // Octava a veces devuelve IdResultadoFE=3 cuando el RUT del cedente ya
  // estaba dado de alta (no reenvía PassAccesoApi). En ese caso necesitamos
  // la misma clave que entregaron al registro original: env bootstrap o BD.
  const cedenteYaExiste =
    res.IdResultadoFE === "3" ||
    /ya existe RUT/i.test(res.ResultadoFE ?? "");

  const passOctava = typeof res.PassAccesoApi === "string"
    ? res.PassAccesoApi.trim()
    : "";

  if (cedenteYaExiste && !passOctava) {
    const bootstrap = process.env.OCTAVA_PASS_ACCESO_API?.trim();
    if (bootstrap) {
      await prisma.tenantDteConfig.update({
        where: { tenantId: ctx.tenantId },
        data: {
          octavaPassAccesoApiEnc: toPrismaBytes(encryptBuffer(Buffer.from(bootstrap, "utf8"))),
          octavaRegisteredAt: new Date(),
        },
      });
      return bootstrap;
    }
    throw new Error(
      "Octava: el RUT del cedente ya está registrado en Octava, pero en la base " +
        "no hay `PassAccesoApi` guardado. Obtén esa clave (correo al registrarse " +
        "o soporte Octava), define una vez `OCTAVA_PASS_ACCESO_API` en .env.local " +
        `(se persistirá cifrado) y vuelve a intentar. Detalle (${res.IdResultadoFE}): ` +
        `${res.ResultadoFE}`,
    );
  }

  if (res.IdResultadoFE !== "0" || !passOctava) {
    throw new Error(
      `Octava RegistraCedente falló (${res.IdResultadoFE}): ${res.ResultadoFE}`,
    );
  }
  // Persistir cifrado para no re-registrar en cada cesión.
  await prisma.tenantDteConfig.update({
    where: { tenantId: ctx.tenantId },
    data: {
      octavaPassAccesoApiEnc: toPrismaBytes(encryptBuffer(Buffer.from(passOctava, "utf8"))),
      octavaRegisteredAt: new Date(),
    },
  });
  return passOctava;
}

/**
 * Asegura que el tenant tenga un Token vigente en TenantDteConfig.
 * Si el cache TTL expiró o no existe, llama ObtenerToken y lo cachea.
 *
 * Devuelve el token vigente listo para usar en CargaXmlCesion/CedeDte.
 */
async function ensureToken(
  ctx: OctavaCedeContext,
  passAccesoApi: string,
  signal?: AbortSignal,
): Promise<string> {
  const cfg = await prisma.tenantDteConfig.findUnique({
    where: { tenantId: ctx.tenantId },
    select: { octavaToken: true, octavaTokenExpiresAt: true, emisorRut: true },
  });
  const cedenteRut = cfg?.emisorRut ?? ctx.rutTitular;
  const now = Date.now();
  const expiresAt = cfg?.octavaTokenExpiresAt?.getTime() ?? 0;
  if (cfg?.octavaToken && expiresAt > now + 60_000) {
    return cfg.octavaToken;
  }

  const res = await obtenerToken(
    { RUTACCESOAPI: cedenteRut, PASSWORDACCESOAPI: passAccesoApi },
    signal,
  );
  const tokenFromApi = normalizeOctavaToken(res.Token);
  // TOK: token nuevo. TDUP: a veces igual devuelven el token activo (no solo desde cache BD).
  if (
    tokenFromApi &&
    (res.DescripcionResultado === "TOK" ||
      res.DescripcionResultado === "TDUP")
  ) {
    await prisma.tenantDteConfig.update({
      where: { tenantId: ctx.tenantId },
      data: {
        octavaToken: tokenFromApi,
        octavaTokenExpiresAt: new Date(now + TOKEN_TTL_MS),
      },
    });
    return tokenFromApi;
  }
  if (res.DescripcionResultado === "TDUP" && cfg?.octavaToken) {
    return cfg.octavaToken;
  }
  throw new Error(
    `Octava ObtenerToken falló (${res.DescripcionResultado}): ${res.message ?? "sin mensaje"}`,
  );
}

/**
 * Descarga el AEC firmado desde la URL S3 que Octava nos dio.
 * Si falla, devolvemos null — el TrackId ya quedó persistido y el AEC se
 * puede recuperar luego con un re-poll de ConsultaEstadoAEC.
 */
async function downloadAecXml(
  url: string,
  signal?: AbortSignal,
): Promise<Buffer | null> {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15_000);
    if (signal) {
      signal.addEventListener("abort", () => controller.abort(), { once: true });
    }
    const res = await fetch(url, { signal: controller.signal });
    clearTimeout(timeout);
    if (!res.ok) return null;
    const arrayBuf = await res.arrayBuffer();
    return Buffer.from(arrayBuf);
  } catch {
    return null;
  }
}

/**
 * Entry point del adapter — hace toda la orquestación necesaria:
 *   register (si hace falta) → token → cargar XML → cede → poll estado.
 *
 * En modo PRODUCCIÓN, este flujo invoca al RPETC del SII vía Octava y
 * registra una cesión real. **No retornar success=true a menos que la
 * cesión efectivamente se haya enviado** (CedeDte respondió ok).
 */
export async function cedeDteOctava(
  request: DteCedeRequest,
  ctx: OctavaCedeContext,
  opts: { signal?: AbortSignal; pollFinal?: boolean } = {},
): Promise<DteCedeResponse> {
  try {
    const passApi = await ensureCedenteRegistered(ctx, opts.signal);
    const token = await ensureToken(ctx, passApi, opts.signal);

    const ambiente = envToAmbiente(ctx.environment);

    // 3. Carga XML del DTE.
    const xmlString = request.dteXml.toString("latin1");
    const cargaRes = await cargaXmlCesion(
      { STRINGXML: xmlString, AMBIENTE: ambiente, TOKEN: token },
      opts.signal,
    );
    // 0 = OK, 5 = ya cargado (idempotente)
    if (cargaRes.IdResultadoFE !== "0" && cargaRes.IdResultadoFE !== "5") {
      return {
        success: false,
        error: `Octava CargaXmlCesion falló (${cargaRes.IdResultadoFE}): ${cargaRes.ResultadoFE}`,
        rawResponse: cargaRes,
      };
    }

    // 4. Cede el DTE.
    const cedeRes = await octavaCedeDte(
      {
        FOLIO: String(request.dteFolio),
        TIPODTE: String(request.dteType),
        RUTEMISOR: request.dteIssuerRut,
        AMBIENTE: ambiente,
        DIRECCIONCEDENTE: request.cedenteDireccion || "Sin direccion",
        EMAILCEDENTE: request.cedenteEmail || "noreply@opai.cl",
        RUTCESIONARIO: request.cesionarioRut,
        RAZONSOCIALCESIONARIO: request.cesionarioRazonSocial,
        DIRECCIONCESIONARIO: request.cesionarioDireccion || "Sin direccion",
        EMAILCESIONARIO: request.cesionarioEmail || "noreply@opai.cl",
        NOMBRECONTACTO: request.contactNombre,
        EMAILCONTACTO: request.contactEmail,
        MONTOCEDER: String(Math.round(request.montoCesion)),
        FECHAVENCIMIENTO: request.fechaUltimoVencimiento,
        EMAILDEUDOR: request.emailDeudor ?? request.cesionarioEmail,
        TOKEN: token,
      },
      opts.signal,
    );
    // 0 = nueva cesión ejecutada.
    // 3 = DTE ya cedido. 4 = no es tenedor vigente para re‑ceder; igual puede existir cesión RPETC.
    const proceedToConsultaEstado =
      cedeRes.IdResultadoFE === "3" || cedeRes.IdResultadoFE === "4";
    if (cedeRes.IdResultadoFE !== "0" && !proceedToConsultaEstado) {
      return {
        success: false,
        error: `Octava CedeDte falló (${cedeRes.IdResultadoFE}): ${cedeRes.ResultadoFE}`,
        rawResponse: cedeRes,
      };
    }

    // La cesión se envió. Octava no nos devuelve TrackId del SII directamente
    // en CedeDte; se obtiene con ConsultaEstadoAEC (polling). Por defecto
    // hacemos el polling para tener un estado final + URL del AEC.
    if (opts.pollFinal === false) {
      return {
        success: true,
        status:
          proceedToConsultaEstado ? "SKIP_CEDE_USE_ESTADO" : "SUBMITTED",
        rawResponse: { carga: cargaRes, cede: cedeRes },
      };
    }

    const final = await pollConsultaEstadoAec(
      {
        FOLIO: String(request.dteFolio),
        TIPODTE: String(request.dteType),
        RUTEMISOR: request.dteIssuerRut,
        AMBIENTE: ambiente,
        TOKEN: token,
      },
      { signal: opts.signal },
    );

    const codigo = (final.CodigoCesion ?? "").trim();
    const urlAecNorm = normalizeOctavaUrl(final.UrlAec);

    let aecXml: Buffer | undefined;
    if (codigo === "EOK" && urlAecNorm) {
      const downloaded = await downloadAecXml(urlAecNorm, opts.signal);
      if (downloaded) aecXml = downloaded;
    }

    return {
      success: codigo === "EOK",
      // Octava no expone el TrackId del SII en su API (queda en su BD).
      // Usamos la URL del AEC como identificador estable cuando es EOK.
      trackId: urlAecNorm ?? undefined,
      aecXml,
      status: codigo || final.ResultadoFE,
      error:
        codigo === "EOK"
          ? undefined
          : codigo
            ? `Octava cesión rechazada (${codigo}): ${final.ResultadoFE}`
            : `Octava ConsultaEstadoAEC sin código tras polling: ${final.ResultadoFE || "SII pendiente/reintenta"}`,
      rawResponse: { carga: cargaRes, cede: cedeRes, estado: final },
    };
  } catch (err) {
    if (err instanceof OctavaApiError) {
      return {
        success: false,
        error: `${err.message} — ${typeof err.body === "string" ? err.body : JSON.stringify(err.body)}`,
        rawResponse: err.body,
      };
    }
    return {
      success: false,
      error: err instanceof Error ? err.message : "Error desconocido en Octava",
    };
  }
}
