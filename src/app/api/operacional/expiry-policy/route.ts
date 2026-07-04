/**
 * API Route: /api/operacional/expiry-policy
 * GET/PATCH - Política global de recordatorios de vencimiento del tenant
 * (Fase 18): hora del digest, tope diario de tarjetas, escalamiento on/off y
 * cadencia post-vencido. Persiste en Setting `docs_expiry_policy:{tenantId}`.
 */

import { NextRequest, NextResponse } from "next/server";
import { requireAuth, unauthorized } from "@/lib/api-auth";
import { ensureOpsAccess } from "@/lib/ops";
import { getExpiryPolicy, setExpiryPolicy } from "@/lib/documents/expiry-engine";

export async function GET() {
  try {
    const ctx = await requireAuth();
    if (!ctx) return unauthorized();
    const forbidden = await ensureOpsAccess(ctx);
    if (forbidden) return forbidden;

    const policy = await getExpiryPolicy(ctx.tenantId);
    return NextResponse.json({ success: true, data: policy });
  } catch (error) {
    console.error("[EXPIRY-POLICY] Error:", error);
    return NextResponse.json({ success: false, error: "Error al obtener la política" }, { status: 500 });
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const ctx = await requireAuth();
    if (!ctx) return unauthorized();
    const forbidden = await ensureOpsAccess(ctx);
    if (forbidden) return forbidden;

    const body = await request.json();
    const digestHour = body.digestHour !== undefined ? Number(body.digestHour) : undefined;
    if (digestHour !== undefined && (!Number.isInteger(digestHour) || digestHour < 0 || digestHour > 23)) {
      return NextResponse.json({ success: false, error: "digestHour debe estar entre 0 y 23" }, { status: 400 });
    }
    const maxCardsPerDay = body.maxCardsPerDay !== undefined ? Number(body.maxCardsPerDay) : undefined;
    if (maxCardsPerDay !== undefined && (!Number.isInteger(maxCardsPerDay) || maxCardsPerDay < 0 || maxCardsPerDay > 50)) {
      return NextResponse.json({ success: false, error: "maxCardsPerDay debe estar entre 0 y 50" }, { status: 400 });
    }
    const postExpiryCadenceDays =
      body.postExpiryCadenceDays !== undefined ? Number(body.postExpiryCadenceDays) : undefined;
    if (
      postExpiryCadenceDays !== undefined &&
      (!Number.isInteger(postExpiryCadenceDays) || postExpiryCadenceDays < 1 || postExpiryCadenceDays > 90)
    ) {
      return NextResponse.json(
        { success: false, error: "postExpiryCadenceDays debe estar entre 1 y 90" },
        { status: 400 }
      );
    }

    const policy = await setExpiryPolicy(ctx.tenantId, {
      digestHour,
      maxCardsPerDay,
      postExpiryCadenceDays,
      escalationEnabled:
        body.escalationEnabled !== undefined ? !!body.escalationEnabled : undefined,
    });
    return NextResponse.json({ success: true, data: policy });
  } catch (error) {
    console.error("[EXPIRY-POLICY] Error updating:", error);
    return NextResponse.json({ success: false, error: "Error al guardar la política" }, { status: 500 });
  }
}
