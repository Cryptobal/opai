/**
 * Servicios compartidos del cockpit comercial de leads en Slack (Fase 15, B1).
 *
 * Tomar / Recordar / Descartar + resolución del mensaje WhatsApp de primer
 * contacto. Cada acción usa la identidad del Admin vinculado que presiona y
 * queda scopeada al tenant resuelto por team_id (aislamiento).
 *
 * "Tomar" estampa `firstContactAt` (así corta el escalamiento — el cron
 * `lead-escalation` filtra `firstContactAt: null`), de forma ATÓMICA para que
 * dos personas no tomen el mismo lead en paralelo.
 */

import { prisma } from "@/lib/prisma";
import { getWaTemplate } from "@/lib/whatsapp-templates";
import type { EntityData } from "@/lib/docs/token-resolver";

/** Lead con los campos que el cockpit necesita para pintar y accionar. */
export interface LeadLite {
  id: string;
  firstName: string | null;
  lastName: string | null;
  companyName: string | null;
  email: string | null;
  phone: string | null;
  commune: string | null;
  city: string | null;
  address: string | null;
  industry: string | null;
  serviceType: string | null;
  status: string;
  source: string | null;
  firstContactAt: Date | null;
  firstContactBy: string | null;
}

/** Nombre legible del lead (contacto o empresa). */
export function leadDisplayName(l: { firstName?: string | null; lastName?: string | null; companyName?: string | null }): string {
  const person = `${l.firstName ?? ""} ${l.lastName ?? ""}`.trim();
  return person || l.companyName || "Lead";
}

/** Teléfono normalizado para wa.me: solo dígitos, código país 56, sin '+'. */
export function normalizeWaPhone(phone?: string | null): string | null {
  if (!phone) return null;
  const digits = phone.replace(/\D/g, "").replace(/^0+/, "");
  if (!digits) return null;
  return digits.startsWith("56") ? digits : `56${digits}`;
}

/** Nombre real del admin vinculado (scoped al tenant) para las confirmaciones. */
export async function resolveAdminName(tenantId: string, adminId: string | null | undefined): Promise<string | null> {
  if (!adminId) return null;
  const a = await prisma.admin.findFirst({ where: { id: adminId, tenantId }, select: { name: true } }).catch(() => null);
  return a?.name ?? null;
}

/** EntityData mínima para resolver la plantilla WhatsApp de primer contacto. */
function leadWaEntities(lead: LeadLite, tenantName: string | null): EntityData {
  const direccion = [lead.address, lead.commune, lead.city].filter(Boolean).join(", ");
  return {
    lead: {
      firstName: lead.firstName ?? "",
      lastName: lead.lastName ?? "",
      companyName: lead.companyName ?? "",
      address: direccion,
      commune: lead.commune ?? "",
      city: lead.city ?? "",
      email: lead.email ?? "",
      phone: lead.phone ?? "",
      industry: lead.industry ?? "",
    },
    tenant: { commercialName: tenantName ?? "" },
  };
}

/**
 * URL wa.me con el mensaje de primer contacto pre-llenado (variables
 * nombre/empresa vía la plantilla `lead_commercial` del tenant). Devuelve null
 * si el lead no tiene teléfono. Si la plantilla no existe, abre WhatsApp igual
 * (sin texto) para no bloquear el contacto.
 */
export async function resolveLeadWaUrl(tenantId: string, lead: LeadLite): Promise<string | null> {
  const phone = normalizeWaPhone(lead.phone);
  if (!phone) return null;
  const tenant = await prisma.tenant.findUnique({ where: { id: tenantId }, select: { name: true } }).catch(() => null);
  const message = await getWaTemplate(tenantId, "lead_commercial", { entities: leadWaEntities(lead, tenant?.name ?? null) }).catch(() => "");
  return `https://wa.me/${phone}?text=${encodeURIComponent((message ?? "").trim())}`;
}

