/**
 * POST /api/finance/cashflow/cobranza/send
 *
 * Envía un recordatorio de cobranza para un DTE en estado INVOICED desde la
 * celda del flujo de caja. Soporta tres canales: whatsapp, email o ambos.
 * Para WhatsApp, devuelve URLs `wa.me/...` que el cliente abre en pestañas
 * nuevas. Para email, despacha vía Resend usando la infra existente.
 *
 * Guardrail: rechaza DTEs ya pagados (PAID) o cedidos (CEDED).
 */

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireAuth, unauthorized, parseBody, resolveApiPerms } from "@/lib/api-auth";
import { hasCapability } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import { getWaTemplateAndUrl } from "@/lib/whatsapp-templates";
import { getTenantCompanyConfig } from "@/lib/tenant-config";
import { sendCobranzaEmail } from "@/modules/finance/billing/cobranza-email.service";

const sendSchema = z.object({
  dteId: z.string().uuid(),
  channel: z.enum(["whatsapp", "email", "both"]),
  contactIds: z.array(z.string().uuid()).min(1),
  slug: z.enum(["cobranza_amable", "cobranza_firme", "cobranza_prejudicial"]),
  /** Mensaje editado por el usuario antes de enviar (sobreescribe el template). */
  customMessage: z.string().optional(),
});

type CobranzaSlug = "cobranza_amable" | "cobranza_firme" | "cobranza_prejudicial";

interface SendResult {
  contactId: string;
  channel: "whatsapp" | "email";
  ok: boolean;
  error?: string;
  waUrl?: string;
}

