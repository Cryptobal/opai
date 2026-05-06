/**
 * POST /api/finance/config/dte-provider/test-connection
 *
 * Hace un ping a SimpleAPI con el RUT del emisor + certificado del tenant.
 * Valida en una sola llamada:
 *   - SIMPLEAPI_KEY del servidor está configurada
 *   - El formato de auth Basic + URL del SDK oficial son correctos
 *   - El certificado .pfx del tenant es válido y la password descifra
 *   - El RUT del emisor está habilitado en SimpleAPI/SII para el tipo 33
 *
 * Usa el endpoint `folios/get/{tipo}` de servicios.simpleapi.cl
 * (consultar máximo de folios disponibles) — endpoint ligero que sirve
 * como ping sin descargar CAFs ni emitir nada.
 */

import { NextResponse } from "next/server";
import { requireAuth, unauthorized, resolveApiPerms } from "@/lib/api-auth";
import { hasFacturacionCapability } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import {
  callSimpleApi,
  detectApiKeyBlocked,
  isApiKeyAuthenticated,
} from "@/modules/finance/shared/adapters/simpleapi-http";
import { runDtePreflight } from "@/modules/finance/billing/dte-preflight";

export async function POST() {
  const ctx = await requireAuth();
  if (!ctx) return unauthorized();
  const perms = await resolveApiPerms(ctx);
  if (!hasFacturacionCapability(perms, "facturacion_configure")) {
    return NextResponse.json(
      { success: false, error: "Sin permisos" },
      { status: 403 },
    );
  }

  // 1. Cargar config + cert + un CAF tipo 33 (si existe) para correr
  // el preflight COMPLETO. Esto valida exactamente lo mismo que se
  // valida al emitir un DTE real, sin consumir folio ni crear DTE.
  const [config, cert, anyCaf33] = await Promise.all([
    prisma.tenantDteConfig.findUnique({ where: { tenantId: ctx.tenantId } }),
    prisma.tenantDteCertificate.findUnique({
      where: { tenantId: ctx.tenantId },
    }),
    prisma.tenantDteCaf.findFirst({
      where: { tenantId: ctx.tenantId, dteType: 33, isActive: true },
      orderBy: { folioDesde: "asc" },
    }),
  ]);

  // Pre-flight: valida config, cert (descifra, password OK, vigente,
  // RUT match) y CAF si está disponible. Reporta el PRIMER error con
  // mensaje exacto y stage tipado.
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
    cafXml: anyCaf33 ? Buffer.from(anyCaf33.xmlData) : null,
    folio: anyCaf33?.folioDesde ?? 0,
    dteType: 33,
  });

  if (!preflight.ok) {
    return NextResponse.json(
      {
        success: false,
        error: preflight.message,
        stage: preflight.stage,
      },
      { status: 400 },
    );
  }

  const pfxBuffer = preflight.pfxBuffer;
  const password = preflight.pfxPassword;

  // 2. Construir payload FoliosData (formato del SDK oficial)
  const ambiente = config!.environment === "PRODUCTION" ? 1 : 0;
  const foliosInput = {
    RutCertificado: cert!.rutTitular,
    Password: password,
    RutEmpresa: config!.emisorRut!,
    Ambiente: ambiente,
    Tipo: 33, // Factura Electrónica — documento universal para validar
  };

  // 4. Llamar a SimpleAPI scraper: folios/get/{tipo}
  // Multipart con `input` (JSON) + `file` (cert .pfx).
  // NOTA: el SDK C# de SimpleAPI usa GET con body multipart, pero esa
  // combinación viola HTTP estándar y `fetch` la rechaza con
  // "Request with GET/HEAD method cannot have body". Casi todos los
  // servers que aceptan GET-con-body también aceptan POST equivalente,
  // así que usamos POST. Si SimpleAPI rechaza con 405 acá, hay que
  // cambiar a usar `undici.request` (que sí permite GET+body).
  let result;
  try {
    result = await callSimpleApi({
      target: "scraper",
      path: `folios/get/33`,
      method: "POST",
      parts: [
        { name: "input", content: JSON.stringify(foliosInput) },
        {
          name: "file",
          content: pfxBuffer,
          contentType: "application/x-pkcs12",
          filename: "certificado.pfx",
        },
      ],
    });
  } catch (err) {
    return NextResponse.json(
      {
        success: false,
        error: `Error de red al llamar a SimpleAPI: ${
          err instanceof Error ? err.message : String(err)
        }`,
      },
      { status: 502 },
    );
  }

  if (!result.ok) {
    // Diagnóstico priorizado para que el toast del usuario sea EXACTO:
    //   1. ¿Apikey vencida / cuota / rate-limit?  → mensaje accionable.
    //   2. ¿Body JSON con `error`?                → mostrar tal cual.
    //   3. ¿Apikey reconocida (rate-limit hdrs)?  → cert/CAF fueron
    //      rechazados por SimpleAPI; pista de revisar .pfx.
    //   4. Fallback genérico.
    const blocked = detectApiKeyBlocked(result);
    if (blocked.blocked && blocked.message) {
      return NextResponse.json(
        {
          success: false,
          error: blocked.message,
          reason: blocked.reason,
        },
        { status: 502 },
      );
    }

    const bodyJsonError =
      result.bodyJson &&
      typeof result.bodyJson === "object" &&
      "error" in (result.bodyJson as Record<string, unknown>)
        ? String((result.bodyJson as { error: unknown }).error)
        : null;

    if (bodyJsonError) {
      return NextResponse.json(
        {
          success: false,
          error: `SimpleAPI rechazó la consulta: ${bodyJsonError}`,
        },
        { status: 502 },
      );
    }

    if (
      isApiKeyAuthenticated(result) &&
      (result.status === 401 || result.status === 400 || result.status === 422)
    ) {
      return NextResponse.json(
        {
          success: false,
          error:
            `SimpleAPI HTTP ${result.status} con apikey reconocida — el provider rechazó ` +
            `el certificado o los datos del emisor. Causas probables: el .pfx fue subido con ` +
            `contraseña incorrecta, el cert digital fue revocado en el SII, o el firmante ` +
            `no está autorizado en el SII para emitir DTEs en nombre del RUT del emisor. ` +
            `Re-subí el .pfx con la password correcta en /opai/configuracion/finanzas/dte.`,
          rateLimitRemaining: result.rateLimit.remaining,
        },
        { status: 502 },
      );
    }

    return NextResponse.json(
      {
        success: false,
        error: `SimpleAPI HTTP ${result.status}: ${result.bodyText.slice(0, 400)}`,
      },
      { status: 502 },
    );
  }

  // 5. Si llegamos acá, SimpleAPI respondió OK. Parsear cantidad disponible.
  const foliosDisponibles =
    typeof result.bodyJson === "number"
      ? result.bodyJson
      : Number(result.bodyText.trim());

  return NextResponse.json({
    success: true,
    data: {
      message: `Conexión OK con SimpleAPI (ambiente ${config!.environment}).`,
      rutEmisor: config!.emisorRut,
      rutCertificado: cert!.rutTitular,
      tipoConsultado: 33,
      foliosDisponiblesEnSii: Number.isFinite(foliosDisponibles)
        ? foliosDisponibles
        : null,
      raw: result.bodyJson ?? result.bodyText.slice(0, 200),
    },
  });
}
