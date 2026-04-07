import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireAuth, unauthorized, parseBody } from "@/lib/api-auth";
import { ensureOpsAccess } from "@/lib/ops";
import { requireTenantModule } from "@/lib/require-module";
import { prisma } from "@/lib/prisma";
import {
  encryptBneSecret,
  invalidateBneToken,
  maskSecret,
} from "@/lib/ats/bne.service";

/**
 * GET  → returns the current BNE integration config for the tenant.
 *        Secret is never returned in plaintext; only a masked preview.
 * PATCH → upserts credentials and integration defaults.
 */

const updateSchema = z.object({
  consumerKey: z.string().trim().min(1).max(200).optional(),
  consumerSecret: z.string().trim().min(1).max(500).optional(),
  environment: z.enum(["prod", "test"]).optional(),
  rutEmpleador: z.string().trim().min(1).max(20).optional(),
  idEmpleador: z.number().int().positive().optional(),
  idUsuarioPublicador: z.number().int().positive().optional(),
  mostrarNombreEmpresa: z.boolean().optional(),
  defaultJornadaTrabajo: z.number().int().positive().optional(),
  defaultRelacionContractual: z.number().int().positive().optional(),
  defaultRangoSalarios: z.number().int().positive().optional(),
  defaultOcupacion: z.number().int().positive().optional(),
  defaultNivelCargo: z.number().int().positive().optional(),
  defaultDiasPublicacion: z.number().int().min(1).max(60).optional(),
});

export async function GET() {
  try {
    const modCheck = await requireTenantModule("ats");
    if (!modCheck.authorized) return modCheck.response;
    const ctx = await requireAuth();
    if (!ctx) return unauthorized();
    const forbidden = await ensureOpsAccess(ctx);
    if (forbidden) return forbidden;

    const row = await prisma.bneIntegration.findUnique({
      where: { tenantId: ctx.tenantId },
    });
    if (!row) {
      return NextResponse.json({
        success: true,
        data: { configured: false },
      });
    }
    return NextResponse.json({
      success: true,
      data: {
        configured: !!row.consumerKey,
        consumerKeyPreview: maskSecret(row.consumerKey),
        hasSecret: !!row.consumerSecretEncrypted,
        environment: row.environment,
        rutEmpleador: row.rutEmpleador,
        idEmpleador: row.idEmpleador,
        idUsuarioPublicador: row.idUsuarioPublicador,
        mostrarNombreEmpresa: row.mostrarNombreEmpresa,
        defaultJornadaTrabajo: row.defaultJornadaTrabajo,
        defaultRelacionContractual: row.defaultRelacionContractual,
        defaultRangoSalarios: row.defaultRangoSalarios,
        defaultOcupacion: row.defaultOcupacion,
        defaultNivelCargo: row.defaultNivelCargo,
        defaultDiasPublicacion: row.defaultDiasPublicacion,
        status: row.status,
        lastSyncAt: row.lastSyncAt,
        lastError: row.lastError,
        lastErrorAt: row.lastErrorAt,
        jobCount: row.jobCount,
      },
    });
  } catch (err) {
    console.error("[BNE] GET credentials error:", err);
    return NextResponse.json(
      { success: false, error: "Error al obtener configuración BNE" },
      { status: 500 },
    );
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const modCheck = await requireTenantModule("ats");
    if (!modCheck.authorized) return modCheck.response;
    const ctx = await requireAuth();
    if (!ctx) return unauthorized();
    const forbidden = await ensureOpsAccess(ctx);
    if (forbidden) return forbidden;

    const parsed = await parseBody(request, updateSchema);
    if (parsed.error) return parsed.error;
    const body = parsed.data;

    const data: Record<string, unknown> = {};
    if (body.consumerKey !== undefined) data.consumerKey = body.consumerKey;
    if (body.consumerSecret !== undefined) {
      data.consumerSecretEncrypted = encryptBneSecret(body.consumerSecret);
      // Force token refresh on next call.
      data.accessToken = null;
      data.tokenExpiresAt = null;
    }
    if (body.environment !== undefined) {
      data.environment = body.environment;
      data.accessToken = null;
      data.tokenExpiresAt = null;
    }
    if (body.rutEmpleador !== undefined)
      data.rutEmpleador = body.rutEmpleador.replace(/[.\s]/g, "");
    if (body.idEmpleador !== undefined) data.idEmpleador = body.idEmpleador;
    if (body.idUsuarioPublicador !== undefined)
      data.idUsuarioPublicador = body.idUsuarioPublicador;
    if (body.mostrarNombreEmpresa !== undefined)
      data.mostrarNombreEmpresa = body.mostrarNombreEmpresa;
    if (body.defaultJornadaTrabajo !== undefined)
      data.defaultJornadaTrabajo = body.defaultJornadaTrabajo;
    if (body.defaultRelacionContractual !== undefined)
      data.defaultRelacionContractual = body.defaultRelacionContractual;
    if (body.defaultRangoSalarios !== undefined)
      data.defaultRangoSalarios = body.defaultRangoSalarios;
    if (body.defaultOcupacion !== undefined)
      data.defaultOcupacion = body.defaultOcupacion;
    if (body.defaultNivelCargo !== undefined)
      data.defaultNivelCargo = body.defaultNivelCargo;
    if (body.defaultDiasPublicacion !== undefined)
      data.defaultDiasPublicacion = body.defaultDiasPublicacion;

    await prisma.bneIntegration.upsert({
      where: { tenantId: ctx.tenantId },
      create: { tenantId: ctx.tenantId, ...data },
      update: data,
    });
    invalidateBneToken(ctx.tenantId);

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("[BNE] PATCH credentials error:", err);
    return NextResponse.json(
      {
        success: false,
        error: err instanceof Error ? err.message : "Error al guardar BNE",
      },
      { status: 500 },
    );
  }
}
