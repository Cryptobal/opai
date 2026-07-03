import { NextRequest, NextResponse } from "next/server";
import { requireAuth, unauthorized, resolveApiPerms, parseBody } from "@/lib/api-auth";
import { hasCapability } from "@/lib/permissions";
import { approveRendicion } from "@/lib/rendiciones-approvals";
import { z } from "zod";

type Params = { id: string };

const approveSchema = z.object({
  comment: z.string().max(500).optional(),
});

// ── POST: approve rendicion (delega en el servicio compartido) ──

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
        { success: false, error: "Sin permisos para aprobar rendiciones" },
        { status: 403 },
      );
    }

    const { id } = await params;

    const parsed = await parseBody(request, approveSchema);
    if (parsed.error) return parsed.error;

    const result = await approveRendicion({
      tenantId: ctx.tenantId,
      actorId: ctx.userId,
      actorName: ctx.userEmail,
      rendicionId: id,
      comment: parsed.data.comment ?? null,
    });
    if (!result.ok) {
      return NextResponse.json(
        { success: false, error: result.error },
        { status: result.alreadyDecided ? 409 : 400 },
      );
    }

    return NextResponse.json({ success: true, data: { id, status: "APPROVED", code: result.code } });
  } catch (error) {
    console.error("[Finance] Error approving rendicion:", error);
    return NextResponse.json(
      { success: false, error: "No se pudo aprobar la rendición" },
      { status: 500 },
    );
  }
}
