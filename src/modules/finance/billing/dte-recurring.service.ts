/**
 * Facturación Recurrente — Plantillas que generan BORRADORES.
 *
 * Diseño deliberado: el cron NO emite directo al SII. Cada corrida crea
 * un FinanceDte siiStatus=DRAFT que el usuario revisa y emite manualmente.
 * Esto evita errores caros (factura mal emitida = nota de crédito + folio
 * nuevo). Idempotencia: si lastRunAt = today, no duplica.
 */
import { prisma } from "@/lib/prisma";
import type { FinanceDteRecurringTemplate } from "@prisma/client";
import { createDraftDte, type DraftDteInput } from "./dte-draft.service";
import {
  buildContext,
  resolvePlaceholders,
  type PeriodPolicy,
  type PlaceholderContext,
} from "./placeholders";
import { getFileBuffer, uploadFile } from "@/lib/storage";
import {
  sendBillingDocument,
  type BillingDocVariant,
} from "./billing-document-send.service";

export type Frequency = "monthly" | "biweekly" | "weekly" | "yearly";

/**
 * Política de fijación de UF cuando currency=UF.
 *   - RUN_DAY: UF del día en que se ejecuta el cron.
 *   - LAST_DAY_PREV_MONTH: UF del último día del mes anterior.
 *   - FIRST_DAY_MONTH: UF del primer día del mes en curso.
 *   - LAST_DAY_MONTH: UF del último día del mes en curso.
 *   - CUSTOM_DAY: UF del día N del mes (campo `ufFixingDay`).
 */
export type UfFixingPolicy =
  | "RUN_DAY"
  | "LAST_DAY_PREV_MONTH"
  | "FIRST_DAY_MONTH"
  | "LAST_DAY_MONTH"
  | "CUSTOM_DAY";

/**
 * Resuelve la fecha de UF a usar según la policy. Para todas las
 * policies excepto RUN_DAY, devuelve una fecha específica que el
 * caller pasa a `getUfValueForDate`. Para RUN_DAY devuelve null
 * (caller usa `getUfValue()` del día actual).
 */
export function resolveUfDateForPolicy(
  policy: UfFixingPolicy,
  ufFixingDay: number | null,
  now: Date = new Date(),
): Date | null {
  const y = now.getUTCFullYear();
  const m = now.getUTCMonth(); // 0-indexed
  switch (policy) {
    case "RUN_DAY":
      return null;
    case "LAST_DAY_PREV_MONTH":
      // Día 0 del mes en curso = último día del mes anterior.
      return new Date(Date.UTC(y, m, 0));
    case "FIRST_DAY_MONTH":
      return new Date(Date.UTC(y, m, 1));
    case "LAST_DAY_MONTH":
      // Día 0 del mes siguiente = último día del mes en curso.
      return new Date(Date.UTC(y, m + 1, 0));
    case "CUSTOM_DAY": {
      const d = ufFixingDay ?? 1;
      // Clampear al último día disponible si el mes es más corto
      // (ej: 31 en febrero → 28/29).
      const lastDay = new Date(Date.UTC(y, m + 1, 0)).getUTCDate();
      return new Date(Date.UTC(y, m, Math.min(d, lastDay)));
    }
    default:
      return null;
  }
}

type ComputeInput = Pick<
  FinanceDteRecurringTemplate,
  "frequency" | "dayOfMonth" | "dayOfWeek" | "monthOfYear" | "startDate" | "endDate" | "lastRunAt"
>;

function lastDayOfMonth(year: number, monthZeroIdx: number): number {
  return new Date(year, monthZeroIdx + 1, 0).getDate();
}

/**
 * Calcula el próximo nextRunAt según frequency. Si endDate está y
 * el resultado supera endDate → null (template completado).
 */
export function computeNextRunAt(template: ComputeInput, fromDate?: Date): Date | null {
  const base = fromDate ?? template.lastRunAt ?? template.startDate;
  const ref = new Date(base);
  ref.setHours(0, 0, 0, 0);
  // Si nunca ha corrido, partimos de startDate (incluido).
  const isFirst = !template.lastRunAt;
  let next: Date;

  switch (template.frequency as Frequency) {
    case "monthly": {
      next = new Date(ref);
      if (!isFirst) next.setMonth(next.getMonth() + 1);
      const dom = template.dayOfMonth ?? 1;
      const lastDay = lastDayOfMonth(next.getFullYear(), next.getMonth());
      next.setDate(dom === -1 ? lastDay : Math.min(dom, lastDay));
      break;
    }
    case "yearly": {
      next = new Date(ref);
      if (!isFirst) next.setFullYear(next.getFullYear() + 1);
      const moy = (template.monthOfYear ?? 1) - 1;
      next.setMonth(moy);
      const dom = template.dayOfMonth ?? 1;
      const lastDay = lastDayOfMonth(next.getFullYear(), next.getMonth());
      next.setDate(dom === -1 ? lastDay : Math.min(dom, lastDay));
      break;
    }
    case "weekly":
    case "biweekly": {
      const stepDays = template.frequency === "weekly" ? 7 : 14;
      const targetDow = template.dayOfWeek ?? ref.getDay();
      next = new Date(ref);
      if (isFirst) {
        // Primer hit en o después de startDate con el targetDow.
        const diff = (targetDow - next.getDay() + 7) % 7;
        next.setDate(next.getDate() + diff);
      } else {
        next.setDate(next.getDate() + stepDays);
      }
      break;
    }
    default:
      return null;
  }

  if (template.endDate && next > template.endDate) return null;
  return next;
}

