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
import { decryptBuffer, decryptString } from "@/lib/dte-encryption";
import { callSimpleApi } from "@/modules/finance/shared/adapters/simpleapi-http";

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

  // 1. Validar config del tenant
  const config = await prisma.tenantDteConfig.findUnique({
    where: { tenantId: ctx.tenantId },
  });
  if (!config?.emisorRut) {
    return NextResponse.json(
      {
        success: false,
        error:
          "Falta configurar el RUT del emisor en /opai/configuracion/finanzas/dte (tab Datos del Emisor).",
      },
      { status: 400 },
    );
  }

  const cert = await prisma.tenantDteCertificate.findUnique({
    where: { tenantId: ctx.tenantId },
  });
  if (!cert) {
    return NextResponse.json(
      {
        success: false,
        error:
          "No hay certificado digital cargado en /opai/configuracion/finanzas/dte (tab Certificado Digital).",
      },
      { status: 400 },
    );
  }
  if (cert.notAfter < new Date()) {
    return NextResponse.json(
      {
        success: false,
        error: `El certificado digital venció el ${cert.notAfter
          .toISOString()
          .split("T")[0]}. Subí uno vigente.`,
      },
      { status: 400 },
    );
  }

  // 2. Desencriptar certificado en memoria (NO se loguea ni persiste)
  let pfxBuffer: Buffer;
  let password: string;
  try {
    pfxBuffer = decryptBuffer(Buffer.from(cert.pfxDataEnc));
    password = decryptString(cert.passwordEnc);
  } catch (err) {
    return NextResponse.json(
      {
        success: false,
        error:
          "No se pudo desencriptar el certificado. Probablemente DTE_ENCRYPTION_KEY cambió o el archivo está corrupto.",
        details: err instanceof Error ? err.message : String(err),
      },
      { status: 500 },
    );
  }

  // 3. Construir payload FoliosData (formato del SDK oficial)
  const ambiente = config.environment === "PRODUCTION" ? 1 : 0;
  const foliosInput = {
    RutCertificado: cert.rutTitular,
    Password: password,
    RutEmpresa: config.emisorRut,
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
    // Formato de error descriptivo para el usuario.
    const msgFromBody =
      typeof result.bodyJson === "object" && result.bodyJson
        ? JSON.stringify(result.bodyJson)
        : result.bodyText.slice(0, 500);
    return NextResponse.json(
      {
        success: false,
        error: `SimpleAPI respondió HTTP ${result.status}`,
        details: msgFromBody,
        hint:
          result.status === 401 || result.status === 403
            ? "Credenciales incorrectas: verificá SIMPLEAPI_KEY y el password del .pfx."
            : result.status === 404
              ? "Endpoint no existe: la URL base de SimpleAPI puede haber cambiado."
              : "Revisá el body de la respuesta para detalle del error.",
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
      message: `Conexión OK con SimpleAPI (ambiente ${config.environment}).`,
      rutEmisor: config.emisorRut,
      rutCertificado: cert.rutTitular,
      tipoConsultado: 33,
      foliosDisponiblesEnSii: Number.isFinite(foliosDisponibles)
        ? foliosDisponibles
        : null,
      raw: result.bodyJson ?? result.bodyText.slice(0, 200),
    },
  });
}