interface TakeResult {
  ok: boolean;
  error?: string;
  won?: boolean; // este click ganó la carrera (era un lead sin tomar)
  name?: string;
  alreadyByName?: string | null; // si ya estaba tomado, por quién
}

/**
 * "Tomar" un lead: estampa firstContactAt/By de forma atómica (corta el
 * escalamiento). Registra la actividad. Si ya estaba tomado, informa por quién.
 */
export async function takeLead(tenantId: string, adminId: string, leadId: string): Promise<TakeResult> {
  const lead = await prisma.crmLead.findFirst({
    where: { id: leadId, tenantId },
    select: { id: true, firstName: true, lastName: true, companyName: true, firstContactBy: true, firstContactAt: true },
  });
  if (!lead) return { ok: false, error: "Lead no encontrado." };
  const name = leadDisplayName(lead);

  const claim = await prisma.crmLead.updateMany({
    where: { id: leadId, tenantId, firstContactAt: null },
    data: { firstContactAt: new Date(), firstContactBy: adminId, firstContactChannel: "slack" },
  });
  if (claim.count !== 1) {
    // Ya estaba tomado (o carrera perdida): informar por quién.
    const alreadyByName = await resolveAdminName(tenantId, lead.firstContactBy);
    return { ok: true, won: false, name, alreadyByName };
  }
  await prisma.crmHistoryLog.create({
    data: { tenantId, entityType: "lead", entityId: leadId, action: "lead_taken", details: { via: "slack" }, createdBy: adminId },
  }).catch(() => {});
  return { ok: true, won: true, name };
}

/** Crea un recordatorio (CrmTask) sobre el lead, asignado a quien presiona. */
export async function remindLead(tenantId: string, adminId: string, leadId: string, hours = 2): Promise<{ ok: boolean; error?: string; name?: string }> {
  const lead = await prisma.crmLead.findFirst({ where: { id: leadId, tenantId }, select: { firstName: true, lastName: true, companyName: true } });
  if (!lead) return { ok: false, error: "Lead no encontrado." };
  const name = leadDisplayName(lead);
  await prisma.crmTask.create({
    data: {
      tenantId, leadId, assignedTo: adminId,
      title: `Seguir lead: ${name}`, type: "followup", status: "open",
      dueAt: new Date(Date.now() + hours * 3600 * 1000),
    },
  });
  return { ok: true, name };
}

/** Descarta (rechaza) un lead con motivo. Espeja el route web (status + metadata + history). */
export async function discardLead(tenantId: string, adminId: string, leadId: string, reason: string, note?: string): Promise<{ ok: boolean; error?: string; name?: string }> {
  const lead = await prisma.crmLead.findFirst({ where: { id: leadId, tenantId }, select: { metadata: true, firstName: true, lastName: true, companyName: true, status: true } });
  if (!lead) return { ok: false, error: "Lead no encontrado." };
  if (lead.status === "approved") return { ok: false, error: "El lead ya fue aprobado." };
  const name = leadDisplayName(lead);
  const prev = (lead.metadata && typeof lead.metadata === "object" ? lead.metadata : {}) as Record<string, unknown>;
  await prisma.crmLead.update({
    where: { id: leadId },
    data: {
      status: "rejected",
      metadata: { ...prev, rejection: { reason, note: note?.trim() || null, rejectedAt: new Date().toISOString(), rejectedBy: adminId, via: "slack" } } as object,
    },
  });
  await prisma.crmHistoryLog.create({
    data: { tenantId, entityType: "lead", entityId: leadId, action: "lead_rejected", details: { reason, note: note?.trim() || null, via: "slack" }, createdBy: adminId },
  }).catch(() => {});
  return { ok: true, name };
}

/** Motivos de descarte (mismos slugs que la UI web). */
export const DISCARD_REASONS: Array<[string, string]> = [
  ["spot_service", "Servicio spot / puntual"],
  ["out_of_scope", "Fuera de cobertura"],
  ["no_budget", "Sin presupuesto"],
  ["duplicate", "Duplicado"],
  ["no_response", "Sin respuesta"],
  ["other", "Otro"],
];
