/**
 * Shared utility for scheduling automatic follow-up emails.
 *
 * Used by:
 *   - /api/cpq/quotes/[id]/send-presentation (after sending presentation)
 *   - /api/cpq/quotes/[id]/send-email (after sending quote email)
 *   - /api/presentations/send-email (legacy presentation flow)
 *   - /api/crm/deals/[id]/stage (manual move to "Cotización enviada")
 *
 * Ensures follow-ups are scheduled consistently from ANY entry point.
 */

import { prisma } from "@/lib/prisma";

interface ScheduleFollowUpsOptions {
  tenantId: string;
  dealId: string;
  /** Date when the proposal was sent. Defaults to now. */
  proposalDate?: Date;
}

interface ScheduleFollowUpsResult {
  scheduled: boolean;
  firstAt: Date | null;
  secondAt: Date | null;
  reason?: string;
}

/**
 * Schedule follow-up emails for a deal.
 *
 * - Upserts CrmFollowUpConfig (ensures config exists with defaults)
 * - Cancels any pending follow-ups for the same deal
 * - Creates sequence 1 and sequence 2 follow-up log entries
 * - Idempotent: safe to call multiple times (cancels previous, creates new)
 */
export async function scheduleFollowUps(
  opts: ScheduleFollowUpsOptions
): Promise<ScheduleFollowUpsResult> {
  const { tenantId, dealId, proposalDate = new Date() } = opts;

  const config = await prisma.crmFollowUpConfig.upsert({
    where: { tenantId },
    update: {},
    create: { tenantId },
  });

  if (!config.isActive) {
    return { scheduled: false, firstAt: null, secondAt: null, reason: "Sistema de seguimientos desactivado" };
  }

  // Cancel previous pending follow-ups for this deal
  await prisma.crmFollowUpLog.updateMany({
    where: { dealId, status: "pending" },
    data: { status: "cancelled", error: "Nueva propuesta enviada / reprogramado" },
  });

  // Schedule 1st follow-up
  const firstDate = new Date(proposalDate);
  firstDate.setDate(firstDate.getDate() + config.firstFollowUpDays);
  firstDate.setHours(config.sendHour, 0, 0, 0);

  await prisma.crmFollowUpLog.create({
    data: {
      tenantId,
      dealId,
      sequence: 1,
      status: "pending",
      scheduledAt: firstDate,
      templateId: config.firstEmailTemplateId,
    },
  });

  // Schedule 2nd follow-up
  const secondDate = new Date(proposalDate);
  secondDate.setDate(secondDate.getDate() + config.secondFollowUpDays);
  secondDate.setHours(config.sendHour, 0, 0, 0);

  await prisma.crmFollowUpLog.create({
    data: {
      tenantId,
      dealId,
      sequence: 2,
      status: "pending",
      scheduledAt: secondDate,
      templateId: config.secondEmailTemplateId,
    },
  });

  console.log(
    `📅 Follow-ups programados: deal ${dealId} → 1er: ${firstDate.toISOString()}, 2do: ${secondDate.toISOString()}`
  );

  return { scheduled: true, firstAt: firstDate, secondAt: secondDate };
}

/**
 * Cancel all pending follow-ups for a deal.
 * Used when a deal is closed (won/lost), manually paused, etc.
 */
export async function cancelPendingFollowUps(
  dealId: string,
  reason = "Cancelado manualmente"
): Promise<number> {
  const result = await prisma.crmFollowUpLog.updateMany({
    where: { dealId, status: "pending" },
    data: { status: "cancelled", error: reason },
  });
  return result.count;
}

/**
 * Pause all pending follow-ups for a deal (can be resumed later).
 */
export async function pauseFollowUps(
  dealId: string,
  reason = "Pausado manualmente"
): Promise<number> {
  const result = await prisma.crmFollowUpLog.updateMany({
    where: { dealId, status: "pending" },
    data: { status: "paused", error: reason },
  });
  return result.count;
}

/**
 * Resume paused follow-ups for a deal.
 */
export async function resumeFollowUps(dealId: string): Promise<number> {
  const result = await prisma.crmFollowUpLog.updateMany({
    where: { dealId, status: "paused" },
    data: { status: "pending", error: null },
  });
  return result.count;
}
