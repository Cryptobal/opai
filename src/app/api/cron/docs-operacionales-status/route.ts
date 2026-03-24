import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { calcDocStatus } from "@/lib/docs-operacionales";

/**
 * Cron: Recalcula status de documentos operacionales basado en expiresAt.
 * Protegido con CRON_SECRET.
 */
export async function GET(request: NextRequest) {
  try {
    const authHeader = request.headers.get("authorization");
    const cronSecret = process.env.CRON_SECRET;

    if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
      return NextResponse.json({ success: false, error: "No autorizado" }, { status: 401 });
    }

    // 1. Update DocOperacional statuses
    const docs = await prisma.docOperacional.findMany({
      where: { status: { not: "no_aplica" } },
      include: { tipo: { select: { tieneVencimiento: true, diasAlerta: true } } },
    });

    let updatedCount = 0;
    for (const doc of docs) {
      const newStatus = calcDocStatus(doc.expiresAt, doc.tipo.tieneVencimiento, doc.tipo.diasAlerta);
      if (newStatus !== doc.status) {
        await prisma.docOperacional.update({
          where: { id: doc.id },
          data: { status: newStatus },
        });
        updatedCount++;
      }
    }

    // 2. Update OpsDocumentoPersona statuses (basic: vigente/vencido based on expiresAt)
    const personaDocs = await prisma.opsDocumentoPersona.findMany({
      where: {
        expiresAt: { not: null },
        status: { in: ["vigente", "pendiente"] },
      },
      select: { id: true, expiresAt: true, status: true },
    });

    const now = new Date();
    const today = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
    let personaUpdated = 0;

    for (const pd of personaDocs) {
      if (pd.expiresAt && pd.expiresAt <= today && pd.status !== "vencido") {
        await prisma.opsDocumentoPersona.update({
          where: { id: pd.id },
          data: { status: "vencido" },
        });
        personaUpdated++;
      }
    }

    return NextResponse.json({
      success: true,
      data: {
        docsOperacionales: { checked: docs.length, updated: updatedCount },
        docsPersona: { checked: personaDocs.length, updated: personaUpdated },
      },
    });
  } catch (error) {
    console.error("[CRON-DOCS-STATUS] Error:", error);
    return NextResponse.json({ success: false, error: "Error en cron" }, { status: 500 });
  }
}
