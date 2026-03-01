import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET(request: NextRequest) {
  try {
    const sessionId = request.nextUrl.searchParams.get("sessionId");
    const guardiaId = request.nextUrl.searchParams.get("guardiaId");

    if (!sessionId && !guardiaId) {
      return NextResponse.json({ success: false, error: "sessionId o guardiaId requerido" }, { status: 400 });
    }

    const session = await prisma.opsPatrullajeSesion.findFirst({
      where: {
        isActive: true,
        ...(sessionId ? { id: sessionId } : {}),
        ...(guardiaId ? { guardiaId } : {}),
      },
      include: {
        guardia: {
          select: {
            id: true,
            persona: { select: { firstName: true, lastName: true } },
          },
        },
        installation: { select: { id: true, name: true } },
      },
    });

    if (!session) {
      return NextResponse.json({ success: false, error: "Sin sesión activa" }, { status: 404 });
    }

    return NextResponse.json({ success: true, data: session });
  } catch (error) {
    console.error("[PATROL] session", error);
    return NextResponse.json({ success: false, error: "Error interno" }, { status: 500 });
  }
}
