/**
 * Repara borradores generados con el bug de post-fechado MES_SIGUIENTE:
 * el borrador nació con `computeRecurringIssueYmd` (proyección) en vez del
 * día de la ocurrencia. Solo toca DRAFTs cuya fecha calza exactamente con
 * el corrimiento del template; lista los dudosos sin mutar.
 *
 * Idempotente: re-ejecutar no cambia borradores ya reparados.
 */
import "server-only";
import { prisma } from "@/lib/prisma";
import {
  computeRecurringIssueYmd,
} from "./dte-recurring-schedule";
import {
  formatDateOnlyUtcYmd,
  parseYmdToDbDate,
  todayChileStr,
} from "@/lib/fx-date";

export type DraftRepairResult = {
  repaired: Array<{
    draftId: string;
    code: string;
    receiverName: string;
    fromYmd: string;
    toYmd: string;
    templateName: string;
  }>;
  skippedManual: Array<{
    draftId: string;
    code: string;
    receiverName: string;
    dateYmd: string;
    expectedBugYmd: string;
    reason: string;
  }>;
  inspected: number;
};

function addDaysYmd(ymd: string, days: number): string {
  const d = parseYmdToDbDate(ymd);
  d.setUTCDate(d.getUTCDate() + days);
  return formatDateOnlyUtcYmd(d);
}

/**
 * @param dryRun si true, no escribe — solo reporta qué tocaría.
 */
export async function repairFutureDraftDates(args: {
  tenantId?: string;
  dryRun?: boolean;
}): Promise<DraftRepairResult> {
  const todayYmd = todayChileStr();
  const drafts = await prisma.financeDte.findMany({
    where: {
      siiStatus: "DRAFT",
      direction: "ISSUED",
      recurringTemplateId: { not: null },
      ...(args.tenantId ? { tenantId: args.tenantId } : {}),
    },
    select: {
      id: true,
      tenantId: true,
      code: true,
      receiverName: true,
      date: true,
      dueDate: true,
      createdAt: true,
      recurringTemplateId: true,
    },
  });

  const templateIds = [
    ...new Set(
      drafts
        .map((d) => d.recurringTemplateId)
        .filter((id): id is string => typeof id === "string"),
    ),
  ];
  const templates = templateIds.length
    ? await prisma.financeDteRecurringTemplate.findMany({
        where: { id: { in: templateIds } },
        select: {
          id: true,
          name: true,
          facturaTiming: true,
          facturaDay: true,
          facturaMesRelativo: true,
          dayOfMonth: true,
        },
      })
    : [];
  const tplById = new Map(templates.map((t) => [t.id, t]));

  const result: DraftRepairResult = {
    repaired: [],
    skippedManual: [],
    inspected: drafts.length,
  };

  for (const draft of drafts) {
    if (!draft.recurringTemplateId) continue;
    const tpl = tplById.get(draft.recurringTemplateId);
    if (!tpl) continue;

    const dateYmd = formatDateOnlyUtcYmd(draft.date);
    // Solo candidatos con fecha futura (o ≥ ocurrencia+corrimiento típico).
    if (dateYmd <= todayYmd && tpl.facturaMesRelativo !== "MES_SIGUIENTE") {
      continue;
    }

    const run = await prisma.financeDteRecurringRun.findFirst({
      where: {
        tenantId: draft.tenantId,
        dteId: draft.id,
        status: "success",
      },
      orderBy: { ranAt: "desc" },
      select: { ranAt: true },
    });

    // Ocurrencia = ranAt del run (día del cron) o createdAt del borrador.
    const occurrenceYmd = run
      ? formatDateOnlyUtcYmd(run.ranAt)
      : formatDateOnlyUtcYmd(draft.createdAt);

    const bugYmd = computeRecurringIssueYmd(tpl, parseYmdToDbDate(occurrenceYmd));

    if (dateYmd !== bugYmd) {
      // Fecha no calza con el corrimiento exacto → posible edición manual.
      if (dateYmd > occurrenceYmd) {
        result.skippedManual.push({
          draftId: draft.id,
          code: draft.code,
          receiverName: draft.receiverName,
          dateYmd,
          expectedBugYmd: bugYmd,
          reason: "fecha no calza con corrimiento del template (posible edición manual)",
        });
      }
      continue;
    }

    // Reparar a la ocurrencia, o a hoy si la ocurrencia ya pasó.
    const targetYmd = occurrenceYmd < todayYmd ? todayYmd : occurrenceYmd;
    if (targetYmd === dateYmd) continue;

    const lagDays = draft.dueDate
      ? Math.round(
          (draft.dueDate.getTime() - draft.date.getTime()) / 86_400_000,
        )
      : null;

    if (!args.dryRun) {
      await prisma.financeDte.update({
        where: { id: draft.id },
        data: {
          date: parseYmdToDbDate(targetYmd),
          ...(lagDays != null && draft.dueDate
            ? { dueDate: parseYmdToDbDate(addDaysYmd(targetYmd, lagDays)) }
            : {}),
        },
      });
    }

    result.repaired.push({
      draftId: draft.id,
      code: draft.code,
      receiverName: draft.receiverName,
      fromYmd: dateYmd,
      toYmd: targetYmd,
      templateName: tpl.name,
    });
  }

  return result;
}
