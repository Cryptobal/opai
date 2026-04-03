import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requirePortalGuardiaAuth } from "@/lib/portal-guardia-auth";
import type { GuardDocument } from "@/lib/guard-portal";

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const guardiaId = searchParams.get("guardiaId");
    const guardAuth = await requirePortalGuardiaAuth(guardiaId);
    if (!guardAuth) {
      return NextResponse.json(
        { success: false, error: "Guardia no encontrado o inactivo" },
        { status: 401 },
      );
    }

    const documents = await prisma.opsDocumentoPersona.findMany({
      where: { guardiaId: guardAuth.guardiaId, tenantId: guardAuth.tenantId },
      orderBy: { createdAt: "desc" },
    });

    const data: GuardDocument[] = documents.map((d) => ({
      id: d.id,
      title: d.type, // Document type serves as the title (e.g. "contrato", "liquidacion")
      type: d.type,
      createdAt: d.createdAt instanceof Date ? d.createdAt.toISOString() : String(d.createdAt),
      url: d.fileUrl ?? null,
    }));

    return NextResponse.json({ success: true, data });
  } catch (error) {
    console.error("[Portal Guardia] Documents error:", error);
    return NextResponse.json(
      { success: false, error: "Error al obtener documentos" },
      { status: 500 },
    );
  }
}
