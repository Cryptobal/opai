import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import {
  parseBody,
  requireAuth,
  unauthorized,
  resolveApiPerms,
} from "@/lib/api-auth";
import {
  hasCapability,
  hasFacturacionCapability,
} from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import {
  computeNextRunAt,
  computeRecurringIssueYmd,
} from "@/modules/finance/billing/dte-recurring-schedule";
import { addDaysYmd } from "@/modules/finance/flow-v3/types";
import { syncRecurringDteItem } from "@/modules/finance/cashflow/generators/recurring-dte-sync";

/**
 * Edición masiva del calendario de emisión/cobro de programaciones
 * (`FinanceDteRecurringTemplate`). Fuente de verdad del Flujo de Caja v3.
 *
 * Accesible con `facturacion_configure` o `cashflow_configure` (la vista
 * antigua de contratos-cobro usaba cashflow_configure; no bloquear a
 * quien ya entraba por ahí).
 */

function canConfigureCalendario(
  perms: Awaited<ReturnType<typeof resolveApiPerms>>,
): boolean {
  return (
    hasFacturacionCapability(perms, "facturacion_configure") ||
    hasCapability(perms, "cashflow_configure")
  );
}

const FREQUENCY = z.enum(["monthly", "biweekly", "weekly", "yearly"]);
const FACTURA_TIMING = z.enum(["AL_EMITIR", "DIA_ESPECIFICO"]);
const MES_RELATIVO = z.enum(["MISMO_MES", "MES_SIGUIENTE"]);
const YMD = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

const itemUpdateSchema = z
  .object({
    id: z.string().uuid(),
    frequency: FREQUENCY.optional(),
    dayOfMonth: z.number().int().min(-1).max(31).nullable().optional(),
    dayOfWeek: z.number().int().min(0).max(6).nullable().optional(),
    monthOfYear: z.number().int().min(1).max(12).nullable().optional(),
    facturaTiming: FACTURA_TIMING.optional(),
    facturaDay: z.number().int().min(-1).max(31).nullable().optional(),
    facturaMesRelativo: MES_RELATIVO.optional(),
    /** null = usar collectionLagDays del tenant. */
    diasCobroDesdeFactura: z.number().int().min(0).max(180).nullable().optional(),
    startDate: YMD.optional(),
    endDate: YMD.nullable().optional(),
  })
  .refine(
    (d) => {
      if (d.startDate == null || d.endDate == null) return true;
      return d.endDate >= d.startDate;
    },
    { message: "endDate debe ser >= startDate", path: ["endDate"] },
  );

const batchSchema = z.object({
  items: z.array(itemUpdateSchema).min(1).max(200),
});

function toYmd(d: Date | null | undefined): string | null {
  if (!d) return null;
  return d.toISOString().slice(0, 10);
}

function computeEstimates(args: {
  nextRunAt: Date | null;
  facturaTiming: string;
  facturaDay: number | null;
  facturaMesRelativo: string;
  dayOfMonth: number | null;
  diasCobroDesdeFactura: number | null;
}): { emisionEstimadaYmd: string | null; cobroEstimadoYmd: string | null } {
  if (!args.nextRunAt) {
    return { emisionEstimadaYmd: null, cobroEstimadoYmd: null };
  }
  const emisionEstimadaYmd = computeRecurringIssueYmd(
    {
      facturaTiming: args.facturaTiming,
      facturaDay: args.facturaDay,
      facturaMesRelativo: args.facturaMesRelativo,
      dayOfMonth: args.dayOfMonth,
    },
    args.nextRunAt,
  );
  const cobroEstimadoYmd =
    args.diasCobroDesdeFactura == null
      ? null
      : addDaysYmd(emisionEstimadaYmd, args.diasCobroDesdeFactura);
  return { emisionEstimadaYmd, cobroEstimadoYmd };
}

