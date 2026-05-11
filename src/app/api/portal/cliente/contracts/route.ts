import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requirePortalClienteAuth } from "@/lib/portal-cliente";

/** Contract-type categories visible in the client portal */
const CONTRACT_CATEGORIES = [
  "contrato_cliente",
  "contrato_confidencialidad",
  "acuerdo_nivel_servicio",
  "adendum",
];

/**
 * GET /api/portal/cliente/contracts
 * Returns portal-visible contracts for an account.
 */
export async function GET(request: NextRequest) {
  try {
    const session = await requirePortalClienteAuth(request);
    if (!session) {
      return NextResponse.json({ error: "No autorizado" }, { status: 401 });
    }

    const { tenantId, accountId } = session;

    const documents = await prisma.document.findMany({
      where: {
        tenantId,
        module: "crm",
        category: { in: CONTRACT_CATEGORIES },
        portalVisible: true,
        associations: {
          some: {
            entityType: "crm_account",
            entityId: accountId,
          },
        },
      },
      select: {
        id: true,
        uniqueId: true,
        title: true,
        category: true,
        status: true,
        effectiveDate: true,
        expirationDate: true,
        pdfUrl: true,
        createdAt: true,
        signatureRequests: {
          select: {
            id: true,
            status: true,
            completedAt: true,
          },
          orderBy: { createdAt: "desc" },
          take: 1,
        },
      },
      orderBy: { createdAt: "desc" },
    });

    const data = documents.map((doc) => {
      const sigReq = doc.signatureRequests[0] ?? null;
      return {
        id: doc.id,
        uniqueId: doc.uniqueId,
        title: doc.title,
        category: doc.category,
        status: doc.status,
        effectiveDate: doc.effectiveDate,
        expirationDate: doc.expirationDate,
        pdfUrl: doc.pdfUrl,
        signatureStatus: sigReq?.status ?? null,
        signatureCompletedAt: sigReq?.completedAt ?? null,
        createdAt: doc.createdAt,
      };
    });

    return NextResponse.json({ success: true, data });
  } catch (error) {
    console.error("[Portal Cliente] contracts", error);
    return NextResponse.json(
      { success: false, error: "Error interno" },
      { status: 500 },
    );
  }
}