/**
 * Shape de cada línea en el JSON `lines` del template. Algunos campos
 * son extras opcionales que el form de plantilla agrega para
 * preservar la "intención" del usuario:
 *   - discountKind/discountAmount: si el usuario eligió descuento `$`,
 *     guardamos kind=AMOUNT + amount. El cron lo convierte a
 *     discountPct según el monto bruto del momento.
 */
type TemplateLine = {
  itemName: string;
  description?: string | null;
  quantity?: number;
  unit?: string;
  unitPrice?: number;
  unitPriceUf?: number;
  discountPct?: number;
  discountKind?: "PCT" | "AMOUNT";
  discountAmount?: number;
  isExempt?: boolean;
  accountId?: string;
  refuerzoSolicitudId?: string;
};

/**
 * Convierte una línea de plantilla a la forma que `DraftDteInput.lines`
 * espera. Aplica el resolver de placeholders al `itemName`/`description`
 * y resuelve `discountKind=AMOUNT` → `discountPct` según el monto bruto
 * del momento.
 */
function templateLineToDraftLine(
  line: TemplateLine,
  ctx: PlaceholderContext,
): NonNullable<DraftDteInput["lines"]>[number] {
  const quantity = line.quantity ?? 1;
  const unitPriceClp = line.unitPrice ?? 0;
  const unitPriceUf = line.unitPriceUf;

  // ufMonto del contexto: si el template es UF, pasamos el unitPriceUf
  // como referencia para el token {{uf_monto}} (multiplicado por quantity
  // adentro del resolver).
  const lineCtx: PlaceholderContext = {
    ...ctx,
    ufMonto: ctx.currency === "UF" ? unitPriceUf : undefined,
    ufMontoQuantity: quantity,
  };

  // Resolución del descuento: si vino discountKind=AMOUNT, convertimos
  // a porcentaje contra el monto bruto de la línea (qty * precio sin
  // descuento). Para UF, el "precio" es unitPriceUf; para CLP es
  // unitPrice. Si el bruto es 0, el % efectivo es 0.
  let discountPct = line.discountPct ?? 0;
  if (line.discountKind === "AMOUNT" && line.discountAmount != null) {
    const grossPerUnit = ctx.currency === "UF" ? (unitPriceUf ?? 0) : unitPriceClp;
    const gross = quantity * grossPerUnit;
    if (gross > 0) {
      discountPct = Math.round((line.discountAmount / gross) * 10000) / 100;
      // clamp [0, 100] por seguridad ante input inválido (UI ya lo valida).
      if (discountPct < 0) discountPct = 0;
      if (discountPct > 100) discountPct = 100;
    } else {
      discountPct = 0;
    }
  }

  const itemName = resolvePlaceholders(line.itemName ?? "", lineCtx);
  const description = line.description
    ? resolvePlaceholders(line.description, lineCtx)
    : undefined;

  return {
    itemName,
    description,
    quantity,
    unit: line.unit,
    unitPrice: unitPriceClp,
    unitPriceUf: unitPriceUf,
    discountPct,
    isExempt: line.isExempt ?? false,
    accountId: line.accountId,
    refuerzoSolicitudId: line.refuerzoSolicitudId,
  };
}

function templateToDraftInput(
  t: FinanceDteRecurringTemplate,
  ctx: PlaceholderContext,
): DraftDteInput {
  const rawLines = (t.lines as TemplateLine[] | null) ?? [];
  const lines = rawLines.map((l) => templateLineToDraftLine(l, ctx));

  const notes = t.notes ? resolvePlaceholders(t.notes, ctx) : undefined;

  return {
    dteType: t.dteType,
    receiverRut: t.receiverRut,
    receiverName: t.receiverName,
    receiverEmail: t.receiverEmail ?? undefined,
    receiverEmailCc: t.receiverEmailCc,
    receiverGiro: t.receiverGiro ?? undefined,
    receiverDireccion: t.receiverDireccion ?? undefined,
    receiverComuna: t.receiverComuna ?? undefined,
    receiverCiudad: t.receiverCiudad ?? undefined,
    crmAccountId: t.crmAccountId ?? undefined,
    installationId: t.installationId ?? undefined,
    currency: t.currency,
    lines,
    notes,
    additionalReferences: (t.additionalReferences as DraftDteInput["additionalReferences"]) ?? undefined,
    autoSendEmail: t.autoSendEmail,
  };
}

