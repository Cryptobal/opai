import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { prisma } from "@/lib/prisma";
import { parsePortalClienteSessionCookie } from "@/lib/portal-cliente";
import { createCrmHistoryLog } from "@/lib/crm-history";
import { cpqQuoteListedInClientPortalWhere } from "@/lib/cpq-portal-visibility";

export async function POST(
  request: Request,
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
    where: {
      id,
      accountId: session.accountId,
      tenantId: session.tenantId,
      ...cpqQuoteListedInClientPortalWhere(),
    },
    select: { id: true },
  });

  if (!quote) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  let reason: string | undefined;
  try {
    const body = await request.json();
    reason = body.reason;
  } catch {
    // No body or invalid JSON — reason is optional
  }

  await prisma.cpqQuote.update({
    where: { id },
    data: {
      status: "rejected",
      ...(reason ? { notes: reason } : {}),
    },
  });

  const quoteWithCode = await prisma.cpqQuote.findFirst({ where: { id }, select: { code: true } });
  await createCrmHistoryLog({
    tenantId: session.tenantId,
    entityType: "quote",
    entityId: id,
    action: "quote_rejected",
    details: {
      quoteCode: quoteWithCode?.code ?? null,
      source: "portal_cliente",
      contactId: session.contactId ?? null,
      reason: reason ?? null,
    },
    createdBy: null,
  });

  return NextResponse.json({ success: true });
}
