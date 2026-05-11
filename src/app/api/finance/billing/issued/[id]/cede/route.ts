/**
 * POST /api/finance/billing/issued/[id]/cede
 * Cede un DTE emitido a una empresa de factoring. Genera el AEC,
 * lo envía a RPETC y persiste la operación en estado SUBMITTED.
 * Capability: facturacion_issue.
 */

import { NextRequest, NextResponse } from "next/server";
import {
  parseBody,
  requireAuth,
  resolveApiPerms,
  unauthorized,
} from "@/lib/api-auth";
import { hasFacturacionCapability } from "@/lib/permissions";
import { cedeDteSchema } from "@/lib/validations/factoring";
import { cedeDte } from "@/modules/finance/factoring/cession.service";

interface RouteParams {
  params: Promise<{ id: string }>;
}

export async function POST(request: NextRequest, { params }: RouteParams) {
  const ctx = await requireAuth();
  if (!ctx) return unauthorized();
  const perms = await resolveApiPerms(ctx);
  if (!hasFacturacionCapability(perms, "facturacion_issue")) {
    return NextResponse.json(
      { success: false, error: "Sin permisos para emitir cesiones" },
      { status: 403 },
    );
  }
  const { id } = await params;
  const parsed = await parseBody(request, cedeDteSchema);
  if (parsed.error) return parsed.error;

  try {
    const result = await cedeDte(
      {
        dteId: id,
        factoringCompanyId: parsed.data.factoringCompanyId,
        fechaCesion: parsed.data.fechaCesion,
        fechaVencimiento: parsed.data.fechaVencimiento,
        advanceRate: parsed.data.advanceRate,
        interestRate: parsed.data.interestRate,
        commissionAmount: parsed.data.commissionAmount,
        emailDeudor: parsed.data.emailDeudor || undefined,
        notes: parsed.data.notes,
        contactNombre: parsed.data.contactNombre,
        contactFono: parsed.data.contactFono,
        contactEmail: parsed.data.contactEmail || undefined,
      },
      { tenantId: ctx.tenantId, userId: ctx.userId },
    );
    return NextResponse.json({ success: true, ...result }, { status: 201 });
  } catch (err) {
    return NextResponse.json(
      {
        success: false,
        error: err instanceof Error ? err.message : "Error cediendo DTE",
      },
      { status: 400 },
    );
  }
}
