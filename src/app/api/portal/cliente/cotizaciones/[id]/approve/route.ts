import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { prisma } from "@/lib/prisma";
import { parsePortalClienteSessionCookie } from "@/lib/portal-cliente";
import { createCrmHistoryLog } from "@/lib/crm-history";
import { cpqQuoteListedInClientPortalWhere } from "@/lib/cpq-portal-visibility";
import { resend } from "@/lib/resend";
import { getTenantCompanyConfig } from "@/lib/tenant-config";
import { notify } from "@/lib/notifications/notify";

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

  // Verify ownership — include more fields for notifications
  const quote = await prisma.cpqQuote.findFirst({
    where: {
      id,
      accountId: session.accountId,
      tenantId: session.tenantId,
      ...cpqQuoteListedInClientPortalWhere(),
    },
    select: { id: true, code: true, dealId: true, monthlyCost: true, currency: true },
  });

  if (!quote) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  // ── 1. Update quote status ──
  await prisma.cpqQuote.update({
    where: { id },
    data: { status: "approved" },
  });

  // ── 2. Audit log ──
  await createCrmHistoryLog({
    tenantId: session.tenantId,
    entityType: "quote",
    entityId: id,
    action: "quote_approved",
    details: {
      quoteCode: quote.code ?? null,
      source: "portal_cliente",
      contactId: session.contactId ?? null,
    },
    createdBy: null,
  });

  // ── 3. Find or create "Aprobado por Cliente" pipeline stage ──
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

  // ── 4. Update CrmDeal stage if deal exists ──
  if (quote.dealId) {
    await prisma.crmDeal.update({
      where: { id: quote.dealId },
      data: { stageId: stage.id },
    });
  }

  // ── 5. Send email notification (tenant-aware) ──
  const account = await prisma.crmAccount.findUnique({
    where: { id: session.accountId },
    select: { name: true, rut: true },
  });

  const tenantConfig = await getTenantCompanyConfig(session.tenantId);

  try {
    await resend.emails.send({
      from: tenantConfig.emailFrom,
      to: tenantConfig.email,
      replyTo: tenantConfig.emailReplyTo,
      subject: `Cotización aprobada: ${account?.name} - ${quote.code}`,
      html: `
        <h2>Cotización Aprobada</h2>
        <p>El cliente <strong>${account?.name}</strong> (RUT: ${account?.rut ?? "N/A"}) ha aprobado la cotización <strong>${quote.code}</strong> desde el Portal del Cliente.</p>
        <p><strong>Monto:</strong> ${quote.monthlyCost} ${quote.currency}/mes</p>
        <p><strong>Contacto:</strong> ${session.firstName} ${session.lastName} (${session.email ?? "sin email"})</p>
      `,
      tags: [{ name: "type", value: "quote-approved" }],
    });
  } catch (emailErr) {
    console.error("[Portal] Error sending approval email:", emailErr);
  }

  // ── 6. Internal bell notification ──
  try {
    await notify({
      tenantId: session.tenantId,
      type: "quote_approved_portal",
      audience: "admin",
      title: `Cotización aprobada: ${account?.name}`,
      body: `${account?.name} aprobó la cotización ${quote.code} (${quote.monthlyCost} ${quote.currency}/mes).`,
      link: quote.dealId ? `/crm/deals/${quote.dealId}` : `/crm/cotizaciones/${id}`,
      data: { quoteId: id, quoteCode: quote.code, dealId: quote.dealId },
    });
  } catch (notifErr) {
    console.error("[Portal] Error sending approval notification:", notifErr);
  }

  return NextResponse.json({ success: true, quoteId: id });
}
