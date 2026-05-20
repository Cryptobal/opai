/**
 * Cobranza Email Service — Envío de recordatorios de cobranza por email.
 *
 * Reusa el DocTemplate del slug correspondiente (cobranza_amable/firme/prejudicial).
 * Si el tenant tiene una plantilla específica para email (module="mail",
 * usageSlug=<slug>) la usa; si no, hace fallback al cuerpo del WhatsApp y lo
 * envía como text plano vía Resend.
 *
 * Fire-and-throw: si Resend no está configurado o falla, lanza para que el
 * caller registre el error en `results` del endpoint.
 */

import "server-only";
import { Resend } from "resend";
import { prisma } from "@/lib/prisma";
import {
  resolveDocument,
  tiptapToPlainText,
  type EntityData,
} from "@/lib/docs/token-resolver";
import { getTenantCompanyConfig } from "@/lib/tenant-config";
import { getTenantEmailConfig } from "@/lib/resend";

const SUBJECT_BY_SLUG = {
  cobranza_amable: "Recordatorio de pago — Factura {folio}",
  cobranza_firme: "Pago pendiente — Factura {folio}",
  cobranza_prejudicial: "Aviso pre-judicial — Factura {folio}",
} as const;

export type CobranzaSlug = keyof typeof SUBJECT_BY_SLUG;

export interface SendCobranzaEmailInput {
  tenantId: string;
  dteId: string;
  contactId: string;
  slug: CobranzaSlug;
  customMessage?: string;
  sentBy: string;
}

const resend = process.env.RESEND_API_KEY
  ? new Resend(process.env.RESEND_API_KEY)
  : null;

const FROM_COBRANZA =
  process.env.RESEND_FROM_COBRANZA ||
  process.env.EMAIL_FROM ||
  "OPAI <noreply@opai.cl>";

export async function sendCobranzaEmail(input: SendCobranzaEmailInput): Promise<void> {
  if (!resend) {
    throw new Error("Resend no configurado (RESEND_API_KEY ausente)");
  }

  const dte = await prisma.financeDte.findFirst({
    where: { id: input.dteId, tenantId: input.tenantId },
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
  if (!dte) throw new Error("DTE no encontrado");

  const contact = await prisma.crmContact.findFirst({
    where: { id: input.contactId, tenantId: input.tenantId },
    select: { firstName: true, lastName: true, email: true },
  });
  if (!contact?.email) throw new Error("Contacto sin email");

  // 1. Buscar template específica de email; si no existe, fallback al de WhatsApp.
  const tpl =
    (await prisma.docTemplate.findFirst({
      where: {
        tenantId: input.tenantId,
        module: "mail",
        usageSlug: input.slug,
        isActive: true,
      },
    })) ??
    (await prisma.docTemplate.findFirst({
      where: {
        tenantId: input.tenantId,
        module: "whatsapp",
        usageSlug: input.slug,
        isActive: true,
      },
    }));

  // 2. Resolver tokens contra el DTE/contact/account/tenant/actor.
  const tenantCfg = await getTenantCompanyConfig(input.tenantId);
  const admin = await prisma.admin.findUnique({
    where: { id: input.sentBy },
    select: { name: true, email: true, cargo: true },
  });
  const totalFmt = new Intl.NumberFormat("es-CL", {
    style: "currency",
    currency: "CLP",
    minimumFractionDigits: 0,
  }).format(Number(dte.totalAmount));
  const today = new Date();
  const due = dte.dueDate ? new Date(dte.dueDate) : null;
  const daysOverdue = due
    ? Math.max(0, Math.floor((today.getTime() - due.getTime()) / 86400000))
    : 0;

  const account = dte.crmAccountId
    ? await prisma.crmAccount.findFirst({
        where: { id: dte.crmAccountId, tenantId: input.tenantId },
      })
    : null;

  const parts = (admin?.name || "").trim().split(/\s+/);
  const actorFirst = parts.length > 0 ? parts[0] : "";
  const actorLast = parts.length > 1 ? parts.slice(1).join(" ") : "";

  const entities: EntityData = {
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
      email: admin?.email ?? "",
      roleTitle: admin?.cargo ?? "",
    },
    contact: {
      firstName: contact.firstName,
      lastName: contact.lastName,
      email: contact.email,
    },
    account: account ?? undefined,
    dte: {
      id: dte.id,
      folio: String(dte.folio),
      type: String(dte.dteType),
      date: dte.date.toISOString().slice(0, 10),
      dueDate: due ? due.toISOString().slice(0, 10) : "",
      totalAmount: Number(dte.totalAmount),
      totalAmountFormatted: totalFmt,
      receiverName: dte.receiverName,
      receiverRut: dte.receiverRut,
      daysOverdue: String(daysOverdue),
    },
  };

  // 3. Cuerpo del mail: customMessage > template resuelta > vacío.
  let body = "";
  if (input.customMessage && input.customMessage.trim().length > 0) {
    body = input.customMessage;
  } else if (tpl?.content) {
    const { resolvedContent } = resolveDocument(
      tpl.content as never,
      entities,
    );
    body = tiptapToPlainText(resolvedContent).trim();
  }

  if (!body) {
    throw new Error("Mensaje vacío — plantilla no encontrada");
  }

  const subject = SUBJECT_BY_SLUG[input.slug].replace(
    "{folio}",
    String(dte.folio),
  );

  // BCC al `emailReplyTo` del tenant (Configuración → Empresa) — mismo
  // patrón que dte-email.service: el equipo interno recibe copia oculta
  // automática de cada recordatorio de cobranza. Sin duplicar con el
  // destinatario primario.
  const emailCfg = await getTenantEmailConfig(input.tenantId);
  const adminBcc = (emailCfg.replyTo ?? "").trim();
  const primaryLower = contact.email.toLowerCase();
  const bccList =
    adminBcc &&
    /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(adminBcc) &&
    adminBcc.toLowerCase() !== primaryLower
      ? [adminBcc]
      : undefined;

  await resend.emails.send({
    from: FROM_COBRANZA,
    to: contact.email,
    bcc: bccList,
    subject,
    text: body,
  });
}
