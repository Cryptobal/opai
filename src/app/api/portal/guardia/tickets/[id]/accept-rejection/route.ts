import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requirePortalGuardiaAuth } from "@/lib/portal-guardia-auth";

type Params = { id: string };

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<Params> },
) {
  try {
    const { id: ticketId } = await params;
    const body = await request.json();
    const { guardiaId } = body as { guardiaId?: string };

    const guardAuth = await requirePortalGuardiaAuth(guardiaId);
    if (!guardAuth) {
      return NextResponse.json({ success: false, error: "Guardia no encontrado o inactivo" }, { status: 401 });
    }

    const ticket = await prisma.opsTicket.findFirst({
      where: { id: ticketId, guardiaId: guardAuth.guardiaId, tenantId: guardAuth.tenantId },
      select: { id: true, status: true, tenantId: true },
    });

    if (!ticket) {
      return NextResponse.json({ success: false, error: "Ticket no encontrado" }, { status: 404 });
    }

    if (ticket.status !== "rejected") {
      return NextResponse.json({ success: false, error: "Solo tickets rechazados pueden cerrarse" }, { status: 400 });
    }

    const result = await prisma.opsTicket.updateMany({
      where: { id: ticketId, tenantId: ticket.tenantId },
      data: { status: "closed", closedAt: new Date() },
    });
    if (result.count === 0) {
      return NextResponse.json({ success: false, error: "Ticket no encontrado" }, { status: 404 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("[Portal] Accept rejection error:", error);
    return NextResponse.json({ success: false, error: "Error" }, { status: 500 });
  }
}
