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
import { canView, hasCapability } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";

const updateConfigSchema = z.object({
  provider: z.enum(["SIMPLEAPI", "SIMPLEFACTURA", "STUB"]).optional(),
  environment: z.enum(["CERTIFICATION", "PRODUCTION"]).optional(),
  isActive: z.boolean().optional(),
  emisorRut: z.string().regex(/^\d{1,8}-[\dKk]$/, "RUT inválido").optional(),
  emisorRazonSocial: z.string().max(200).optional(),
  emisorGiro: z.string().max(200).optional(),
  emisorActeco: z.number().int().nullable().optional(),
  emisorDireccion: z.string().max(200).optional(),
  emisorComuna: z.string().max(80).optional(),
  emisorCiudad: z.string().max(80).optional(),
  emisorTelefono: z.string().max(40).optional(),
  emisorEmail: z.string().email().optional(),
  resolNumero: z.number().int().nullable().optional(),
  resolFecha: z.string().nullable().optional(),
  // Logo del emisor en base64 (PNG/JPG) para el PDF del DTE.
  // Se acepta tanto data URL ("data:image/png;base64,...") como base64
  // crudo. El frontend puede mandar cualquiera de los dos formatos.
  // Tope de 800KB en base64 (~600KB binario) para no inflar TenantDteConfig
  // ni los PDFs generados.
  logoBase64: z
    .string()
    .max(800 * 1024, "Logo demasiado grande (máx 800KB en base64)")
    .nullable()
    .optional(),
});

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
  const ctx = await requireAuth();
  if (!ctx) return unauthorized();
  const perms = await resolveApiPerms(ctx);
  if (!hasCapability(perms, "rendicion_configure")) {
    return NextResponse.json(
      { success: false, error: "Sin permisos" },
      { status: 403 }
    );
  }

  const parsed = await parseBody(request, updateConfigSchema);
  if (parsed.error) return parsed.error;
  const data = parsed.data;

  const { resolFecha, ...rest } = data;
  const resolFechaDate =
    resolFecha === null ? null : resolFecha ? new Date(resolFecha) : undefined;

  const config = await prisma.tenantDteConfig.upsert({
    where: { tenantId: ctx.tenantId },
    create: {
      tenantId: ctx.tenantId,
      ...rest,
      ...(resolFechaDate !== undefined ? { resolFecha: resolFechaDate } : {}),
    },
    update: {
      ...rest,
      ...(resolFechaDate !== undefined ? { resolFecha: resolFechaDate } : {}),
    },
  });

  return NextResponse.json({ success: true, data: config });
}