/**
 * Copia los adjuntos de una plantilla recurrente al borrador recién
 * generado. Hace copia real (descarga + reupload a R2 con nuevo key)
 * para que borrar el adjunto en la plantilla no rompa los borradores ya
 * generados. Si una copia individual falla, se loggea y se continúa con
 * los demás — no se cae el run del template por esto.
 */
async function copyTemplateAttachmentsToDraft(
  tenantId: string,
  templateId: string,
  draftId: string,
  uploadedBy: string,
): Promise<void> {
  const tplAttachments = await prisma.financeDteRecurringTemplateAttachment.findMany({
    where: { templateId, tenantId },
    select: {
      id: true,
      filename: true,
      mimeType: true,
      size: true,
      storageKey: true,
    },
  });
  if (tplAttachments.length === 0) return;

  for (const att of tplAttachments) {
    try {
      const buffer = await getFileBuffer(att.storageKey, 10 * 1024 * 1024);
      const uploaded = await uploadFile(
        buffer,
        att.filename,
        att.mimeType,
        "finance/dte",
        tenantId,
      );
      await prisma.financeDteAttachment.create({
        data: {
          tenantId,
          dteId: draftId,
          kind: "USER_UPLOAD",
          filename: uploaded.fileName,
          mimeType: uploaded.mimeType,
          size: uploaded.size,
          storageKey: uploaded.storageKey,
          publicUrl: uploaded.publicUrl,
          uploadedBy,
        },
      });
    } catch (err) {
      console.error(
        `[finance/recurring] copy attachment ${att.id} → draft ${draftId} failed`,
        err,
      );
    }
  }
}

/**
 * Ejecuta una corrida del template: crea un borrador (FinanceDte DRAFT)
 * y registra el run. Si el cliente CRM fue eliminado, el run queda
 * status=failed y NO se crea borrador.
 */
