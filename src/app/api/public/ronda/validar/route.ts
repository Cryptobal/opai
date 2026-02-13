import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET(request: NextRequest) {
  try {
    const code = request.nextUrl.searchParams.get("code");
    if (!code) {
      return NextResponse.json({ success: false, error: "Falta code" }, { status: 400 });
    }

    const installation = await prisma.crmInstallation.findFirst({
      where: { marcacionCode: code, isActive: true },
      select: {
        id: true,
        tenantId: true,
        name: true,
        commune: true,
        address: true,
      },
    });
    if (!installation) {
      return NextResponse.json({ success: false, error: "Código inválido" }, { status: 404 });
    }
    return NextResponse.json({ success: true, data: installation });
  } catch (error) {
    console.error("[RONDAS] public validar", error);
    return NextResponse.json({ success: false, error: "Error interno" }, { status: 500 });
  }
}
