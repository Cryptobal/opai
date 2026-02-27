/**
 * API Route: /api/cpq/quotes/[id]/send-email
 * POST - Send quote via email with PDF attachment
 */

import { NextRequest, NextResponse } from "next/server";
import { render } from "@react-email/render";
import { prisma } from "@/lib/prisma";
import { resend, EMAIL_CONFIG } from "@/lib/resend";
import { requireAuth, unauthorized } from "@/lib/api-auth";
import { computeCpqQuoteCosts } from "@/modules/cpq/costing/compute-quote-costs";
import { formatCurrency } from "@/lib/utils";
import { CpqQuoteEmail } from "@/emails/CpqQuoteEmail";

export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const ctx = await requireAuth();
    if (!ctx) return unauthorized();

    const { id } = await params;

    // Get quote with full context
    const quote = await prisma.cpqQuote.findFirst({
      where: { id, tenantId: ctx.tenantId },
      include: {
        positions: {
          include: { puestoTrabajo: true },
        },
        installation: true,
      },
    });

    if (!quote) {
      return NextResponse.json(
        { success: false, error: "Cotización no encontrada" },
        { status: 404 }
      );
    }

    // Validate required CRM context
    if (!quote.dealId) {
      return NextResponse.json(
        { success: false, error: "La cotización debe tener un negocio asignado" },
        { status: 400 }
      );
    }
    if (!quote.contactId) {
      return NextResponse.json(
        { success: false, error: "La cotización debe tener un contacto asignado" },
        { status: 400 }
      );
    }

    const contact = await prisma.crmContact.findUnique({
      where: { id: quote.contactId },
      select: { firstName: true, lastName: true, email: true },
    });

    if (!contact?.email) {
      return NextResponse.json(
        { success: false, error: "El contacto no tiene email" },
        { status: 400 }
      );
    }

    // Get account name
    let accountName = quote.clientName || "Cliente";
    if (quote.accountId) {
      const account = await prisma.crmAccount.findUnique({
        where: { id: quote.accountId },
        select: { name: true },
      });
      if (account) accountName = account.name;
    }

    // Get deal (negocio) name
    let dealName = "";
    if (quote.dealId) {
      const deal = await prisma.crmDeal.findUnique({
        where: { id: quote.dealId },
        select: { title: true },
      });
      if (deal) dealName = deal.title;
    }

    // Installation name
    const installationName = quote.installation?.name || "";

    // Load additional lines
    const additionalLines = await prisma.cpqQuoteAdditionalLine.findMany({
      where: { quoteId: id },
      orderBy: { orden: "asc" },
    });
    const totalAdditionalLines = additionalLines.reduce(
      (sum, l) => sum + Number(l.precio),
      0
    );

    // Compute costs
    let monthlyTotal = Number(quote.monthlyCost) || 0;
    try {
      const costs = await computeCpqQuoteCosts(id);
      monthlyTotal = costs.monthlyTotal;
    } catch {}

    const contactName = `${contact.firstName} ${contact.lastName}`.trim();
    const validUntilStr = quote.validUntil
      ? new Date(quote.validUntil).toLocaleDateString("es-CL")
      : "";

    // Generate PDF HTML (reuse export-pdf logic inline)
    const weekdaysStr = (pos: { weekdays?: string[] | null }) =>
      (pos.weekdays?.length ? pos.weekdays.join(", ") : "—");
    const shiftLabel = (startTime: string | null | undefined) => {
      if (!startTime) return "Diurno";
      const hour = parseInt(startTime.split(":")[0], 10);
      if (isNaN(hour)) return "Diurno";
      return hour >= 18 || hour < 6 ? "Nocturno" : "Diurno";
    };
    const positionsRows = quote.positions
      .map(
        (pos) =>
          `<tr><td>${pos.customName || pos.puestoTrabajo?.name || "Puesto"}</td><td>${pos.numGuards}</td><td>${pos.numPuestos || 1}</td><td>${weekdaysStr(pos)}</td><td>${pos.startTime || "-"} - ${pos.endTime || "-"}</td><td>${shiftLabel(pos.startTime) === "Nocturno" ? "🌙" : "☀️"} ${shiftLabel(pos.startTime)}</td><td class="num">${formatCurrency(Number(pos.monthlyPositionCost), "CLP")}</td></tr>`
      )
      .join("");

    const serviceDetailHtml = quote.serviceDetail
      ? `<div style="margin-top:10px"><h2 style="font-size:11px;margin-bottom:6px;color:#1a1a1a;border-bottom:1px solid #ddd;padding-bottom:4px">Detalle del servicio</h2><p style="font-size:10px;color:#333;line-height:1.5">${String(quote.serviceDetail).replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/\n/g, "<br>")}</p></div>`
      : "";

    const contextHtml = (dealName || installationName)
      ? `<div style="margin-bottom:10px;padding:6px 10px;background:#f0fdf4;border-left:3px solid #1db990;border-radius:4px;font-size:10px;color:#333">${dealName ? `<strong>Negocio:</strong> ${dealName}` : ""}${dealName && installationName ? " · " : ""}${installationName ? `<strong>Instalación:</strong> ${installationName}` : ""}</div>`
      : "";

    const pdfHtml = `<!DOCTYPE html><html lang="es"><head><meta charset="UTF-8"><title>${quote.code} - ${accountName}</title>
<style>@page{size:A4;margin:10mm}*{margin:0;padding:0;box-sizing:border-box}body{font-family:Arial,sans-serif;font-size:10px;line-height:1.3;color:#1a1a1a;padding:10px 14px;max-width:210mm}.header{display:flex;justify-content:space-between;align-items:flex-start;border-bottom:2px solid #1db990;padding-bottom:8px;margin-bottom:10px}.brand{font-size:18px;font-weight:bold;color:#1db990}.meta{text-align:right;font-size:10px;color:#444}.meta strong{display:block;font-size:12px;color:#1a1a1a;margin-bottom:2px}h2{font-size:11px;margin-bottom:6px;color:#1a1a1a;border-bottom:1px solid #ddd;padding-bottom:4px}table{width:100%;border-collapse:collapse;font-size:10px;margin-bottom:10px}th{background:#f0f0f0;padding:5px 6px;text-align:left;font-weight:600}td{padding:4px 6px;border-bottom:1px solid #eee}td.num{text-align:right;white-space:nowrap}tr.total td{font-weight:bold;border-top:2px solid #1db990;background:#f8fcfb;padding:6px;font-size:11px}.footer{margin-top:10px;padding-top:6px;border-top:1px solid #eee;text-align:center;font-size:9px;color:#888}@media print{body{padding:0}}</style></head>
<body><div class="header"><div class="brand">GARD SECURITY</div><div class="meta"><strong>${quote.code}</strong>${accountName}<br>${validUntilStr ? `Válida hasta: ${validUntilStr}` : ""}<br>Propuesta económica</div></div>
${contextHtml}
${quote.aiDescription ? `<p style="font-size:9px;color:#555;padding:6px;background:#f9f9f9;border-radius:4px;margin-bottom:10px;font-style:italic">${String(quote.aiDescription).replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/\n/g, "<br>")}</p>` : ""}
<h2>Puestos de trabajo · ${quote.totalGuards} guardia(s)</h2>
<table><thead><tr><th>Puesto</th><th>Guardias</th><th>Cantidad</th><th>Días</th><th>Horario</th><th>Turno</th><th class="num">Costo mensual</th></tr></thead><tbody>${positionsRows}${totalAdditionalLines > 0 ? `<tr><td colspan="6" style="text-align:right;font-weight:600">Subtotal guardias</td><td class="num" style="font-weight:600">${formatCurrency(monthlyTotal, "CLP")}</td></tr>` : ""}<tr class="total"><td colspan="6" style="text-align:right">Total</td><td class="num">${formatCurrency(monthlyTotal + totalAdditionalLines, "CLP")}</td></tr></tbody></table>
${additionalLines.length > 0 ? `<h2>Servicios y Productos Adicionales</h2><table><thead><tr><th>Producto / Servicio</th><th>Descripción</th><th class="num">Valor Mensual</th></tr></thead><tbody>${additionalLines.map(l => `<tr><td>${String(l.nombre).replace(/</g, "&lt;")}</td><td>${l.descripcion ? String(l.descripcion).replace(/</g, "&lt;") : "-"}</td><td class="num">${formatCurrency(Number(l.precio), "CLP")}</td></tr>`).join("")}<tr class="total"><td colspan="2" style="text-align:right">Subtotal adicionales</td><td class="num">${formatCurrency(totalAdditionalLines, "CLP")}</td></tr></tbody></table>` : ""}
${serviceDetailHtml}
<div class="footer">Generado el ${new Date().toLocaleDateString("es-CL")} · www.gard.cl · contacto@gard.cl</div>
</body></html>`;

    // Render email HTML
    const emailHtml = await render(
      CpqQuoteEmail({
        recipientName: contactName,
        companyName: accountName,
        quoteCode: quote.code,
        totalGuards: quote.totalGuards,
        totalPositions: quote.totalPositions,
        monthlyCost: formatCurrency(monthlyTotal, "CLP"),
        validUntil: validUntilStr,
        aiDescription: quote.aiDescription || "",
        serviceDetail: quote.serviceDetail || "",
        businessName: dealName,
        installationName,
      })
    );

    // Send email via Resend with PDF HTML as attachment
    const pdfBuffer = Buffer.from(pdfHtml, "utf-8");

    const emailResult = await resend.emails.send({
      from: EMAIL_CONFIG.from,
      to: contact.email,
      replyTo: EMAIL_CONFIG.replyTo,
      subject: `Propuesta económica ${quote.code} - Gard Security`,
      html: emailHtml,
      attachments: [
        {
          filename: `${quote.code}-propuesta.html`,
          content: pdfBuffer,
          contentType: "text/html",
        },
      ],
      tags: [
        { name: "type", value: "cpq-quote" },
        { name: "quote", value: quote.code },
      ],
    });

    // Update quote status to sent
    await prisma.cpqQuote.update({
      where: { id },
      data: { status: "sent" },
    });

    // Update deal proposalSentAt and schedule follow-ups
    if (quote.dealId) {
      try {
        await prisma.crmDeal.update({
          where: { id: quote.dealId },
          data: {
            proposalSentAt: new Date(),
            amount: monthlyTotal,
            totalPuestos: quote.positions.reduce(
              (s, p) => s + p.numGuards * (p.numPuestos || 1),
              0
            ),
          },
        });

        const { scheduleFollowUps } = await import("@/lib/followup-scheduler");
        await scheduleFollowUps({ tenantId: ctx.tenantId, dealId: quote.dealId });

        // Move deal to "Cotización enviada" stage
        const cotizacionStage = await prisma.crmPipelineStage.findFirst({
          where: { tenantId: ctx.tenantId, name: "Cotización enviada", isActive: true },
        });
        if (cotizacionStage) {
          const deal = await prisma.crmDeal.findFirst({ where: { id: quote.dealId } });
          if (deal && deal.stageId !== cotizacionStage.id) {
            await prisma.crmDeal.update({
              where: { id: deal.id },
              data: { stageId: cotizacionStage.id },
            });
            await prisma.crmDealStageHistory.create({
              data: { tenantId: ctx.tenantId, dealId: deal.id, fromStageId: deal.stageId, toStageId: cotizacionStage.id, changedBy: ctx.userId },
            });
          }
        }
      } catch (followUpError) {
        console.error("Error scheduling follow-ups from send-email:", followUpError);
      }
    }

    // Log in CRM history
    await prisma.crmHistoryLog.create({
      data: {
        tenantId: ctx.tenantId,
        entityType: "quote",
        entityId: id,
        action: "quote_sent",
        details: {
          to: contact.email,
          contactName,
          quoteCode: quote.code,
          emailId: emailResult?.data?.id || null,
        },
        createdBy: ctx.userId,
      },
    });

    return NextResponse.json({
      success: true,
      data: {
        emailId: emailResult?.data?.id,
        sentTo: contact.email,
      },
    });
  } catch (error) {
    console.error("Error sending CPQ quote email:", error);
    return NextResponse.json(
      { success: false, error: "Failed to send email" },
      { status: 500 }
    );
  }
}
