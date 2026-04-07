import { NextResponse } from "next/server";
import { requireAuth, unauthorized } from "@/lib/api-auth";
import { ensureOpsAccess } from "@/lib/ops";
import { requireTenantModule } from "@/lib/require-module";
import { prisma } from "@/lib/prisma";
import {
  testBneConnection,
  discoverEmpleador,
} from "@/lib/ats/bne.service";

/**
 * POST /api/ops/ats/bne/test
 * - Validates the saved credentials by requesting a Bearer token from BNE.
 * - If successful and the row has a RUT but no idEmpleador yet, looks it up
 *   via GET /empresas?rut={rut} and persists it. Same for idUsuarioPublicador.
 */
export async function POST() {
  try {
    const modCheck = await requireTenantModule("ats");
    if (!modCheck.authorized) return modCheck.response;
    const ctx = await requireAuth();
    if (!ctx) return unauthorized();
    const forbidden = await ensureOpsAccess(ctx);
    if (forbidden) return forbidden;

    const result = await testBneConnection(ctx.tenantId);
    if (!result.ok) {
      return NextResponse.json(
        { success: false, error: result.error },
        { status: 400 },
      );
    }

    let discovered: {
      idEmpleador: number | null;
      idUsuario: number | null;
    } | null = null;

    const row = await prisma.bneIntegration.findUnique({
      where: { tenantId: ctx.tenantId },
      select: { rutEmpleador: true, idEmpleador: true, idUsuarioPublicador: true },
    });
    if (row?.rutEmpleador && (!row.idEmpleador || !row.idUsuarioPublicador)) {
      try {
        discovered = await discoverEmpleador(ctx.tenantId, row.rutEmpleador);
        await prisma.bneIntegration.update({
          where: { tenantId: ctx.tenantId },
          data: {
            idEmpleador: discovered.idEmpleador ?? row.idEmpleador,
            idUsuarioPublicador:
              discovered.idUsuario ?? row.idUsuarioPublicador,
          },
        });
      } catch (err) {
        // Discovery is best-effort; the token test already passed.
        return NextResponse.json({
          success: true,
          token: true,
          discoveryError:
            err instanceof Error ? err.message : "discovery failed",
        });
      }
    }

    return NextResponse.json({
      success: true,
      token: true,
      discovered,
    });
  } catch (err) {
    console.error("[BNE] test error:", err);
    return NextResponse.json(
      {
        success: false,
        error: err instanceof Error ? err.message : "Error al probar BNE",
      },
      { status: 500 },
    );
  }
}