export async function GET() {
  try {
    const ctx = await requireAuth();
    if (!ctx) return unauthorized();
    const perms = await resolveApiPerms(ctx);
    if (!canConfigureCalendario(perms)) {
      return NextResponse.json(
        { success: false, error: "Sin permisos" },
        { status: 403 },
      );
    }

    const templates = await prisma.financeDteRecurringTemplate.findMany({
      where: {
        tenantId: ctx.tenantId,
        dteType: { in: [33, 34] },
      },
      select: {
        id: true,
        name: true,
        isActive: true,
        frequency: true,
        dayOfMonth: true,
        dayOfWeek: true,
        monthOfYear: true,
        startDate: true,
        endDate: true,
        nextRunAt: true,
        lastRunAt: true,
        facturaTiming: true,
        facturaDay: true,
        facturaMesRelativo: true,
        diasCobroDesdeFactura: true,
        crmAccountId: true,
        installationId: true,
      },
      orderBy: { name: "asc" },
    });

    const accountIds = Array.from(
      new Set(templates.map((t) => t.crmAccountId).filter(Boolean)),
    ) as string[];
    const installationIds = Array.from(
      new Set(templates.map((t) => t.installationId).filter(Boolean)),
    ) as string[];

    const [accounts, installations] = await Promise.all([
      accountIds.length > 0
        ? prisma.crmAccount.findMany({
            where: { id: { in: accountIds }, tenantId: ctx.tenantId },
            select: { id: true, name: true },
          })
        : Promise.resolve([]),
      installationIds.length > 0
        ? prisma.crmInstallation.findMany({
            where: { id: { in: installationIds }, tenantId: ctx.tenantId },
            select: { id: true, name: true },
          })
        : Promise.resolve([]),
    ]);

    const accountById = new Map(accounts.map((a) => [a.id, a.name]));
    const installationById = new Map(installations.map((i) => [i.id, i.name]));

    const data = templates.map((t) => {
      const estimates = computeEstimates({
        nextRunAt: t.nextRunAt,
        facturaTiming: t.facturaTiming,
        facturaDay: t.facturaDay,
        facturaMesRelativo: t.facturaMesRelativo,
        dayOfMonth: t.dayOfMonth,
        diasCobroDesdeFactura: t.diasCobroDesdeFactura,
      });
      return {
        id: t.id,
        name: t.name,
        isActive: t.isActive,
        frequency: t.frequency,
        dayOfMonth: t.dayOfMonth,
        dayOfWeek: t.dayOfWeek,
        monthOfYear: t.monthOfYear,
        startDate: toYmd(t.startDate)!,
        endDate: toYmd(t.endDate),
        nextRunAt: toYmd(t.nextRunAt),
        lastRunAt: toYmd(t.lastRunAt),
        facturaTiming: t.facturaTiming,
        facturaDay: t.facturaDay,
        facturaMesRelativo: t.facturaMesRelativo,
        diasCobroDesdeFactura: t.diasCobroDesdeFactura,
        crmAccountId: t.crmAccountId,
        installationId: t.installationId,
        accountName: t.crmAccountId
          ? (accountById.get(t.crmAccountId) ?? null)
          : null,
        installationName: t.installationId
          ? (installationById.get(t.installationId) ?? null)
          : null,
        ...estimates,
      };
    });

    return NextResponse.json({ success: true, data });
  } catch (error) {
    console.error("[Finance/Recurring/Calendario] GET error:", error);
    return NextResponse.json(
      { success: false, error: "Error" },
      { status: 500 },
    );
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const ctx = await requireAuth();
    if (!ctx) return unauthorized();
    const perms = await resolveApiPerms(ctx);
    if (!canConfigureCalendario(perms)) {
      return NextResponse.json(
        { success: false, error: "Sin permisos" },
        { status: 403 },
      );
    }

    const parsed = await parseBody(request, batchSchema);
    if (parsed.error) return parsed.error;

    const ids = parsed.data.items.map((i) => i.id);
    const existing = await prisma.financeDteRecurringTemplate.findMany({
      where: {
        id: { in: ids },
        tenantId: ctx.tenantId,
        dteType: { in: [33, 34] },
      },
    });
    if (existing.length !== ids.length) {
      return NextResponse.json(
        {
          success: false,
          error: "Algunas programaciones no pertenecen al tenant",
        },
        { status: 403 },
      );
    }

    const byId = new Map(existing.map((t) => [t.id, t]));

    // Validaciones de negocio post-merge (endDate vs startDate efectivo).
    for (const item of parsed.data.items) {
      const cur = byId.get(item.id)!;
      const startDate =
        item.startDate != null
          ? new Date(item.startDate + "T00:00:00Z")
          : cur.startDate;
      const endDate =
        item.endDate !== undefined
          ? item.endDate
            ? new Date(item.endDate + "T00:00:00Z")
            : null
          : cur.endDate;
      if (endDate && endDate < startDate) {
        return NextResponse.json(
          {
            success: false,
            error: `endDate anterior a startDate en programación ${cur.name}`,
          },
          { status: 400 },
        );
      }
      const timing = item.facturaTiming ?? cur.facturaTiming;
      const facturaDay =
        timing === "AL_EMITIR"
          ? null
          : item.facturaDay !== undefined
            ? item.facturaDay
            : cur.facturaDay;
      if (timing === "DIA_ESPECIFICO" && facturaDay == null) {
        return NextResponse.json(
          {
            success: false,
            error: `Falta día de factura en programación ${cur.name}`,
          },
          { status: 400 },
        );
      }
      const frequency = item.frequency ?? cur.frequency;
      const dayOfMonth =
        item.dayOfMonth !== undefined ? item.dayOfMonth : cur.dayOfMonth;
      if (
        (frequency === "monthly" || frequency === "yearly") &&
        dayOfMonth == null
      ) {
        return NextResponse.json(
          {
            success: false,
            error: `Falta día de programación en ${cur.name}`,
          },
          { status: 400 },
        );
      }
    }

    await prisma.$transaction(async (tx) => {
      for (const item of parsed.data.items) {
        const cur = byId.get(item.id)!;
        const frequency = item.frequency ?? cur.frequency;
        const dayOfMonth =
          item.dayOfMonth !== undefined ? item.dayOfMonth : cur.dayOfMonth;
        const dayOfWeek =
          item.dayOfWeek !== undefined ? item.dayOfWeek : cur.dayOfWeek;
        const monthOfYear =
          item.monthOfYear !== undefined ? item.monthOfYear : cur.monthOfYear;
        const startDate =
          item.startDate != null
            ? new Date(item.startDate + "T00:00:00Z")
            : cur.startDate;
        const endDate =
          item.endDate !== undefined
            ? item.endDate
              ? new Date(item.endDate + "T00:00:00Z")
              : null
            : cur.endDate;

        const facturaTiming = item.facturaTiming ?? cur.facturaTiming;
        // Con AL_EMITIR el resto del timing no aplica (misma semántica que
        // PATCH individual en recurring/[id]).
        const facturaDay =
          facturaTiming === "DIA_ESPECIFICO"
            ? item.facturaDay !== undefined
              ? item.facturaDay
              : cur.facturaDay
            : null;
        const facturaMesRelativo =
          facturaTiming === "DIA_ESPECIFICO"
            ? (item.facturaMesRelativo ?? cur.facturaMesRelativo)
            : "MES_SIGUIENTE";

        const diasCobroDesdeFactura =
          item.diasCobroDesdeFactura !== undefined
            ? item.diasCobroDesdeFactura
            : cur.diasCobroDesdeFactura;

        const freqChanged =
          cur.frequency !== frequency ||
          cur.dayOfMonth !== (dayOfMonth ?? null) ||
          cur.dayOfWeek !== (dayOfWeek ?? null) ||
          cur.monthOfYear !== (monthOfYear ?? null) ||
          cur.startDate.getTime() !== startDate.getTime();

        const nextRunAt = freqChanged
          ? computeNextRunAt({
              frequency,
              dayOfMonth: dayOfMonth ?? null,
              dayOfWeek: dayOfWeek ?? null,
              monthOfYear: monthOfYear ?? null,
              startDate,
              endDate,
              lastRunAt: cur.lastRunAt,
            })
          : cur.nextRunAt;

        await tx.financeDteRecurringTemplate.update({
          where: { id: item.id },
          data: {
            frequency,
            dayOfMonth: dayOfMonth ?? null,
            dayOfWeek: dayOfWeek ?? null,
            monthOfYear: monthOfYear ?? null,
            startDate,
            endDate,
            nextRunAt,
            facturaTiming,
            facturaDay,
            facturaMesRelativo,
            diasCobroDesdeFactura,
          },
        });
      }
    });

    // Espejo v2 fuera de la transacción (igual que PATCH individual).
    for (const id of ids) {
      await syncRecurringDteItem(ctx.tenantId, id);
    }

    return NextResponse.json({
      success: true,
      data: { updated: ids.length },
    });
  } catch (error) {
    console.error("[Finance/Recurring/Calendario] PATCH error:", error);
    const message = error instanceof Error ? error.message : "Error";
    return NextResponse.json(
      { success: false, error: message },
      { status: 500 },
    );
  }
}