export async function POST(req: NextRequest) {
  const ctx = await requireAuth();
  if (!ctx) return unauthorized();

  const perms = await resolveApiPerms(ctx);
  if (!hasCapability(perms, "cashflow_view")) {
    return NextResponse.json(
      { success: false, error: "Sin permisos" },
      { status: 403 },
    );
  }

  const parsed = await parseBody(req, sendSchema);
  if (parsed.error) return parsed.error;
  const { dteId, channel, contactIds, slug, customMessage } = parsed.data;

  const dte = await prisma.financeDte.findFirst({
    where: { id: dteId, tenantId: ctx.tenantId },
    select: {
      id: true,
      paymentStatus: true,
      siiStatus: true,
      crmAccountId: true,
    },
  });
  if (!dte) {
    return NextResponse.json(
      { success: false, error: "DTE no encontrado" },
      { status: 404 },
    );
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

  // Resolver tenant config para fallback del sender de email
  const tenantCfg = await getTenantCompanyConfig(ctx.tenantId);

  // Resolver el actor (para nombre del usuario en el audit log)
  const admin = await prisma.admin.findUnique({
    where: { id: ctx.userId },
    select: { name: true },
  });
  const actorName = admin?.name ?? ctx.userEmail ?? "Sistema";

  const results: SendResult[] = [];

  for (const contactId of contactIds) {
    const contact = await prisma.crmContact.findFirst({
      where: { id: contactId, tenantId: ctx.tenantId },
      select: {
        id: true,
        firstName: true,
        lastName: true,
        email: true,
        phone: true,
      },
    });

    if (!contact) {
      // Si el canal incluye WhatsApp registramos el fallo en ese canal; si
      // sólo era email, lo mismo. Para "both" registramos un fallo único.
      const ch: "whatsapp" | "email" = channel === "email" ? "email" : "whatsapp";
      results.push({
        contactId,
        channel: ch,
        ok: false,
        error: "Contacto no encontrado",
      });
      continue;
    }

    if (channel === "whatsapp" || channel === "both") {
      try {
        // Normalización mínima del teléfono (mismo criterio que resolve-template).
        const raw = contact.phone || "";
        const digits = raw.replace(/\D/g, "");
        let phone: string | null = null;
        if (digits.length === 9) phone = `56${digits}`;
        else if (digits.length === 11 && digits.startsWith("56")) phone = digits;
        else if (digits.length >= 10) phone = digits;

        // Si el usuario editó el mensaje, lo enviamos como override directo
        // en la URL wa.me. De lo contrario, resolvemos el template DocTemplate
        // del slug para que use los tokens reales del DTE/cliente.
        let message: string;
        let url: string;
        if (customMessage && customMessage.trim().length > 0) {
          const text = encodeURIComponent(customMessage.trim());
          url = phone
            ? `https://wa.me/${phone}?text=${text}`
            : `https://wa.me/?text=${text}`;
          message = customMessage;
        } else {
          // Re-armar entities como lo hace /api/whatsapp/resolve-template
          // para que tokens {{dte.*}}, {{contact.*}}, {{account.*}}, etc.
          // se resuelvan correctamente.
          const dteFull = await prisma.financeDte.findFirst({
            where: { id: dteId, tenantId: ctx.tenantId },
            select: {
              id: true,
              folio: true,
              dteType: true,
              date: true,
              dueDate: true,
              totalAmount: true,
              receiverName: true,
              receiverRut: true,
              crmAccountId: true,
            },
          });
          const totalFmt = new Intl.NumberFormat("es-CL", {
            style: "currency",
            currency: "CLP",
            minimumFractionDigits: 0,
          }).format(Number(dteFull?.totalAmount ?? 0));
          const today = new Date();
          const due = dteFull?.dueDate ? new Date(dteFull.dueDate) : null;
          const daysOverdue = due
            ? Math.max(0, Math.floor((today.getTime() - due.getTime()) / 86400000))
            : 0;
          const account = dteFull?.crmAccountId
            ? await prisma.crmAccount.findFirst({
                where: { id: dteFull.crmAccountId, tenantId: ctx.tenantId },
              })
            : null;
          const parts = (admin?.name || "").trim().split(/\s+/);
          const actorFirst = parts.length > 0 ? parts[0] : "";
          const actorLast = parts.length > 1 ? parts.slice(1).join(" ") : "";

          const entities = {
            tenant: {
              commercialName: tenantCfg.commercialName,
              website: tenantCfg.website,
              phone: tenantCfg.phone,
              email: tenantCfg.email,
              whatsappLink: tenantCfg.whatsappLink,
            },
            actor: {
              firstName: actorFirst,
              lastName: actorLast,
              name: admin?.name ?? "",
              email: ctx.userEmail,
            },
            contact,
            account: account ?? undefined,
            dte: dteFull
              ? {
                  id: dteFull.id,
                  folio: String(dteFull.folio),
                  type: String(dteFull.dteType),
                  date: dteFull.date.toISOString().slice(0, 10),
                  dueDate: due ? due.toISOString().slice(0, 10) : "",
                  totalAmount: Number(dteFull.totalAmount),
                  totalAmountFormatted: totalFmt,
                  receiverName: dteFull.receiverName,
                  receiverRut: dteFull.receiverRut,
                  daysOverdue: String(daysOverdue),
                }
              : null,
          };

          const resolved = await getWaTemplateAndUrl(ctx.tenantId, slug, {
            entities: entities as never,
            phone,
          });
          message = resolved.message;
          url = resolved.url;
        }

        results.push({
          contactId,
          channel: "whatsapp",
          ok: true,
          waUrl: url,
        });
        // message is part of the wa.me URL — no need to surface separately.
        void message;
      } catch (err) {
        results.push({
          contactId,
          channel: "whatsapp",
          ok: false,
          error: err instanceof Error ? err.message : String(err),
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
        continue;
      }
      try {
        await sendCobranzaEmail({
          tenantId: ctx.tenantId,
          dteId,
          contactId,
          slug: slug as CobranzaSlug,
          customMessage,
          sentBy: ctx.userId,
        });
        results.push({ contactId, channel: "email", ok: true });
      } catch (err) {
        results.push({
          contactId,
          channel: "email",
          ok: false,
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }
  }

  // Audit log — best effort, no rompe el envío si falla.
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

  return NextResponse.json({ success: true, data: { results } });
}
