/**
 * Cobranza WhatsApp Service — wa.me manual + Twilio automático.
 *
 * Con `cobranzaWhatsappAutoEnabled=false` (default) devuelve URL wa.me para
 * que el operador abra WhatsApp Web. Con el flag activo en
 * FinanceCashflowConfig, envía vía Twilio (texto plano con el mensaje
 * resuelto del DocTemplate).
 */

import "server-only";
import Twilio from "twilio";
import { prisma } from "@/lib/prisma";
import { getWaTemplateAndUrl } from "@/lib/whatsapp-templates";
import { getTenantCompanyConfig } from "@/lib/tenant-config";
import {
  resolveDocument,
  tiptapToPlainText,
  type EntityData,
} from "@/lib/docs/token-resolver";
import type { CobranzaSlug } from "./cobranza-shared";

function trimEnv(v: string | undefined): string | undefined {
  return v?.trim() || undefined;
}

function accountSid() {
  return trimEnv(process.env.TWILIO_ACCOUNT_SID);
}
function authToken() {
  return trimEnv(process.env.TWILIO_AUTH_TOKEN);
}
function fromNumber() {
  return trimEnv(process.env.TWILIO_WHATSAPP_FROM);
}
function messagingServiceSid() {
  return trimEnv(process.env.TWILIO_MESSAGING_SERVICE_SID);
}

let twilioClient: Twilio.Twilio | null = null;

function getTwilioClient(): Twilio.Twilio | null {
  const sid = accountSid();
  const token = authToken();
  if (!sid || !token) return null;
  if (!twilioClient) twilioClient = Twilio(sid, token);
  return twilioClient;
}

/** Normaliza teléfono chileno a E.164 (+56XXXXXXXXX). */
export function normalizeCobranzaPhone(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const digits = raw.replace(/\D/g, "");
  if (digits.length === 9 && digits.startsWith("9")) return `+56${digits}`;
  if (digits.length === 11 && digits.startsWith("56")) return `+${digits}`;
  if (digits.length >= 10) return digits.startsWith("+") ? digits : `+${digits}`;
  if (digits.length === 8) return `+569${digits}`;
  return null;
}

/** Dígitos para wa.me (sin +). */
export function phoneForWaMe(raw: string | null | undefined): string | null {
  const e164 = normalizeCobranzaPhone(raw);
  if (!e164) return null;
  return e164.replace(/\D/g, "");
}

export interface SendCobranzaWhatsAppInput {
  tenantId: string;
  dteId: string;
  contactId: string;
  slug: CobranzaSlug;
  customMessage?: string;
  sentBy: string;
  actorEmail?: string | null;
}

export interface CobranzaWhatsAppResult {
  ok: boolean;
  /** Modo manual: URL wa.me para abrir en pestaña nueva. */
  waUrl?: string;
  /** Modo Twilio: SID del mensaje enviado. */
  messageSid?: string;
  error?: string;
  mode: "wame" | "twilio";
}

async function buildEntities(
  tenantId: string,
  dteId: string,
  contactId: string,
  sentBy: string,
  actorEmail?: string | null,
): Promise<{ entities: EntityData; contact: { firstName: string | null; lastName: string | null; phone: string | null } }> {
  const dte = await prisma.financeDte.findFirst({
    where: { id: dteId, tenantId },
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
    where: { id: contactId, tenantId },
    select: { firstName: true, lastName: true, phone: true },
  });
  if (!contact) throw new Error("Contacto no encontrado");

  const tenantCfg = await getTenantCompanyConfig(tenantId);
  const admin = await prisma.admin.findUnique({
    where: { id: sentBy },
    select: { name: true, email: true, cargo: true },
  });
  const account = dte.crmAccountId
    ? await prisma.crmAccount.findFirst({
        where: { id: dte.crmAccountId, tenantId },
      })
    : null;

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
  const parts = (admin?.name || "").trim().split(/\s+/);

  const entities: EntityData = {
    tenant: {
      commercialName: tenantCfg.commercialName,
      website: tenantCfg.website,
      phone: tenantCfg.phone,
      email: tenantCfg.email,
      whatsappLink: tenantCfg.whatsappLink,
    },
    actor: {
      firstName: parts[0] ?? "",
      lastName: parts.length > 1 ? parts.slice(1).join(" ") : "",
      name: admin?.name ?? "",
      email: admin?.email ?? actorEmail ?? "",
      roleTitle: admin?.cargo ?? "",
    },
    contact: {
      firstName: contact.firstName,
      lastName: contact.lastName,
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

  return { entities, contact };
}

async function resolveMessage(
  tenantId: string,
  slug: CobranzaSlug,
  customMessage: string | undefined,
  entities: EntityData,
): Promise<string> {
  if (customMessage?.trim()) return customMessage.trim();

  const tpl =
    (await prisma.docTemplate.findFirst({
      where: { tenantId, module: "whatsapp", usageSlug: slug, isActive: true },
    })) ??
    (await prisma.docTemplate.findFirst({
      where: { tenantId, module: "mail", usageSlug: slug, isActive: true },
    }));

  if (tpl?.content) {
    const { resolvedContent } = resolveDocument(tpl.content as never, entities);
    const text = tiptapToPlainText(resolvedContent).trim();
    if (text) return text;
  }

  return "";
}

export async function sendCobranzaWhatsApp(
  input: SendCobranzaWhatsAppInput,
): Promise<CobranzaWhatsAppResult> {
  const { entities, contact } = await buildEntities(
    input.tenantId,
    input.dteId,
    input.contactId,
    input.sentBy,
    input.actorEmail,
  );

  const message = await resolveMessage(
    input.tenantId,
    input.slug,
    input.customMessage,
    entities,
  );
  if (!message) {
    return { ok: false, error: "Mensaje vacío — plantilla no encontrada", mode: "wame" };
  }

  const cfg = await prisma.financeCashflowConfig.findUnique({
    where: { tenantId: input.tenantId },
    select: { cobranzaWhatsappAutoEnabled: true },
  });
  const autoTwilio = cfg?.cobranzaWhatsappAutoEnabled === true;

  const waPhone = phoneForWaMe(contact.phone);
  if (!waPhone && autoTwilio) {
    return { ok: false, error: "Contacto sin teléfono válido", mode: "twilio" };
  }

  if (!autoTwilio) {
    const { url } = await getWaTemplateAndUrl(input.tenantId, input.slug, {
      entities,
      phone: waPhone,
    });
    const finalUrl =
      input.customMessage?.trim()
        ? `https://wa.me/${waPhone ?? ""}?text=${encodeURIComponent(message)}`.replace(
            "https://wa.me/?",
            waPhone ? `https://wa.me/${waPhone}?` : "https://wa.me/?",
          )
        : url;
    return { ok: true, waUrl: finalUrl, mode: "wame" };
  }

  const client = getTwilioClient();
  const from = fromNumber();
  const msSid = messagingServiceSid();
  if (!client || (!from && !msSid)) {
    return { ok: false, error: "Twilio no configurado", mode: "twilio" };
  }

  const e164 = normalizeCobranzaPhone(contact.phone);
  if (!e164) {
    return { ok: false, error: "Teléfono inválido para Twilio", mode: "twilio" };
  }

  try {
    const params: Parameters<typeof client.messages.create>[0] = {
      to: `whatsapp:${e164}`,
      body: message,
    };
    if (msSid) params.messagingServiceSid = msSid;
    else params.from = from!;
    const msg = await client.messages.create(params);
    return { ok: true, messageSid: msg.sid, mode: "twilio" };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : String(err),
      mode: "twilio",
    };
  }
}
