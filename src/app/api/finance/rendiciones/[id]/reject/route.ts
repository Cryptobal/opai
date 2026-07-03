import { NextRequest, NextResponse } from "next/server";
import { requireAuth, unauthorized, resolveApiPerms, parseBody } from "@/lib/api-auth";
import { hasCapability } from "@/lib/permissions";
import { rejectRendicion } from "@/lib/rendiciones-approvals";
import { z } from "zod";

type Params = { id: string };

const rejectSchema = z.object({
  reason: z.string().min(1, "Motivo de rechazo es obligatorio").max(500),
});

// ── POST: reject rendicion (delega en el servicio compartido) ──

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<Params> },
) {
  try {
    const ctx = await requireAuth();
    if (!ctx) return unauthorized();
    const perms = await resolveApiPerms(ctx);

    if (!hasCapability(perms, "rendicion_approve")) {
      return NextResponse.json(
        { success: false, error: "Sin permisos para rechazar rendiciones" },
        { status: 403 },
      );
    }

    const { id } = await params;

    const parsed = await parseBody(request, rejectSchema);
    if (parsed.error) return parsed.error;

    const result = await rejectRendicion({
      tenantId: ctx.tenantId,
      actorId: ctx.userId,
      actorName: ctx.userEmail,
      rendicionId: id,
      reason: parsed.data.reason,
    });
    if (!result.ok) {
      return NextResponse.json(
        { success: false, error: result.error },
        { status: result.alreadyDecided ? 409 : 400 },
      );
    }

    return NextResponse.json({ success: true, data: { id, status: "REJECTED", code: result.code } });
  } catch (error) {
    console.error("[Finance] Error rejecting rendicion:", error);
    return NextResponse.json(
      { success: false, error: "No se pudo rechazar la rendición" },
      { status: 500 },
    );
  }
}
