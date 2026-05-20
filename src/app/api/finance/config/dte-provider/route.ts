/**
 * GET / PUT /api/finance/config/dte-provider
 *
 * GET: devuelve TenantDteConfig + metadata del certificado (sin material sensible)
 *      + flag de si SIMPLEAPI_KEY está configurada en el servidor.
 * PUT: upsert de TenantDteConfig (datos del emisor, ambiente, provider, etc.).
 */

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import {
  requireAuth,
  unauthorized,
  resolveApiPerms,
  parseBody,
} from "@/lib/api-auth";
import { canView, hasFacturacionCapability } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import { invalidateTenantEmailCache } from "@/lib/resend";

/**
 * Schema Zod del body del PUT.
 *
 * Diseño defensivo (2026-05): aceptamos `null` y `""` como equivalentes
 * a "no setear" para todos los campos de texto opcionales. Antes el
 * schema usaba `z.string().optional()` y el frontend (cuyo
 * DEFAULT_CONFIG inicializa los strings con `""`) producía 400s con
 * mensajes confusos cuando el usuario dejaba un campo vacío. Ahora
 * `nullable()` + `union(literal(""), ...)` cubre los 3 casos: campo
 * ausente, null, o string vacío.
 *
 * `passthrough()` en vez de `.strict()` para que el frontend pueda
 * mandar campos que aún no existen en el modelo Prisma (hay un par de
 * features del UI todavía no persistidos) sin tirar 400. La whitelist
 * `PERSISTABLE_KEYS` garantiza que solo se guarden los soportados.
 */
const optionalText = (max: number) =>
  z
    .union([z.literal(""), z.string().max(max)])
    .nullable()
    .optional();

const updateConfigSchema = z
  .object({
    provider: z.enum(["SIMPLEAPI", "SIMPLEFACTURA", "STUB"]).optional(),
    environment: z.enum(["CERTIFICATION", "PRODUCTION"]).optional(),
    isActive: z.boolean().optional(),
    emisorRut: z
      .union([z.literal(""), z.string().regex(/^\d{1,8}-[\dKk]$/, "RUT inválido")])
      .nullable()
      .optional(),
    emisorRazonSocial: optionalText(200),
    emisorGiro: optionalText(200),
    emisorActeco: z.number().int().nullable().optional(),
    emisorDireccion: optionalText(200),
    emisorComuna: optionalText(80),
    emisorCiudad: optionalText(80),
    emisorTelefono: optionalText(40),
    // Email del emisor: aceptamos vacío o email válido.
    emisorEmail: z
      .union([z.literal(""), z.string().email("Email inválido")])
      .nullable()
      .optional(),
    resolNumero: z.number().int().nullable().optional(),
    resolFecha: z.string().nullable().optional(),
    alertEmails: z
      .array(z.string().email("Email de alerta inválido"))
      .max(10, "Máximo 10 emails de alerta")
      .optional(),
    alwaysBcc: z
      .array(z.string().email("Email BCC inválido"))
      .max(10, "Máximo 10 emails BCC")
      .optional(),
    logoBase64: z
      .string()
      .max(800 * 1024, "Logo demasiado grande (máx 800KB en base64)")
      .nullable()
      .optional(),
  })
  .passthrough();

/**
 * Whitelist de campos que el modelo Prisma `TenantDteConfig` acepta hoy.
 * Cualquier otro campo que llegue en el body se descarta silenciosamente
 * para no romper el upsert. Si en el futuro se agregan columnas al
 * modelo, agregarlas acá.
 */
const PERSISTABLE_KEYS = [
  "provider",
  "environment",
  "isActive",
  "emisorRut",
  "emisorRazonSocial",
  "emisorGiro",
  "emisorActeco",
  "emisorDireccion",
  "emisorComuna",
  "emisorCiudad",
  "emisorTelefono",
  "emisorEmail",
  "resolNumero",
  "alertEmails",
  "alwaysBcc",
  "logoBase64",
  // Campos agregados por main (PR #419 — DTE draft management).
  // Persisten en TenantDteConfig desde la migration nivel-mundial.
  "defaultXmlRecipientEmails",
  "defaultXmlRecipientAlwaysSend",
  "emailTemplateSubject",
  "emailTemplateBody",
] as const;

