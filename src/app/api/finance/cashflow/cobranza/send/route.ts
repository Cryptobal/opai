/**
 * POST /api/finance/cashflow/cobranza/send
 *
 * Envía recordatorio de cobranza multicanal por destinatario:
 *   - whatsapp: wa.me (default) o Twilio si cobranzaWhatsappAutoEnabled
 *   - email: HTML + PDF vía Resend
 *   - both: ambos canales por contacto seleccionado
 *
 * Actualiza cobranzaSentAt / cobranzaSentCount / cobranzaLastLevel en el DTE.
 */

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireAuth, unauthorized, parseBody, resolveApiPerms } from "@/lib/api-auth";
import { hasCapability } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import { sendCobranzaEmail } from "@/modules/finance/billing/cobranza-email.service";
import { sendCobranzaWhatsApp } from "@/modules/finance/billing/cobranza-whatsapp.service";
import type { CobranzaSlug } from "@/modules/finance/billing/cobranza-shared";

const sendSchema = z.object({
  dteId: z.string().uuid(),
  channel: z.enum(["whatsapp", "email", "both"]),
  contactIds: z.array(z.string().uuid()).min(1),
  slug: z.enum(["cobranza_amable", "cobranza_firme", "cobranza_prejudicial"]),
  customMessage: z.string().optional(),
});

interface SendResult {
  contactId: string;
  channel: "whatsapp" | "email";
  ok: boolean;
  error?: string;
  waUrl?: string;
  messageSid?: string;
  emailMessageId?: string;
}

async function markCobranzaSent(
  tenantId: string,
  dteId: string,
  slug: CobranzaSlug,
  anyOk: boolean,
) {
  if (!anyOk) return;
  await prisma.financeDte.updateMany({
    where: { id: dteId, tenantId },
    data: {
      cobranzaSentAt: new Date(),
      cobranzaLastLevel: slug,
      cobranzaSentCount: { increment: 1 },
    },
  });
}

export async function POST(req: NextRequest) {
  const ctx = await requireAuth();
  if (!ctx) return unauthorized();

  const perms = await resolveApiPerms(ctx);
  if (!hasCapability(perms, "cashflow_view")) {
    return NextResponse.json({ success: false, error: "Sin permisos" }, { status: 403 });
  }

  const parsed = await parseBody(req, sendSchema);
  if (parsed.error) return parsed.error;
  const { dteId, channel, contactIds, slug, customMessage } = parsed.data;

  const dte = await prisma.financeDte.findFirst({
    where: { id: dteId, tenantId: ctx.tenantId },
    select: {
      id: true,
      paymentStatus: true,
    },
  });
  if (!dte) {
    return NextResponse.json({ success: false, error: "DTE no encontrado" }, { status: 404 });
  }

  if (dte.paymentStatus === "PAID" || dte.paymentStatus === "CEDED") {
    return NextResponse.json(
      {
        success: false,
        error: "El DTE ya está pagado o cedido — no requiere cobranza",
      },
      { status: 400 },
    );
  }

  const admin = await prisma.admin.findUnique({
    where: { id: ctx.userId },
    select: { name: true },
  });
  const actorName = admin?.name ?? ctx.userEmail ?? "Sistema";

  const results: SendResult[] = [];

  for (const contactId of contactIds) {
    const contact = await prisma.crmContact.findFirst({
      where: { id: contactId, tenantId: ctx.tenantId },
      select: { id: true, email: true, phone: true },
    });
    if (!contact) {
      results.push({
        contactId,
        channel: channel === "email" ? "email" : "whatsapp",
        ok: false,
        error: "Contacto no encontrado",
      });
      continue;
    }

    if (channel === "whatsapp" || channel === "both") {
      if (!contact.phone) {
        results.push({
          contactId,
          channel: "whatsapp",
          ok: false,
          error: "Contacto sin teléfono",
        });
      } else {
        const wa = await sendCobranzaWhatsApp({
          tenantId: ctx.tenantId,
          dteId,
          contactId,
          slug,
          customMessage,
          sentBy: ctx.userId,
          actorEmail: ctx.userEmail,
        });
        results.push({
          contactId,
          channel: "whatsapp",
          ok: wa.ok,
          error: wa.error,
          waUrl: wa.waUrl,
          messageSid: wa.messageSid,
        });
      }
    }

    if (channel === "email" || channel === "both") {
      if (!contact.email) {
        results.push({
          contactId,
          channel: "email",
          ok: false,
          error: "Contacto sin email",
        });
      } else {
        const mail = await sendCobranzaEmail({
          tenantId: ctx.tenantId,
          dteId,
          contactId,
          slug,
          customMessage,
          sentBy: ctx.userId,
        });
        results.push({
          contactId,
          channel: "email",
          ok: mail.ok,
          error: mail.error,
          emailMessageId: mail.messageId,
        });
      }
    }
  }

  const anyOk = results.some((r) => r.ok);
  await markCobranzaSent(ctx.tenantId, dteId, slug, anyOk);

  try {
    await prisma.financeAuditLog.create({
      data: {
        tenantId: ctx.tenantId,
        userId: ctx.userId,
        userName: actorName,
        action: "COBRANZA_SENT",
        entityType: "FinanceDte",
        entityId: dteId,
        newData: { channel, contactIds, slug, results } as never,
      },
    });
  } catch (err) {
    console.warn("[cobranza/send] audit log error:", err);
  }

  return NextResponse.json({ success: anyOk, data: { results } });
}
