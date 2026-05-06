/**
 * DTE preflight — valida exhaustivamente cada input ANTES de llamar al
 * provider externo (SimpleAPI). Devuelve un mensaje EXACTO de qué está
 * mal cuando alguna validación falla.
 *
 * Contexto: SimpleAPI usa HTTP 401 con body vacío para varios errores
 * de payload (cert con password incorrecto, CAF inválido, RUT del cert
 * no coincide con el emisor, folio fuera de rango, etc.). El usuario
 * no podía saber cuál era la causa real. Este módulo se ejecuta ANTES
 * y bloquea con un error específico, evitando llegar a SimpleAPI con
 * un payload que ya sabemos que va a ser rechazado.
 *
 * Cada check es atómico, devuelve el primer error encontrado y un
 * mensaje accionable para el usuario.
 */

import { decryptBuffer, decryptString } from "@/lib/dte-encryption";
import { parsePfx, PfxParseError } from "@/lib/dte-pfx-parser";
import { parseCaf, CafParseError } from "@/lib/dte-caf-parser";

/**
 * Normaliza un RUT chileno para comparar (remueve puntos, normaliza
 * dígito verificador a mayúscula). Acepta "12.345.678-9" y "12345678-9".
 */
export function normalizeRut(rut: string | null | undefined): string {
  if (!rut) return "";
  return rut.replace(/\./g, "").trim().toUpperCase();
}

export interface DtePreflightConfig {
  emisorRut: string | null | undefined;
  emisorRazonSocial: string | null | undefined;
  emisorGiro: string | null | undefined;
  emisorActeco: number | null | undefined;
  emisorDireccion: string | null | undefined;
  emisorComuna: string | null | undefined;
  emisorCiudad: string | null | undefined;
  environment: string | null | undefined;
}

export interface DtePreflightCert {
  pfxDataEnc: Buffer | Uint8Array;
  passwordEnc: string;
  rutTitular: string;
  notAfter: Date;
  fileName: string | null;
}

export interface DtePreflightInput {
  config: DtePreflightConfig | null;
  cert: DtePreflightCert | null;
  /** XML del CAF reservado por folio-tracker (raw bytes). */
  cafXml: Buffer | null;
  /** Folio reservado para esta emisión. */
  folio: number;
  /** Tipo DTE que se va a emitir (33, 34, 39, 56, 61). */
  dteType: number;
}

export interface DtePreflightSuccess {
  ok: true;
  /** PFX desencriptado en memoria. NO loguear ni persistir. */
  pfxBuffer: Buffer;
  /** Password desencriptada en memoria. NO loguear ni persistir. */
  pfxPassword: string;
}

export interface DtePreflightFailure {
  ok: false;
  /** Etapa donde falló: útil para métricas y telemetría. */
  stage:
    | "config"
    | "cert_missing"
    | "cert_decrypt"
    | "cert_password"
    | "cert_expired"
    | "caf_missing"
    | "caf_parse"
    | "caf_dte_type"
    | "caf_rut_mismatch"
    | "caf_folio_out_of_range";
  /** Mensaje exacto y accionable para el usuario final. */
  message: string;
}

export type DtePreflightResult = DtePreflightSuccess | DtePreflightFailure;

/**
 * Valida la configuración del emisor: campos requeridos por SII en
 * facturas (tipo 33). Si falta algún campo crítico, falla con detalle.
 */
