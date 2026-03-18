import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth, unauthorized } from "@/lib/api-auth";
import { requireCpqEdit } from "@/lib/api-auth-cpq";
import { createCrmHistoryLog } from "@/lib/crm-history";
import { getTenantEmailConfig } from "@/lib/resend";
import { resend } from "@/lib/resend";
import { render } from "@react-email/render";
import { VisitaTecnicaSupervisorEmail } from "@/emails/VisitaTecnicaSupervisorEmail";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: quoteId } = await params;
    const ctx = await requireAuth();
    if (!ctx) return unauthorized();
    const forbidden = await requireCpqEdit(ctx);
    if (forbidden) return forbidden;

    const body = await request.json();
    const { supervisorId, scheduledAt, contactName, contactPhone } = body as {
      supervisorId: string;
      scheduledAt: string;
      contactName: string;
      contactPhone: string;
    };

    if (!supervisorId || !scheduledAt) {
      return NextResponse.json(
        { success: false, error: "supervisorId y scheduledAt son requeridos" },
        { status: 400 }
      );
    }

    // Cargar cotización con instalación, cuenta, deal y puestos
    const quote = await prisma.cpqQuote.findFirst({
      where: { id: quoteId, tenantId: ctx.tenantId },
      include: {
        installation: {
          select: { id: true, name: true, address: true, lat: true, lng: true },
        },
        positions: {
          include: {
            puestoTrabajo: { select: { name: true } },
            cargo: { select: { name: true } },
          },
          orderBy: { createdAt: "asc" },
        },
      },
    });

    if (!quote) {
      return NextResponse.json(
        { success: false, error: "Cotización no encontrada" },
        { status: 404 }
      );
    }

    if (!quote.installationId || !quote.installation) {
      return NextResponse.json(
        { success: false, error: "La cotización debe estar vinculada a una instalación (Contexto CRM)" },
        { status: 422 }
      );
    }

    if (!quote.accountId) {
      return NextResponse.json(
        { success: false, error: "La cotización debe estar vinculada a una cuenta (Contexto CRM)" },
        { status: 422 }
      );
    }

    if (quote.positions.length === 0) {
      return NextResponse.json(
        { success: false, error: "La cotización no tiene puestos" },
        { status: 422 }
      );
    }

    // Validar supervisor
    const supervisor = await prisma.admin.findFirst({
      where: { id: supervisorId, tenantId: ctx.tenantId, status: "active" },
      select: { id: true, name: true, email: true },
    });

    if (!supervisor) {
      return NextResponse.json(
        { success: false, error: "Supervisor no encontrado" },
        { status: 404 }
      );
    }

    // Construir resumen de puestos para guardar
    const puestosDetail = quote.positions.map((p) => ({
      name: p.customName || p.puestoTrabajo?.name || "Puesto",
      cargo: p.cargo?.name || null,
      numGuards: p.numGuards,
      numPuestos: p.numPuestos,
      startTime: p.startTime,
      endTime: p.endTime,
      weekdays: p.weekdays,
    }));

    // Crear visita técnica programada
    const visita = await prisma.opsVisitaTecnica.create({
      data: {
        tenantId: ctx.tenantId,
        userId: supervisorId,
        installationId: quote.installationId,
        accountId: quote.accountId,
        dealId: quote.dealId ?? undefined,
        quoteId: quoteId,
        status: "programada",
        scheduledAt: new Date(scheduledAt),
        scheduledContact: contactName || undefined,
        scheduledPhone: contactPhone || undefined,
        puestosDetail: puestosDetail,
      },
    });

    // Construir link Google Maps
    const { installation } = quote;
    const mapsUrl = installation.address
      ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(installation.address)}`
      : installation.lat != null && installation.lng != null
        ? `https://www.google.com/maps?q=${installation.lat},${installation.lng}`
        : null;

    const portalUrl = `${process.env.NEXT_PUBLIC_APP_URL || "https://opai.gard.cl"}/portal/supervisor`;

    // Enviar email al supervisor
    let emailSent = false;
    try {
      const emailConfig = await getTenantEmailConfig(ctx.tenantId);
      const html = await render(
        VisitaTecnicaSupervisorEmail({
          supervisorName: supervisor.name,
          installationName: installation.name,
          installationAddress: installation.address ?? null,
          mapsUrl,
          scheduledAt: new Date(scheduledAt),
          contactName: contactName || null,
          contactPhone: contactPhone || null,
          quoteCode: quote.code,
          puestosDetail,
          portalUrl,
          solicitadoPor: ctx.userEmail,
        })
      );
      await resend.emails.send({
        from: emailConfig.from,
        to: supervisor.email,
        subject: `Visita técnica programada — ${installation.name}`,
        html,
      });
      emailSent = true;
    } catch (emailError) {
      console.error("[solicitar-visita-tecnica] Error enviando email:", emailError);
    }

    // Historial en la cotización
    await createCrmHistoryLog({
      tenantId: ctx.tenantId,
      entityType: "quote",
      entityId: quoteId,
      action: "quote_visita_tecnica_programada",
      details: {
        visitaId: visita.id,
        supervisorId: supervisor.id,
        supervisorName: supervisor.name,
        supervisorEmail: supervisor.email,
        scheduledAt,
        installationName: installation.name,
        contactName: contactName || null,
        emailSent,
      },
      createdBy: ctx.userId,
    });

    // Historial en la instalación
    await createCrmHistoryLog({
      tenantId: ctx.tenantId,
      entityType: "installation",
      entityId: quote.installationId,
      action: "visita_tecnica_programada",
      details: {
        visitaId: visita.id,
        quoteId,
        quoteCode: quote.code,
        supervisorId: supervisor.id,
        supervisorName: supervisor.name,
        scheduledAt,
        contactName: contactName || null,
        emailSent,
      },
      createdBy: ctx.userId,
    });

    return NextResponse.json({
      success: true,
      data: {
        visitaId: visita.id,
        supervisorName: supervisor.name,
        supervisorEmail: supervisor.email,
        installationAddress: installation.address ?? null,
        scheduledAt,
        emailSent,
      },
    });
  } catch (error) {
    console.error("[solicitar-visita-tecnica] Error:", error);
    return NextResponse.json(
      { success: false, error: "Error al crear la visita técnica" },
      { status: 500 }
    );
  }
}
