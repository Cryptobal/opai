import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { parseBody, requireAuth, unauthorized } from "@/lib/api-auth";
import { ensureOpsAccess } from "@/lib/ops";
import { approveTe } from "@/lib/te-approvals";
import { aprobarTeSchema } from "@/lib/validations/ops";

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

    const parsed = await parseBody(request, aprobarTeSchema);
    if (parsed.error) return parsed.error;
    const body = parsed.data;

    const result = await approveTe({
      tenantId: ctx.tenantId,
      actorId: ctx.userId,
      actorEmail: ctx.userEmail,
      teId: id,
      amountClp: body.amountClp !== undefined ? Number(body.amountClp) : undefined,
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
    console.error("[TE] Error approving turno extra:", error);
    return NextResponse.json(
      { success: false, error: "No se pudo aprobar el turno extra" },
      { status: 500 }
    );
  }
}
