import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

type Params = { id: string };

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<Params> },
) {
  try {
    const { id: ticketId } = await params;
    const body = await request.json();
    const { guardiaId } = body as { guardiaId?: string };

    if (!guardiaId) {
      return NextResponse.json({ success: false, error: "guardiaId requerido" }, { status: 400 });
    }

    const ticket = await prisma.opsTicket.findFirst({
      where: { id: ticketId, guardiaId },
      select: { id: true, status: true },
    });

    if (!ticket) {
      return NextResponse.json({ success: false, error: "Ticket no encontrado" }, { status: 404 });
    }

    if (ticket.status !== "rejected") {
      return NextResponse.json({ success: false, error: "Solo tickets rechazados pueden cerrarse" }, { status: 400 });
    }

    await prisma.opsTicket.update({
      where: { id: ticketId },
      data: { status: "closed", closedAt: new Date() },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("[Portal] Accept rejection error:", error);
    return NextResponse.json({ success: false, error: "Error" }, { status: 500 });
  }
}