/**
 * Convierte el body validado en el shape exacto que Prisma upsert
 * acepta. Aplica 3 transformaciones:
 *   1. Solo deja campos en `PERSISTABLE_KEYS`.
 *   2. Convierte string vacío `""` → `null` (semánticamente "no seteado").
 *   3. Omite campos `undefined` para no pisar valores ya guardados.
 */
function pickPersistableFields(
  data: z.infer<typeof updateConfigSchema>,
): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const key of PERSISTABLE_KEYS) {
    const value = (data as Record<string, unknown>)[key];
    if (value === undefined) continue;
    out[key] = value === "" ? null : value;
  }
  return out;
}

export async function GET() {
  const ctx = await requireAuth();
  if (!ctx) return unauthorized();
  const perms = await resolveApiPerms(ctx);
  if (!canView(perms, "finance", "configuracion")) {
    return NextResponse.json(
      { success: false, error: "Sin permisos" },
      { status: 403 }
    );
  }

  const config = await prisma.tenantDteConfig.findUnique({
    where: { tenantId: ctx.tenantId },
  });
  const cert = await prisma.tenantDteCertificate.findUnique({
    where: { tenantId: ctx.tenantId },
    select: {
      id: true,
      fileName: true,
      rutTitular: true,
      nombreTitular: true,
      emisorCert: true,
      notBefore: true,
      notAfter: true,
      fingerprint: true,
      uploadedAt: true,
    },
  });

  return NextResponse.json({
    success: true,
    data: {
      config: config ?? null,
      certificate: cert ?? null,
      apiKeyConfigured: !!process.env.SIMPLEAPI_KEY,
    },
  });
}

export async function PUT(request: NextRequest) {
  // Try/catch global para garantizar que el cliente SIEMPRE recibe
  // JSON. Antes, si el upsert tiraba un error inesperado (por un campo
  // no mapeado al modelo Prisma, una constraint violada, etc.) el
  // handler crasheaba y la respuesta llegaba vacía → el frontend
  // mostraba "Failed to execute 'json' on 'Response': Unexpected end
  // of JSON input" sin pista del error real.
  try {
    const ctx = await requireAuth();
    if (!ctx) return unauthorized();
    const perms = await resolveApiPerms(ctx);
    if (!hasFacturacionCapability(perms, "facturacion_configure")) {
      return NextResponse.json(
        { success: false, error: "Sin permisos" },
        { status: 403 },
      );
    }

    const parsed = await parseBody(request, updateConfigSchema);
    if (parsed.error) return parsed.error;
    const data = parsed.data;

    const persistable = pickPersistableFields(data);

    // resolFecha llega como string (ISO YYYY-MM-DD) o null. Convertir a Date.
    const resolFechaDate =
      data.resolFecha === null
        ? null
        : data.resolFecha
          ? new Date(data.resolFecha)
          : undefined;

    const config = await prisma.tenantDteConfig.upsert({
      where: { tenantId: ctx.tenantId },
      create: {
        tenantId: ctx.tenantId,
        ...persistable,
        ...(resolFechaDate !== undefined ? { resolFecha: resolFechaDate } : {}),
      },
      update: {
        ...persistable,
        ...(resolFechaDate !== undefined ? { resolFecha: resolFechaDate } : {}),
      },
    });

    // El cache de TenantEmailConfig tiene TTL 5min. Sin invalidar aquí,
    // los próximos envíos seguirían usando la config vieja (alwaysBcc,
    // fromName, replyTo) hasta que expire el cache.
    invalidateTenantEmailCache(ctx.tenantId);

    return NextResponse.json({ success: true, data: config });
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error("[Finance/DTE Config] PUT crashed:", err);
    const message =
      err instanceof Error ? err.message : "Error guardando configuración DTE";
    return NextResponse.json(
      { success: false, error: message },
      { status: 500 },
    );
  }
}
