import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { z } from "zod";

const schema = z.object({
  sessionId: z.string().uuid(),
});

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const parsed = schema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ success: false, error: "Datos inválidos" }, { status: 400 });
    }

    const result = await prisma.opsPatrullajeSesion.updateMany({
      where: { id: parsed.data.sessionId, isActive: true },
      data: { isActive: false, logoutAt: new Date() },
    });
    if (!result.count) {
      return NextResponse.json({ success: false, error: "Sesión no encontrada o ya cerrada" }, { status: 404 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("[PATROL] logout", error);
    return NextResponse.json({ success: false, error: "Error interno" }, { status: 500 });
  }
}
