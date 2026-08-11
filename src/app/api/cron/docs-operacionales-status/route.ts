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

    const { readsUnified } = await import("@/lib/docs/migration");
    const tenants = await prisma.tenant.findMany({
      where: { active: true },
      select: { id: true },
    });

    let updatedCount = 0;
    let personaUpdated = 0;
    let docsLen = 0;
    let personaLen = 0;
    const now = new Date();
    const today = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));

    for (const tenant of tenants) {
      const unified = await readsUnified(tenant.id);
      if (unified) {
        const docs = await prisma.documento.findMany({
          where: {
            tenantId: tenant.id,
            status: { not: "no_aplica" },
            tipoId: { not: null },
            needsClassification: false,
          },
          include: { tipo: { select: { tieneVencimiento: true, diasAlerta: true } } },
        });
        docsLen += docs.length;
        for (const doc of docs) {
          if (!doc.tipo) continue;
          const newStatus = calcDocStatus(
            doc.expiresAt,
            doc.tipo.tieneVencimiento,
            doc.tipo.diasAlerta
          );
          if (newStatus !== doc.status) {
            await prisma.documento.update({
              where: { id: doc.id },
              data: { status: newStatus },
            });
            updatedCount++;
          }
        }
        continue;
      }

      const docs = await prisma.docOperacional.findMany({
        where: { tenantId: tenant.id, status: { not: "no_aplica" } },
        include: { tipo: { select: { tieneVencimiento: true, diasAlerta: true } } },
      });
      docsLen += docs.length;
      for (const doc of docs) {
        const newStatus = calcDocStatus(
          doc.expiresAt,
          doc.tipo.tieneVencimiento,
          doc.tipo.diasAlerta
        );
        if (newStatus !== doc.status) {
          await prisma.docOperacional.update({
            where: { id: doc.id },
            data: { status: newStatus },
          });
          updatedCount++;
        }
      }

      const personaDocs = await prisma.opsDocumentoPersona.findMany({
        where: {
          tenantId: tenant.id,
          expiresAt: { not: null },
          status: { in: ["vigente", "pendiente"] },
        },
        select: { id: true, expiresAt: true, status: true },
      });
      personaLen += personaDocs.length;
      for (const pd of personaDocs) {
        if (pd.expiresAt && pd.expiresAt <= today && pd.status !== "vencido") {
          await prisma.opsDocumentoPersona.update({
            where: { id: pd.id },
            data: { status: "vencido" },
          });
          personaUpdated++;
        }
      }
    }

    return NextResponse.json({
      success: true,
      data: {
        docsOperacionales: { checked: docsLen, updated: updatedCount },
        docsPersona: { checked: personaLen, updated: personaUpdated },
      },
    });
  } catch (error) {
    console.error("[CRON-DOCS-STATUS] Error:", error);
    return NextResponse.json({ success: false, error: "Error en cron" }, { status: 500 });
  }
}
