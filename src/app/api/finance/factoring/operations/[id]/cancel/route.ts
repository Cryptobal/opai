/**
 * POST /api/finance/factoring/operations/[id]/cancel
 * Cancela una operación de factoring. Body: { reason: string }.
 * Capability requerida: facturacion_issue.
 */

import { NextRequest, NextResponse } from "next/server";
import {
  parseBody,
  requireAuth,
  resolveApiPerms,
  unauthorized,
} from "@/lib/api-auth";
import { hasFacturacionCapability } from "@/lib/permissions";
import { cancelOperationSchema } from "@/lib/validations/factoring";
import { cancelOperation } from "@/modules/finance/factoring/operations.service";

interface RouteParams {
  params: Promise<{ id: string }>;
}

export async function POST(request: NextRequest, { params }: RouteParams) {
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
  const parsed = await parseBody(request, cancelOperationSchema);
  if (parsed.error) return parsed.error;
  try {
    const operation = await cancelOperation(ctx.tenantId, id, parsed.data.reason);
    return NextResponse.json({ success: true, operation });
  } catch (err) {
    return NextResponse.json(
      {
        success: false,
        error: err instanceof Error ? err.message : "Error cancelando",
      },
      { status: 400 },
    );
  }
}
