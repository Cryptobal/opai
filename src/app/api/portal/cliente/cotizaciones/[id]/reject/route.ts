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
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const cookieStore = await cookies();
  const session = parsePortalClienteSessionCookie(
    cookieStore.get("portal_cliente_session")?.value
  );
  if (!session) return NextResponse.json({ error: "No session" }, { status: 401 });

  const { id } = await params;

  // Verify ownership — include dealId for pipeline update
  const quote = await prisma.cpqQuote.findFirst({
    where: {
      id,
      accountId: session.accountId,
      tenantId: session.tenantId,
      ...cpqQuoteListedInClientPortalWhere(),
    },
    select: { id: true, code: true, dealId: true, name: true, monthlyCost: true, currency: true },
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

  // ── 1. Update quote status ──
  await prisma.cpqQuote.update({
    where: { id },
    data: {
      status: "rejected",
      ...(reason ? { notes: reason } : {}),
    },
  });

  // ── 2. Move deal to "Perdido" stage ──
  if (quote.dealId) {
    let perdidoStage = await prisma.crmPipelineStage.findFirst({
      where: {
        tenantId: session.tenantId,
        name: { contains: "Perdid", mode: "insensitive" },
      },
    });

    if (!perdidoStage) {
      perdidoStage = await prisma.crmPipelineStage.create({
        data: {
          tenantId: session.tenantId,
          name: "Perdido",
          isActive: true,
          order: 100,
        },
      });
    }

    await prisma.crmDeal.update({
      where: { id: quote.dealId },
      data: { stageId: perdidoStage.id, status: "lost" },
    });
  }

  // ── 3. Audit log ──
  await createCrmHistoryLog({
    tenantId: session.tenantId,
    entityType: "quote",
    entityId: id,
    action: "quote_rejected",
    details: {
      quoteCode: quote.code ?? null,
      source: "portal_cliente",
      contactId: session.contactId ?? null,
      reason: reason ?? null,
    },
    createdBy: null,
  });

  // ── 4. Send email notification to commercial team (tenant-aware) ──
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
      subject: `Propuesta rechazada: ${account?.name} - ${quote.code}`,
      html: `
        <h2>Propuesta Rechazada</h2>
        <p>El cliente <strong>${account?.name}</strong> (RUT: ${account?.rut ?? "N/A"}) ha rechazado la propuesta <strong>${quote.code}</strong> desde el Portal del Cliente.</p>
        <p><strong>Monto:</strong> ${quote.monthlyCost} ${quote.currency}/mes</p>
        ${reason ? `<p><strong>Motivo:</strong> ${reason}</p>` : "<p><em>No indicó motivo.</em></p>"}
        <p><strong>Contacto:</strong> ${session.firstName} ${session.lastName} (${session.email ?? "sin email"})</p>
        <p>El negocio ha sido movido a estado <strong>Perdido</strong>.</p>
      `,
      tags: [{ name: "type", value: "proposal-rejected" }],
    });
  } catch (emailErr) {
    console.error("[Portal] Error sending rejection email:", emailErr);
  }

  // ── 5. Internal bell notification (respects user preferences) ──
  try {
    await notify({
      tenantId: session.tenantId,
      type: "quote_rejected_portal",
      audience: "admin",
      title: `Propuesta rechazada: ${account?.name}`,
      body: `${account?.name} rechazó la propuesta ${quote.code}.${reason ? ` Motivo: ${reason}` : ""}`,
      link: quote.dealId ? `/crm/deals/${quote.dealId}` : `/crm/cotizaciones/${id}`,
      data: { quoteId: id, quoteCode: quote.code, dealId: quote.dealId, reason },
    });
  } catch (notifErr) {
    console.error("[Portal] Error sending rejection notification:", notifErr);
  }

  return NextResponse.json({ success: true });
}
