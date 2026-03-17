import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { prisma } from "@/lib/prisma";
import { parsePortalClienteSessionCookie } from "@/lib/portal-cliente";
import { createCrmHistoryLog } from "@/lib/crm-history";

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const cookieStore = await cookies();
  const session = parsePortalClienteSessionCookie(
    cookieStore.get("portal_cliente_session")?.value
  );
  if (!session) return NextResponse.json({ error: "No session" }, { status: 401 });

  const { id } = await params;

  // Verify ownership
  const quote = await prisma.cpqQuote.findFirst({
    where: { id, accountId: session.accountId, tenantId: session.tenantId },
    select: { id: true, dealId: true },
  });

  if (!quote) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  // Update quote status
  await prisma.cpqQuote.update({
    where: { id },
    data: { status: "approved" },
  });

  const quoteWithCode = await prisma.cpqQuote.findFirst({ where: { id }, select: { code: true } });
  await createCrmHistoryLog({
    tenantId: session.tenantId,
    entityType: "quote",
    entityId: id,
    action: "quote_approved",
    details: {
      quoteCode: quoteWithCode?.code ?? null,
      source: "portal_cliente",
      contactId: session.contactId ?? null,
    },
    createdBy: null,
  });

  // Find or create "Aprobado por Cliente" pipeline stage
  let stage = await prisma.crmPipelineStage.findFirst({
    where: {
      tenantId: session.tenantId,
      name: { contains: "Aprobado" },
    },
  });

  if (!stage) {
    stage = await prisma.crmPipelineStage.create({
      data: {
        tenantId: session.tenantId,
        name: "Aprobado por Cliente",
        isActive: true,
        order: 99,
      },
    });
  }

  // Update CrmDeal stage if deal exists
  if (quote.dealId) {
    await prisma.crmDeal.update({
      where: { id: quote.dealId },
      data: { stageId: stage.id },
    });
  }

  return NextResponse.json({ success: true, quoteId: id });
}