export async function runTemplate(tenantId: string, templateId: string) {
  const template = await prisma.financeDteRecurringTemplate.findFirst({
    where: { id: templateId, tenantId },
  });
  if (!template) throw new Error("Template no encontrado");
  if (!template.isActive) {
    return prisma.financeDteRecurringRun.create({
      data: { tenantId, templateId, status: "skipped_inactive" },
    });
  }
  if (template.endDate && template.endDate < new Date()) {
    return prisma.financeDteRecurringRun.create({
      data: { tenantId, templateId, status: "skipped_endDate" },
    });
  }

  // Si la plantilla referencia un CRM account, validar que exista.
  if (template.crmAccountId) {
    const account = await prisma.crmAccount.findFirst({
      where: { id: template.crmAccountId, tenantId },
      select: { id: true },
    });
    if (!account) {
      return prisma.financeDteRecurringRun.create({
        data: {
          tenantId,
          templateId,
          status: "failed",
          error: "Cliente CRM referenciado por la plantilla ya no existe",
        },
      });
    }
  }

  try {
    // Si la plantilla es UF, resolvemos la UF según la policy ANTES
    // de crear el draft. Esto "fija" la UF que verá el borrador (queda
    // congelada en `ufValueAtIssue` y no cambia aunque el usuario emita
    // días después).
    //
    // Para el resolver de placeholders ({{uf_valor}}, {{uf_fecha}})
    // necesitamos el valor + fecha incluso cuando policy=RUN_DAY:
    // si la plantilla NO es UF (currency=CLP) no hay UF que resolver.
    let ufOverride: number | undefined = undefined;
    let ufContextValue: number | null = null;
    let ufContextDate: Date | null = null;
    if (template.currency === "UF") {
      const policy = (template.ufFixingPolicy as UfFixingPolicy) ?? "RUN_DAY";
      const fixedDate = resolveUfDateForPolicy(policy, template.ufFixingDay);
      const { getUfValueForDate, getUfValue } = await import("@/lib/uf");
      if (fixedDate) {
        ufOverride = await getUfValueForDate(fixedDate);
        ufContextValue = ufOverride;
        ufContextDate = fixedDate;
      } else {
        // policy=RUN_DAY: ufOverride queda undefined → createDraftDte
        // resuelve la UF del día. Para el contexto del resolver
        // necesitamos el mismo valor; lo traemos también.
        const today = new Date();
        try {
          ufContextValue = await getUfValue();
          ufContextDate = new Date(
            Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate()),
          );
        } catch {
          // Si falla el fetch de UF, los placeholders {{uf_valor}}/
          // {{uf_fecha}} quedan vacíos pero el draft se crea igual
          // (computeDteAmounts maneja su propia caída de UF).
          ufContextValue = null;
          ufContextDate = null;
        }
      }
    }

    // Nombre de la instalación (para {{instalacion}}). Lookup mínimo,
    // null si no hay instalación asignada o si el lookup falla.
    let installationName: string | null = null;
    if (template.installationId) {
      const inst = await prisma.crmInstallation.findFirst({
        where: { id: template.installationId, tenantId },
        select: { name: true },
      });
      installationName = inst?.name ?? null;
    }

    const periodPolicy = (template.periodPolicy as PeriodPolicy) ?? "CURRENT_MONTH";
    const ctx: PlaceholderContext = {
      ...buildContext({
        periodPolicy,
        runDate: new Date(),
        uf:
          ufContextValue != null && ufContextDate != null
            ? { value: ufContextValue, date: ufContextDate }
            : null,
        cliente: template.receiverName,
        instalacion: installationName,
        currency: template.currency === "UF" ? "UF" : "CLP",
      }),
    };

    const draft = await createDraftDte(
      tenantId,
      template.createdBy,
      templateToDraftInput(template, ctx),
      { ufOverride },
    );

    // Copiar adjuntos del template al borrador. Hacemos copy real en R2
    // (no compartimos storageKey) para que borrar un adjunto del template
    // no rompa los borradores ya generados. Si la copia falla por archivo
    // individual, log y seguimos — el borrador no se cae por esto.
    await copyTemplateAttachmentsToDraft(tenantId, template.id, draft.id, template.createdBy);

    // Auto-envío opcional de PROFORMA y/o ESTADO_DE_PAGO al receptor.
    // Reusan el mismo flujo que el endpoint manual drafts/[id]/send-as.
    // Si un envío falla, NO rompemos el run — el borrador queda creado
    // y el operador puede reenviar manualmente.
    const autoSendVariants: BillingDocVariant[] = [];
    if (template.autoSendProforma) autoSendVariants.push("PROFORMA");
    if (template.autoSendPaymentStatement) autoSendVariants.push("ESTADO_DE_PAGO");
    for (const variant of autoSendVariants) {
      try {
        const result = await sendBillingDocument(tenantId, {
          dteId: draft.id,
          variant,
          triggeredBy: template.createdBy,
        });
        if (!result.success) {
          console.error(
            `[finance/recurring] auto-send ${variant} draft ${draft.id} failed: ${result.error}`,
          );
        }
      } catch (err) {
        console.error(
          `[finance/recurring] auto-send ${variant} draft ${draft.id} threw`,
          err,
        );
      }
    }

    const next = computeNextRunAt(template);
    await prisma.financeDteRecurringTemplate.update({
      where: { id: templateId },
      data: {
        lastRunAt: new Date(),
        nextRunAt: next,
        runCount: { increment: 1 },
      },
    });
    return prisma.financeDteRecurringRun.create({
      data: { tenantId, templateId, dteId: draft.id, status: "success" },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Error desconocido";
    return prisma.financeDteRecurringRun.create({
      data: { tenantId, templateId, status: "failed", error: message },
    });
  }
}

/**
 * Procesa todos los templates activos cuyo nextRunAt <= today para un
 * tenant. Idempotente: si lastRunAt = today, los salta.
 */
export async function processDueTemplates(
  tenantId: string,
  today?: Date,
): Promise<{ successCount: number; failedCount: number; skippedCount: number }> {
  const now = today ?? new Date();
  now.setHours(23, 59, 59, 999);

  const templates = await prisma.financeDteRecurringTemplate.findMany({
    where: {
      tenantId,
      isActive: true,
      OR: [{ nextRunAt: null }, { nextRunAt: { lte: now } }],
    },
  });

  let successCount = 0;
  let failedCount = 0;
  let skippedCount = 0;

  for (const t of templates) {
    // Idempotency guard: si lastRunAt y nextRunAt ya están sincronizados
    // (lastRunAt = today o futuro), saltamos.
    if (t.lastRunAt) {
      const last = new Date(t.lastRunAt);
      last.setHours(0, 0, 0, 0);
      const nowFloor = new Date(now);
      nowFloor.setHours(0, 0, 0, 0);
      if (last.getTime() === nowFloor.getTime()) {
        skippedCount += 1;
        continue;
      }
    }
    const run = await runTemplate(tenantId, t.id);
    if (run.status === "success") successCount += 1;
    else if (run.status === "failed") failedCount += 1;
    else skippedCount += 1;
  }

  return { successCount, failedCount, skippedCount };
}
