import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { prisma } from "@/lib/prisma";
import { parsePortalClienteSessionCookie } from "@/lib/portal-cliente";
import { resend, EMAIL_CONFIG } from "@/lib/resend";
import { getTenantCompanyConfig } from "@/lib/tenant-config";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const cookieStore = await cookies();
  const session = parsePortalClienteSessionCookie(
    cookieStore.get("portal_cliente_session")?.value
  );
  if (!session) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  const { id: quoteId } = await params;
  const ip =
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";

  try {
    // 1. Find quote with deal (verify ownership via accountId)
    const quote = await prisma.cpqQuote.findFirst({
      where: { id: quoteId, accountId: session.accountId, tenantId: session.tenantId },
      select: {
        id: true,
        code: true,
        dealId: true,
        status: true,
        monthlyCost: true,
        currency: true,
        totalPositions: true,
        totalGuards: true,
      },
    });

    if (!quote) {
      return NextResponse.json(
        { error: "Cotización no encontrada" },
        { status: 404 }
      );
    }

    // 2. Approve the quote
    await prisma.cpqQuote.update({
      where: { id: quoteId },
      data: { status: "approved" },
    });

    // 3. Find "Ganado" pipeline stage
    const ganadoStage = await prisma.crmPipelineStage.findFirst({
      where: {
        tenantId: session.tenantId,
        name: { contains: "Ganad", mode: "insensitive" },
      },
    });

    // 4. Update deal if exists
    if (quote.dealId && ganadoStage) {
      await prisma.crmDeal.update({
        where: { id: quote.dealId },
        data: { stageId: ganadoStage.id, status: "closed" },
      });
    }

    // 5. Update account to active client
    await prisma.crmAccount.update({
      where: { id: session.accountId },
      data: { status: "client_active", isActive: true },
    });

    // 6. Create chat channels for active installations
    const installations = await prisma.crmInstallation.findMany({
      where: { accountId: session.accountId, status: "active" },
      select: { id: true, name: true },
    });

    for (const inst of installations) {
      // Public INSTALLATION channel (client + guards + Gard) — only if not exists
      const existingChannel = await prisma.chatChannel.findFirst({
        where: { installationId: inst.id },
      });
      if (!existingChannel) {
        await prisma.chatChannel.create({
          data: {
            tenantId: session.tenantId,
            channelType: "INSTALLATION",
            installationId: inst.id,
            name: inst.name,
          },
        });
      }

      // Internal GROUP channel (Gard only)
      const internalGroupId = `internal-${inst.id}`;
      const existingInternal = await prisma.chatChannel.findFirst({
        where: { tenantId: session.tenantId, groupId: internalGroupId },
      });
      if (!existingInternal) {
        await prisma.chatChannel.create({
          data: {
            tenantId: session.tenantId,
            channelType: "GROUP",
            groupId: internalGroupId,
            name: `${inst.name} (Interno)`,
          },
        });
      }
    }

    // 7. Send email notifying acceptance
    const account = await prisma.crmAccount.findUnique({
      where: { id: session.accountId },
      select: { name: true, rut: true },
    });

    const tenantConfig = await getTenantCompanyConfig(session.tenantId);

    try {
      await resend.emails.send({
        from: tenantConfig.emailFrom || EMAIL_CONFIG.from,
        to: tenantConfig.email,
        subject: `Propuesta aceptada: ${account?.name} - ${quote.code}`,
        html: `
          <h2>Propuesta Aceptada</h2>
          <p>El cliente <strong>${account?.name}</strong> (RUT: ${account?.rut ?? "N/A"}) ha aceptado la propuesta <strong>${quote.code}</strong> desde el Portal del Cliente.</p>
          <p><strong>Monto:</strong> ${quote.monthlyCost} ${quote.currency}/mes</p>
          <p><strong>Puestos:</strong> ${quote.totalPositions} | <strong>Guardias:</strong> ${quote.totalGuards}</p>
          <p><strong>Contacto:</strong> ${session.firstName} ${session.lastName} (${session.email ?? "sin email"})</p>
          <p>La cuenta ha sido activada automáticamente.</p>
        `,
        tags: [{ name: "type", value: "proposal-accepted" }],
      });
    } catch (emailErr) {
      console.error("Error sending proposal acceptance email:", emailErr);
      // Don't fail the whole request if email fails
    }

    // 8. Audit log
    try {
      await prisma.portalClienteAuditLog.create({
        data: {
          tenantId: session.tenantId,
          contactId: session.contactId,
          action: "ACCEPT_PROPOSAL",
          resource: `quote:${quoteId}`,
          metadata: { quoteCode: quote.code, dealId: quote.dealId },
          ip,
        },
      });
    } catch (auditErr) {
      console.error("Error creating audit log:", auditErr);
      // Don't fail the whole request if audit log fails
    }

    return NextResponse.json({ success: true, quoteId });
  } catch (error) {
    console.error("Error accepting proposal:", error);
    return NextResponse.json(
      { error: "Error al aceptar la propuesta" },
      { status: 500 }
    );
  }
}