function checkConfig(config: DtePreflightConfig | null): DtePreflightFailure | null {
  if (!config) {
    return {
      ok: false,
      stage: "config",
      message:
        "No existe configuración del emisor (TenantDteConfig). Completá los datos en /opai/configuracion/finanzas/dte → tab 'Datos del Emisor'.",
    };
  }

  const missing: string[] = [];
  if (!config.emisorRut?.trim()) missing.push("RUT del emisor");
  if (!config.emisorRazonSocial?.trim()) missing.push("Razón social");
  if (!config.emisorGiro?.trim()) missing.push("Giro");
  if (!config.emisorActeco) missing.push("Actividad económica (ACTECO)");
  if (!config.emisorDireccion?.trim()) missing.push("Dirección");
  if (!config.emisorComuna?.trim()) missing.push("Comuna");
  if (!config.emisorCiudad?.trim()) missing.push("Ciudad");

  if (missing.length > 0) {
    return {
      ok: false,
      stage: "config",
      message: `Faltan datos del emisor en /opai/configuracion/finanzas/dte: ${missing.join(", ")}.`,
    };
  }

  if (config.emisorRut && !/^\d{1,8}-[\dKk]$/.test(normalizeRut(config.emisorRut))) {
    return {
      ok: false,
      stage: "config",
      message: `El RUT del emisor "${config.emisorRut}" no tiene formato válido (esperado: NNNNNNNN-D).`,
    };
  }

  return null;
}

/**
 * Valida el certificado .pfx: existe, se puede desencriptar, la
 * contraseña almacenada lo abre y está vigente.
 *
 * IMPORTANTE: NO validamos que el RUT del titular del .pfx coincida
 * con el RUT del emisor. En Chile los certificados digitales SII son
 * **personales** (asociados al representante legal o un usuario
 * autorizado), NO a la empresa. Por ejemplo, el representante legal
 * el representante legal con su RUT personal firma DTEs de la empresa
 * cuyo RUT es distinto, y eso es
 * 100% válido. Quien autoriza ese vínculo es el propio SII (la empresa
 * registra a sus usuarios firmantes en el panel del SII), y SimpleAPI
 * verifica esa autorización al emitir contra el SII. Acá NO podemos
 * (ni debemos) replicar esa validación; sería un falso positivo.
 *
 * Devuelve también el pfxBuffer + password descifrados para reusarlos
 * en el provider sin re-desencriptar (ahorra IO/CPU).
 */
function checkCert(
  cert: DtePreflightCert | null,
):
  | DtePreflightFailure
  | { ok: true; pfxBuffer: Buffer; pfxPassword: string } {
  if (!cert) {
    return {
      ok: false,
      stage: "cert_missing",
      message:
        "No hay certificado digital cargado. Subí un .pfx en /opai/configuracion/finanzas/dte → tab 'Certificado Digital'.",
    };
  }

  // 1. Desencriptar (si DTE_ENCRYPTION_KEY cambió, esto truena).
  let pfxBuffer: Buffer;
  let pfxPassword: string;
  try {
    pfxBuffer = decryptBuffer(Buffer.from(cert.pfxDataEnc));
    pfxPassword = decryptString(cert.passwordEnc);
  } catch (err) {
    return {
      ok: false,
      stage: "cert_decrypt",
      message:
        `No se pudo desencriptar el certificado. Casi siempre significa que ` +
        `DTE_ENCRYPTION_KEY cambió desde que se subió el .pfx (la AES-GCM ` +
        `auth tag no valida con otra clave). Volvé a subir el certificado en ` +
        `/opai/configuracion/finanzas/dte. Detalle técnico: ${
          err instanceof Error ? err.message : String(err)
        }`,
    };
  }

  // 2. Vigencia
  const now = new Date();
  if (cert.notAfter < now) {
    const venceStr = cert.notAfter.toISOString().split("T")[0];
    return {
      ok: false,
      stage: "cert_expired",
      message: `El certificado digital venció el ${venceStr}. Subí un .pfx vigente en /opai/configuracion/finanzas/dte.`,
    };
  }

  // 3. La password persistida abre el .pfx (esto descarta corrupción
  // y password mal copiada al subir).
  try {
    parsePfx(pfxBuffer, pfxPassword);
  } catch (err) {
    if (err instanceof PfxParseError) {
      return {
        ok: false,
        stage: "cert_password",
        message:
          `La contraseña almacenada NO abre el archivo .pfx. Esto puede pasar si ` +
          `la password fue ingresada con typo al subir el certificado. Volvé a ` +
          `subir el .pfx con la contraseña correcta en /opai/configuracion/finanzas/dte. ` +
          `Detalle: ${err.message}`,
      };
    }
    return {
      ok: false,
      stage: "cert_password",
      message: `Error parseando el certificado: ${
        err instanceof Error ? err.message : String(err)
      }`,
    };
  }

  // NOTA: NO comparamos el RUT del titular del .pfx con el RUT del
  // emisor. Ver doc de la función arriba — es esperable que difieran
  // (cert personal de un firmante autorizado por la empresa ante SII).

  return { ok: true, pfxBuffer, pfxPassword };
}

