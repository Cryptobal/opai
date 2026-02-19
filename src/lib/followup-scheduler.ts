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
  thirdAt: Date | null;
  reason?: string;
}

/**
 * Create a UTC Date that corresponds to the given hour in Chile timezone.
 *
 * On Vercel the server runs in UTC, so `setHours(9)` would schedule at 9:00 UTC
 * instead of 9:00 Chile (CLT UTC-4 / CLST UTC-3). This function returns the
 * correct UTC timestamp for the desired Chile local time.
 */
function scheduleAtChileHour(
  baseDate: Date,
  daysToAdd: number,
  hour: number,
): Date {
  const dateParts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Santiago",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(baseDate);
  const [year, month, day] = dateParts.split("-").map(Number);

  const targetDay = new Date(Date.UTC(year, month - 1, day + daysToAdd));
  const tY = targetDay.getUTCFullYear();
  const tM = targetDay.getUTCMonth() + 1;
  const tD = targetDay.getUTCDate();

  const asUTC = new Date(
    `${tY}-${String(tM).padStart(2, "0")}-${String(tD).padStart(2, "0")}T${String(hour).padStart(2, "0")}:00:00Z`,
  );

  const chileHourStr = asUTC.toLocaleString("en-US", {
    timeZone: "America/Santiago",
    hour: "numeric",
    hour12: false,
  });
  const chileHourAtUTC = parseInt(chileHourStr, 10);
  const offsetHours = chileHourAtUTC - hour;

  return new Date(asUTC.getTime() - offsetHours * 60 * 60 * 1000);
}

/**
 * Schedule follow-up emails for a deal.
 *
 * - Upserts CrmFollowUpConfig (ensures config exists with defaults)
 * - Cancels any pending follow-ups for the same deal
 * - Creates sequence 1, 2 y 3 follow-up log entries
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
    return {
      scheduled: false,
      firstAt: null,
      secondAt: null,
      thirdAt: null,
      reason: "Sistema de seguimientos desactivado",
    };
  }

  // Cancel previous pending follow-ups for this deal
  await prisma.crmFollowUpLog.updateMany({
    where: { dealId, status: "pending" },
    data: { status: "cancelled", error: "Nueva propuesta enviada / reprogramado" },
  });

  // Schedule 1st follow-up (Chile timezone-aware)
  const firstDate = scheduleAtChileHour(
    proposalDate,
    config.firstFollowUpDays,
    config.sendHour,
  );

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

  // Schedule 2nd follow-up (Chile timezone-aware)
  const secondDate = scheduleAtChileHour(
    proposalDate,
    config.secondFollowUpDays,
    config.sendHour,
  );

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

  // Schedule 3rd follow-up (days after 2nd follow-up)
  const thirdDate = scheduleAtChileHour(
    secondDate,
    config.thirdFollowUpDays,
    config.sendHour,
  );

  await prisma.crmFollowUpLog.create({
    data: {
      tenantId,
      dealId,
      sequence: 3,
      status: "pending",
      scheduledAt: thirdDate,
      templateId: config.thirdEmailTemplateId,
    },
  });

  console.log(
    `📅 Follow-ups programados: deal ${dealId} → 1er: ${firstDate.toISOString()}, 2do: ${secondDate.toISOString()}, 3ro: ${thirdDate.toISOString()}`
  );

  return { scheduled: true, firstAt: firstDate, secondAt: secondDate, thirdAt: thirdDate };
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
