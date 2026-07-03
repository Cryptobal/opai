import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { parseBody, requireAuth, unauthorized } from "@/lib/api-auth";
import { rejectTeSchema } from "@/lib/validations/ops";
import { ensureOpsAccess } from "@/lib/ops";
import { rejectTe } from "@/lib/te-approvals";

type Params = { id: string };

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<Params> }
) {
  try {
    const ctx = await requireAuth();
    if (!ctx) return unauthorized();
    const forbidden = await ensureOpsAccess(ctx);
    if (forbidden) return forbidden;

    const { id } = await params;
    const parsed = await parseBody(request, rejectTeSchema);
    if (parsed.error) return parsed.error;
    const body = parsed.data;

    const result = await rejectTe({
      tenantId: ctx.tenantId,
      actorId: ctx.userId,
      actorEmail: ctx.userEmail,
      teId: id,
      reason: body.reason ?? null,
    });
    if (!result.ok) {
      return NextResponse.json(
        { success: false, error: result.error },
        { status: result.alreadyDecided ? 409 : 400 }
      );
    }

    const turno = await prisma.opsTurnoExtra.findFirst({ where: { id, tenantId: ctx.tenantId } });
    return NextResponse.json({ success: true, data: turno });
  } catch (error) {
    console.error("[TE] Error rejecting turno extra:", error);
    return NextResponse.json(
      { success: false, error: "No se pudo rechazar el turno extra" },
      { status: 500 }
    );
  }
}