/**
 * Valida el CAF: parseable, tipo correcto, RUT coincide, y el folio
 * que se va a usar está dentro del rango autorizado.
 */
function checkCaf(
  cafXml: Buffer | null,
  emisorRut: string,
  dteType: number,
  folio: number,
): DtePreflightFailure | null {
  if (!cafXml || cafXml.length === 0) {
    return {
      ok: false,
      stage: "caf_missing",
      message:
        `No hay CAF activo cargado para el tipo DTE ${dteType}. Subí el CAF ` +
        `en /opai/configuracion/finanzas/dte → tab 'CAFs (Folios SII)'.`,
    };
  }

  let meta: ReturnType<typeof parseCaf>;
  try {
    meta = parseCaf(cafXml);
  } catch (err) {
    if (err instanceof CafParseError) {
      return {
        ok: false,
        stage: "caf_parse",
        message: `El CAF cargado tiene un XML inválido: ${err.message} Re-subí el CAF original recibido del SII.`,
      };
    }
    return {
      ok: false,
      stage: "caf_parse",
      message: `Error parseando el CAF: ${
        err instanceof Error ? err.message : String(err)
      }`,
    };
  }

  if (meta.dteType !== dteType) {
    return {
      ok: false,
      stage: "caf_dte_type",
      message:
        `El CAF reservado es para tipo DTE ${meta.dteType} pero estás emitiendo tipo ${dteType}. ` +
        `Esto es un bug de selección de CAF; abrí ticket adjuntando este mensaje.`,
    };
  }

  const rutCaf = normalizeRut(meta.rutEmisor);
  const rutEmisor = normalizeRut(emisorRut);
  if (rutCaf !== rutEmisor) {
    return {
      ok: false,
      stage: "caf_rut_mismatch",
      message:
        `El CAF está autorizado para el RUT ${rutCaf}, pero el emisor configurado es ${rutEmisor}. ` +
        `O subiste el CAF de otra empresa, o cambiaste el RUT del emisor después de subirlo. ` +
        `Verificá en /opai/configuracion/finanzas/dte.`,
    };
  }

  if (folio < meta.folioDesde || folio > meta.folioHasta) {
    return {
      ok: false,
      stage: "caf_folio_out_of_range",
      message:
        `El folio ${folio} reservado para esta emisión está fuera del rango ` +
        `autorizado del CAF (${meta.folioDesde}–${meta.folioHasta}). ` +
        `Esto suele significar que se agotaron los folios. Solicitá más folios al SII y subí ` +
        `el nuevo CAF en /opai/configuracion/finanzas/dte.`,
    };
  }

  return null;
}

/**
 * Ejecuta TODAS las validaciones en orden y devuelve el primer error,
 * o `{ ok: true, pfxBuffer, pfxPassword }` si todo pasa.
 *
 * Las validaciones se ejecutan local (no hacen network IO) para que
 * un error del lado del usuario nunca consuma cuota de SimpleAPI.
 */
export function runDtePreflight(
  input: DtePreflightInput,
): DtePreflightResult {
  const configError = checkConfig(input.config);
  if (configError) return configError;

  // En este punto config está validado y emisorRut existe + tiene formato válido.
  const emisorRut = input.config!.emisorRut!;

  const certResult = checkCert(input.cert);
  if (!("pfxBuffer" in certResult)) return certResult;

  const cafError = checkCaf(input.cafXml, emisorRut, input.dteType, input.folio);
  if (cafError) return cafError;

  return {
    ok: true,
    pfxBuffer: certResult.pfxBuffer,
    pfxPassword: certResult.pfxPassword,
  };
}
