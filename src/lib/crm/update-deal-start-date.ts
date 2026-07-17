/**
 * Actualiza la fecha de inicio del servicio de un negocio (OPAI ↔ Slack).
 * Sincroniza deal + onboarding (si existe) y re-renderiza la ficha de inicio en Slack.
 */

import { prisma } from "@/lib/prisma";
import { createCrmHistoryLog, computeChangedFields } from "@/lib/crm-history";

export type UpdateDealStartDateResult =
  | { kind: "not_found" }
  | { kind: "ok"; serviceStartDate: Date | null };

function parseDateOnly(raw: string): Date {
  return new Date(`${raw}T12:00:00Z`);
}

/** YYYY-MM-DD o null para limpiar. Escribe historial y refresca canvas Slack (best-effort). */
export async function updateDealStartDate(input: {
  tenantId: string;
  userId: string;
  dealId: string;
  serviceStartDate: string | null;
}): Promise<UpdateDealStartDateResult> {
  const existing = await prisma.crmDeal.findFirst({
    where: { id: input.dealId, tenantId: input.tenantId },
    select: { id: true, serviceStartDate: true },
  });
  if (!existing) return { kind: "not_found" };

  const next = input.serviceStartDate ? parseDateOnly(input.serviceStartDate) : null;
  await prisma.crmDeal.update({
    where: { id: existing.id },
    data: { serviceStartDate: next },
  });

  const onboarding = await prisma.clientOnboarding.findUnique({
    where: { dealId: existing.id },
    select: { id: true },
  });
  if (onboarding && next) {
    await prisma.clientOnboarding.update({
      where: { id: onboarding.id },
      data: { serviceStartDate: next },
    }).catch(() => {});
  }

  const diff = computeChangedFields(
    { serviceStartDate: existing.serviceStartDate },
    { serviceStartDate: next },
  );
  if (diff.changedFields.length) {
    await createCrmHistoryLog({
      tenantId: input.tenantId,
      entityType: "deal",
      entityId: existing.id,
      action: "deal_updated",
      details: { changedFields: diff.changedFields, changes: diff.changes, via: "service_start_date" },
      createdBy: input.userId,
    });
  }

  const { renderStartCanvasForDeal } = await import("@/lib/integrations/slack/deal-rooms/start-canvas");
  await renderStartCanvasForDeal(input.tenantId, existing.id).catch(() => {});

  return { kind: "ok", serviceStartDate: next };
}
