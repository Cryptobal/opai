/**
 * POST /api/finance/factoring/operations/[id]/mark-collected
 * Marca la operación como COLLECTED (cliente pagó al factoring).
 * Capability requerida: facturacion_issue.
 */

import { NextRequest, NextResponse } from "next/server";
import {
  requireAuth,
  resolveApiPerms,
  unauthorized,
} from "@/lib/api-auth";
import { hasFacturacionCapability } from "@/lib/permissions";
import { markCollected } from "@/modules/finance/factoring/operations.service";

interface RouteParams {
  params: Promise<{ id: string }>;
}

export async function POST(_request: NextRequest, { params }: RouteParams) {
  const ctx = await requireAuth();
  if (!ctx) return unauthorized();
  const perms = await resolveApiPerms(ctx);
  if (!hasFacturacionCapability(perms, "facturacion_issue")) {
    return NextResponse.json(
      { success: false, error: "Sin permisos" },
      { status: 403 },
    );
  }
  const { id } = await params;
  try {
    const operation = await markCollected(ctx.tenantId, id);
    return NextResponse.json({ success: true, operation });
  } catch (err) {
    return NextResponse.json(
      {
        success: false,
        error: err instanceof Error ? err.message : "Error en transición",
      },
      { status: 400 },
    );
  }
}
