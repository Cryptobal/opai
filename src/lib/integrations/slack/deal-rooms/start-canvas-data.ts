/**
 * Loader de datos de la Ficha de Inicio (Canvas de Slack al adjudicar).
 *
 * Loader PURO de datos (este archivo) + renderer puro de string
 * (`start-canvas-render.ts`), patrón `ficha.ts`. Toda query filtra por
 * `tenantId`. Best-effort por sección: si la cotización o los archivos no
 * cargan, se rinde la ficha sin esa sección (nunca lanza).
 */

import "server-only";
import { prisma } from "@/lib/prisma";
import { getCanonicalSiteUrl } from "@/lib/emails/site-url";
import { getPresignedDownloadUrl, getFileUrl } from "@/lib/storage";
import { ONBOARDING_PLAYBOOK_STEPS } from "@/lib/onboarding/types";
import { loadDealCard } from "./ficha";

export interface StartCanvasData {
  dealId: string;
  title: string;
  accountName: string;
  serviceStartDate: Date;
  // Condiciones (auto desde cotización aceptada + deal):
  totalGuards: number;
  positions: Array<{ name: string; weekdays: string[]; startTime: string; endTime: string; numGuards: number }>;
  cargoSueldo: Array<{ cargo: string; netSalary: number | null; baseSalary: number }>;
  amount: number;
  quoteLabel: string | null;
  mapsUrl: string | null;
  addressText: string | null;
  contact: { name: string | null; phone: string | null; email: string | null } | null;
  extras: string | null;
  // Checklist (playbook + offsets):
  steps: Array<{ title: string; team: string; dueDate: Date; isExtra: boolean }>;
  // Documentos (links, NO binarios):
  files: Array<{ fileName: string; downloadUrl: string; portalVisible: boolean }>;
  // Links:
  opaiDealUrl: string;
  quoteUrl: string | null;
  accountUrl: string;
}

/** Suma `days` a una fecha (copia; no muta el argumento). */
function addDays(base: Date, days: number): Date {
  const d = new Date(base);
  d.setDate(d.getDate() + days);
  return d;
}

/** Resuelve el link de descarga de un archivo: presignado 7 días o público. */
async function resolveDownloadUrl(storageKey: string, fileName: string): Promise<string | null> {
  try {
    return await getPresignedDownloadUrl({ storageKey, fileName, expiresInSeconds: 604800 });
  } catch {
    try {
      return getFileUrl(storageKey);
    } catch {
      return null;
    }
  }
}

/** Carga los datos de la Ficha de Inicio de un negocio, o null si no existe. */
export async function loadStartCanvasData(tenantId: string, dealId: string): Promise<StartCanvasData | null> {
  const base = getCanonicalSiteUrl();
  const card = await loadDealCard(tenantId, dealId);
  if (!card) return null;

  const deal = await prisma.crmDeal.findFirst({
    where: { id: dealId, tenantId },
    select: {
      accountId: true, activeQuotationId: true, serviceStartDate: true,
      primaryContact: { select: { firstName: true, lastName: true, phone: true, email: true } },
    },
  });
  if (!deal) return null;

  // serviceStartDate: onboarding manda; si no, el del deal (deal_won ya lo exige).
  const onboarding = await prisma.clientOnboarding
    .findUnique({ where: { dealId }, select: { serviceStartDate: true, notes: true } })
    .catch(() => null);
  const serviceStartDate = onboarding?.serviceStartDate ?? deal.serviceStartDate ?? new Date();

  // Condiciones desde la cotización activa (best-effort).
  let totalGuards = 0;
  let positions: StartCanvasData["positions"] = [];
  let cargoSueldo: StartCanvasData["cargoSueldo"] = [];
  let quoteUrl: string | null = null;
  if (deal.activeQuotationId) {
    const quote = await prisma.cpqQuote
      .findFirst({
        where: { id: deal.activeQuotationId, tenantId },
        select: {
          id: true, totalGuards: true,
          positions: {
            select: {
              customName: true, weekdays: true, startTime: true, endTime: true, numGuards: true,
              baseSalary: true, netSalary: true,
              puestoTrabajo: { select: { name: true } }, cargo: { select: { name: true } },
            },
          },
        },
      })
      .catch(() => null);
    if (quote) {
      quoteUrl = `${base}/cpq/quotes/${quote.id}`;
      totalGuards = quote.totalGuards ?? 0;
      positions = quote.positions.map((p) => ({
        name: p.customName || p.puestoTrabajo?.name || "Puesto",
        weekdays: p.weekdays ?? [],
        startTime: p.startTime ?? "", endTime: p.endTime ?? "", numGuards: p.numGuards ?? 0,
      }));
      const seen = new Set<string>();
      for (const p of quote.positions) {
        const cargo = p.cargo?.name || "Guardia";
        const baseSalary = Number(p.baseSalary ?? 0);
        const key = `${cargo}|${baseSalary}`;
        if (seen.has(key)) continue;
        seen.add(key);
        cargoSueldo.push({ cargo, netSalary: p.netSalary != null ? Number(p.netSalary) : null, baseSalary });
      }
    }
  }

  // Checklist: pasos del playbook (offsets ya negativos) + extras (pasos custom
  // del onboarding, si existe la operación).
  const steps: StartCanvasData["steps"] = ONBOARDING_PLAYBOOK_STEPS.map((s) => ({
    title: s.title, team: s.defaultAssignedTeam, dueDate: addDays(serviceStartDate, s.dueDateOffsetDays), isExtra: false,
  }));
  const customSteps = await prisma.clientOnboardingStep
    .findMany({ where: { onboarding: { dealId, tenantId }, isCustom: true }, select: { title: true } })
    .catch(() => []);
  for (const cs of customSteps) steps.push({ title: cs.title, team: "ops", dueDate: serviceStartDate, isExtra: true });

  // Documentos del negocio (links, no binarios).
  const links = await prisma.crmFileLink
    .findMany({ where: { tenantId, entityType: "deal", entityId: dealId }, include: { file: true }, orderBy: { createdAt: "desc" } })
    .catch(() => []);
  const files: StartCanvasData["files"] = [];
  for (const link of links) {
    const url = await resolveDownloadUrl(link.file.storageKey, link.file.fileName);
    if (url) files.push({ fileName: link.file.fileName, downloadUrl: url, portalVisible: link.file.portalVisible });
  }

  const contactName = deal.primaryContact
    ? [deal.primaryContact.firstName, deal.primaryContact.lastName].filter(Boolean).join(" ").trim() || null
    : null;

  return {
    dealId,
    title: card.title,
    accountName: card.accountName,
    serviceStartDate,
    totalGuards,
    positions,
    cargoSueldo,
    amount: card.amount,
    quoteLabel: card.quoteLabel,
    mapsUrl: card.mapsUrl,
    addressText: card.addressText,
    contact: deal.primaryContact
      ? { name: contactName, phone: deal.primaryContact.phone, email: deal.primaryContact.email }
      : null,
    extras: onboarding?.notes ?? null,
    steps,
    files,
    opaiDealUrl: `${base}/crm/deals/${dealId}`,
    quoteUrl,
    accountUrl: `${base}/crm/accounts/${deal.accountId}`,
  };
}
