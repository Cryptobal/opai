import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth, unauthorized } from "@/lib/api-auth";
import { requireCpqEdit } from "@/lib/api-auth-cpq";
import { createCrmHistoryLog } from "@/lib/crm-history";
import { getTenantEmailConfig } from "@/lib/resend";
import { resend } from "@/lib/resend";
import { render } from "@react-email/render";
import { VisitaTecnicaSupervisorEmail } from "@/emails/VisitaTecnicaSupervisorEmail";
import { requireTenantModule } from '@/lib/require-module';

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const modCheck = await requireTenantModule('cpq');
    if (!modCheck.authorized) return modCheck.response;

    const { id: quoteId } = await params;
    const ctx = await requireAuth();
    if (!ctx) return unauthorized();
    const forbidden = await requireCpqEdit(ctx);
    if (forbidden) return forbidden;

    const body = await request.json();
    const { supervisorIds, supervisorId: legacySupervisorId, scheduledAt, contactName, contactPhone } = body as {
      supervisorIds?: string[];
      supervisorId?: string;
      scheduledAt: string;
      contactName: string;
      contactPhone: string;
    };

    // Soportar tanto supervisorIds (array) como supervisorId (string legacy)
    const resolvedSupervisorIds: string[] = supervisorIds?.length
      ? supervisorIds
      : legacySupervisorId
        ? [legacySupervisorId]
        : [];

    if (resolvedSupervisorIds.length === 0 || !scheduledAt) {
      return NextResponse.json(
        { success: false, error: "Al menos un supervisor y scheduledAt son requeridos" },
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

    // Validar supervisores
    const allSupervisors = await prisma.admin.findMany({
      where: { id: { in: resolvedSupervisorIds }, tenantId: ctx.tenantId, status: "active" },
      select: { id: true, name: true, email: true },
    });

    if (allSupervisors.length === 0) {
      return NextResponse.json(
        { success: false, error: "Ningún supervisor válido encontrado" },
        { status: 404 }
      );
    }

    // El primer supervisor seleccionado será el asignado a la visita
    const primarySupervisor = allSupervisors.find((s) => s.id === resolvedSupervisorIds[0]) ?? allSupervisors[0];

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

    // Crear visita técnica programada (asignada al supervisor principal)
    const visita = await prisma.opsVisitaTecnica.create({
      data: {
        tenantId: ctx.tenantId,
        userId: primarySupervisor.id,
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

    const portalUrl = `${process.env.NEXT_PUBLIC_APP_URL || process.env.NEXT_PUBLIC_SITE_URL || ""}/portal/supervisor`;

    // Enviar email a todos los supervisores seleccionados
    const emailConfig = await getTenantEmailConfig(ctx.tenantId);
    const supervisorResults: Array<{ name: string; email: string; emailSent: boolean }> = [];

    for (const sup of allSupervisors) {
      let sent = false;
      try {
        const html = await render(
          VisitaTecnicaSupervisorEmail({
            supervisorName: sup.name,
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
          to: sup.email,
          subject: `Visita técnica programada — ${installation.name}`,
          html,
        });
        sent = true;
      } catch (emailError) {
        console.error(`[solicitar-visita-tecnica] Error enviando email a ${sup.email}:`, emailError);
      }
      supervisorResults.push({ name: sup.name, email: sup.email, emailSent: sent });
    }

    const anyEmailSent = supervisorResults.some((s) => s.emailSent);
    const supervisorNames = allSupervisors.map((s) => s.name).join(", ");

    // Historial en la cotización
    await createCrmHistoryLog({
      tenantId: ctx.tenantId,
      entityType: "quote",
      entityId: quoteId,
      action: "quote_visita_tecnica_programada",
      details: {
        visitaId: visita.id,
        supervisorId: primarySupervisor.id,
        supervisorName: primarySupervisor.name,
        supervisorEmail: primarySupervisor.email,
        notifiedSupervisors: supervisorResults.map((s) => ({ name: s.name, email: s.email })),
        scheduledAt,
        installationName: installation.name,
        contactName: contactName || null,
        emailSent: anyEmailSent,
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
        supervisorId: primarySupervisor.id,
        supervisorName: primarySupervisor.name,
        notifiedSupervisors: supervisorResults.map((s) => ({ name: s.name, email: s.email })),
        scheduledAt,
        contactName: contactName || null,
        emailSent: anyEmailSent,
      },
      createdBy: ctx.userId,
    });

    // Construir URL de Google Calendar
    const startDate = new Date(scheduledAt);
    const endDate = new Date(startDate.getTime() + 90 * 60 * 1000); // 1.5h duración
    const formatGCalDate = (d: Date) => d.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
    const gcalDates = `${formatGCalDate(startDate)}/${formatGCalDate(endDate)}`;

    const puestosLines = puestosDetail.map((p) =>
      `• ${p.name}${p.cargo ? ` — ${p.cargo}` : ""}: ${p.numGuards} guardia${p.numGuards !== 1 ? "s" : ""} · ${p.startTime}–${p.endTime}`
    ).join("\n");
    const gcalDetails = [
      `Cotización: ${quote.code}`,
      "",
      "Dotación solicitada:",
      puestosLines,
      "",
      contactName ? `Contacto: ${contactName}` : "",
      contactPhone ? `Teléfono: ${contactPhone}` : "",
      "",
      `Supervisores notificados: ${allSupervisors.map((s) => s.name).join(", ")}`,
      "",
      `Portal supervisor: ${portalUrl}`,
    ].filter(Boolean).join("\n");

    const gcalGuests = allSupervisors.map((s) => s.email).join(",");

    const googleCalendarUrl = new URL("https://calendar.google.com/calendar/render");
    googleCalendarUrl.searchParams.set("action", "TEMPLATE");
    googleCalendarUrl.searchParams.set("text", `Visita Técnica — ${installation.name}`);
    googleCalendarUrl.searchParams.set("dates", gcalDates);
    googleCalendarUrl.searchParams.set("details", gcalDetails);
    if (installation.address) googleCalendarUrl.searchParams.set("location", installation.address);
    googleCalendarUrl.searchParams.set("add", gcalGuests);

    return NextResponse.json({
      success: true,
      data: {
        visitaId: visita.id,
        supervisorName: primarySupervisor.name,
        supervisorEmail: primarySupervisor.email,
        supervisors: supervisorResults,
        installationName: installation.name,
        installationAddress: installation.address ?? null,
        mapsUrl,
        contactName: contactName || null,
        contactPhone: contactPhone || null,
        scheduledAt,
        quoteCode: quote.code,
        puestosDetail,
        emailSent: anyEmailSent,
        googleCalendarUrl: googleCalendarUrl.toString(),
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
