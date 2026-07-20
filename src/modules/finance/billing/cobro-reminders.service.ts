/**
 * Motor de recordatorios de confirmación de cobro (cron diario).
 *
 * Reenvía la proforma / estado de pago mientras el cliente no confirme,
 * con escalones en DÍAS HÁBILES (+3 / +7 / +12 desde el envío original) y un
 * tope de 3 recordatorios. Se detiene solo ante aprobación, observación, OC
 * ya ingresada, emisión al SII o token expirado.
 *
 * Limitación conocida: "día hábil" = lunes a viernes (date-fns). No considera
 * feriados chilenos.
 */

import "server-only";
import { differenceInBusinessDays } from "date-fns";
import { prisma } from "@/lib/prisma";
import { sendBillingDocument } from "@/modules/finance/billing/billing-document-send.service";
import type {
  BillingDocVariant,
} from "@/modules/finance/billing/billing-document-send.service";
import type { DraftAdditionalReference } from "@/modules/finance/billing/dte-draft.service";

/** Escalones (días hábiles desde el envío original) para los 3 recordatorios. */
export const REMINDER_STEPS_BIZ_DAYS = [3, 7, 12] as const;

/** ¿Toca el recordatorio N (0-based) según los días hábiles transcurridos? */
export function isCobroReminderDue(now: Date, sentAt: Date, count: number): boolean {
  if (count < 0 || count >= REMINDER_STEPS_BIZ_DAYS.length) return false;
  return differenceInBusinessDays(now, sentAt) >= REMINDER_STEPS_BIZ_DAYS[count];
}

/** Campos del DTE que necesita el evaluador (subset testeable sin Prisma). */
export interface ReminderCandidate {
  folio: number;
  siiStatus: string;
  cobroReminderCount: number;
  clientActionToken: string | null;
  clientActionTokenExp: Date | null;
  additionalReferences: unknown;
  requireProforma: boolean;
  requireEstadoPago: boolean;
  proformaStatus: string;
  estadoPagoStatus: string;
  proformaSentAt: Date | null;
  estadoPagoSentAt: Date | null;
}

export type ReminderDecision =
  | { action: "send"; variant: BillingDocVariant; index: number }
  | { action: "skip"; reason: string };

const PENDING = new Set(["SENT", "VIEWED"]);

/**
 * Decide si un candidato debe recibir recordatorio ahora. Pura y determinista
 * (solo depende de `now`): los cortes (aprobado/observado/OC/emitido/expirado)
 * viven acá para poder testearlos sin BD.
 */
export function evaluateCobroReminder(
  dte: ReminderCandidate,
  now: Date,
): ReminderDecision {
  if (dte.folio > 0 || dte.siiStatus !== "DRAFT")
    return { action: "skip", reason: "already_issued" };
  if (dte.cobroReminderCount >= REMINDER_STEPS_BIZ_DAYS.length)
    return { action: "skip", reason: "max_reminders" };
  if (!dte.clientActionToken) return { action: "skip", reason: "no_token" };
  if (dte.clientActionTokenExp && dte.clientActionTokenExp.getTime() < now.getTime())
    return { action: "skip", reason: "token_expired" };

  const refs = Array.isArray(dte.additionalReferences)
    ? (dte.additionalReferences as DraftAdditionalReference[])
    : [];
  if (refs.some((r) => r.tipoDocRef === "801"))
    return { action: "skip", reason: "oc_present" };

  const proformaActive = dte.requireProforma && PENDING.has(dte.proformaStatus);
  const epActive = dte.requireEstadoPago && PENDING.has(dte.estadoPagoStatus);
  if (!proformaActive && !epActive)
    return { action: "skip", reason: "not_pending" };

  const variant: BillingDocVariant = proformaActive ? "PROFORMA" : "ESTADO_DE_PAGO";
  const sentAt = variant === "PROFORMA" ? dte.proformaSentAt : dte.estadoPagoSentAt;
  if (!sentAt) return { action: "skip", reason: "no_sent_at" };

  if (!isCobroReminderDue(now, sentAt, dte.cobroReminderCount))
    return { action: "skip", reason: "not_due" };

  return { action: "send", variant, index: dte.cobroReminderCount + 1 };
}

export interface RunCobroRemindersResult {
  scanned: number;
  sent: number;
  skipped: number;
}

/**
 * Corre una pasada de recordatorios sobre TODOS los tenants (cron global, mismo
 * patrón que cashflow-drift-check). Cada envío queda scopeado a su propio
 * tenant vía sendBillingDocument(dte.tenantId, …).
 */
export async function runCobroReminders(
  now: Date,
): Promise<RunCobroRemindersResult> {
  const candidates = await prisma.financeDte.findMany({
    where: {
      direction: "ISSUED",
      folio: 0,
      cobroReminderCount: { lt: REMINDER_STEPS_BIZ_DAYS.length },
      clientActionToken: { not: null },
      OR: [
        { requireProforma: true, proformaStatus: { in: ["SENT", "VIEWED"] } },
        { requireEstadoPago: true, estadoPagoStatus: { in: ["SENT", "VIEWED"] } },
      ],
    },
  });

  let sent = 0;
  let skipped = 0;
  for (const dte of candidates) {
    const decision = evaluateCobroReminder(dte, now);
    if (decision.action === "skip") {
      skipped++;
      continue;
    }
    try {
      const res = await sendBillingDocument(dte.tenantId, {
        dteId: dte.id,
        variant: decision.variant,
        triggeredBy: "cron:cobro-reminders",
        isAutoFromCron: true,
        reminder: { index: decision.index },
      });
      if (res.success) {
        await prisma.financeDte.update({
          where: { id: dte.id },
          data: {
            cobroReminderCount: { increment: 1 },
            cobroLastReminderAt: now,
          },
        });
        sent++;
      } else {
        skipped++;
      }
    } catch (err) {
      console.error(`[cobro-reminders] dte ${dte.id} failed:`, err);
      skipped++;
    }
  }

  return { scanned: candidates.length, sent, skipped };
}
