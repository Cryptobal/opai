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
  /**
   * Moneda del precio de ESTA línea. Permite mezclar líneas CLP y UF
   * dentro de una misma plantilla (la plantilla siempre emite el DTE
   * final en CLP; cada línea UF se convierte usando la `ufFixingPolicy`
   * de la plantilla al momento del run).
   *
   * Backward-compat: si la línea NO trae `priceCurrency` (plantillas
   * creadas antes de la migración por-línea), inferimos a partir del
   * `template.currency` global y la presencia de `unitPriceUf`.
   */
  priceCurrency?: "CLP" | "UF";
  discountPct?: number;
  discountKind?: "PCT" | "AMOUNT";
  discountAmount?: number;
  isExempt?: boolean;
  accountId?: string;
  refuerzoSolicitudId?: string;
};

/**
 * Resuelve la moneda efectiva de una línea para el cron. Si la línea
 * declara `priceCurrency`, manda. Si no, miramos el `template.currency`
 * legacy y la presencia de `unitPriceUf` (que en el modelo viejo era
 * la señal de "línea UF"). Default: CLP.
 */
function resolveLinePriceCurrency(
  line: TemplateLine,
  templateCurrency: string,
): "CLP" | "UF" {
  if (line.priceCurrency === "UF" || line.priceCurrency === "CLP") {
    return line.priceCurrency;
  }
  if (templateCurrency === "UF" || line.unitPriceUf != null) return "UF";
  return "CLP";
}

/**
 * Convierte una línea de plantilla a la forma que `DraftDteInput.lines`
 * espera. Aplica el resolver de placeholders al `itemName`/`description`,
 * resuelve `discountKind=AMOUNT` → `discountPct` según el monto bruto
 * del momento, y — si la línea es UF — convierte el precio a CLP
 * usando el valor de UF que el caller resolvió por política.
 *
 * El DTE final SIEMPRE viaja en CLP. El `unitPriceUf` se conserva en
 * la línea solo como auditoría (lo que el usuario tipeó).
 */
function templateLineToDraftLine(
  line: TemplateLine,
  ctx: PlaceholderContext,
  opts: { templateCurrency: string; ufValue: number | null },
): NonNullable<DraftDteInput["lines"]>[number] {
  const quantity = line.quantity ?? 1;
  const linePc = resolveLinePriceCurrency(line, opts.templateCurrency);
  const unitPriceUf = line.unitPriceUf;

  // Conversión UF → CLP entero (regla SII: pesos sin centavos). Si la
  // UF falló al resolverse (ufValue=null) caemos a 0 — el preview del
  // borrador lo mostrará y el operador podrá corregir antes de emitir.
  const unitPriceClp =
    linePc === "UF"
      ? Math.round((unitPriceUf ?? 0) * (opts.ufValue ?? 0))
      : (line.unitPrice ?? 0);

  // Ctx específico de la línea: si la línea es UF, exponemos el monto
  // UF al resolver para que {{uf_monto}} pueda salir tipo "40,1730 UF".
  // El `currency` se sobreescribe a "UF" solo para esta línea.
  const lineCtx: PlaceholderContext = {
    ...ctx,
    currency: linePc,
    ufMonto: linePc === "UF" ? unitPriceUf : undefined,
    ufMontoQuantity: quantity,
  };

  // Resolución del descuento: si vino discountKind=AMOUNT, convertimos
  // a porcentaje contra el monto bruto de la línea (qty * precio sin
  // descuento). Para UF aplicamos el % contra el bruto UF; el % es
  // invariante a la conversión así que esto sigue dando el mismo
  // resultado al convertirse a CLP.
  let discountPct = line.discountPct ?? 0;
  if (line.discountKind === "AMOUNT" && line.discountAmount != null) {
    const grossPerUnit = linePc === "UF" ? (unitPriceUf ?? 0) : unitPriceClp;
    const gross = quantity * grossPerUnit;
    if (gross > 0) {
      discountPct = Math.round((line.discountAmount / gross) * 10000) / 100;
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
    // unitPriceUf se conserva en la línea para auditoría (PDF/UI puede
    // mostrar "40 UF × $39.485 = $1.579.400"). El SII solo ve CLP.
    unitPriceUf: linePc === "UF" ? unitPriceUf : undefined,
    discountPct,
    isExempt: line.isExempt ?? false,
    accountId: line.accountId,
    refuerzoSolicitudId: line.refuerzoSolicitudId,
  };
}

function templateToDraftInput(
  t: FinanceDteRecurringTemplate,
  ctx: PlaceholderContext,
  opts: { ufValue: number | null },
): DraftDteInput {
  const rawLines = (t.lines as TemplateLine[] | null) ?? [];
  const lines = rawLines.map((l) =>
    templateLineToDraftLine(l, ctx, {
      templateCurrency: t.currency,
      ufValue: opts.ufValue,
    }),
  );

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
    // El DTE final SIEMPRE en CLP: las líneas UF ya quedaron convertidas
    // arriba. Esto evita que `computeDteAmounts` intente reconvertir
    // (lo cual fallaría porque no hay un único `currency=UF` global).
    currency: "CLP",
    lines,
    notes,
    additionalReferences: (t.additionalReferences as DraftDteInput["additionalReferences"]) ?? undefined,
    autoSendEmail: t.autoSendEmail,
    // Plan de Documento de Cobro: si la plantilla está configurada para
    // mandar proforma o estado de pago automáticamente, dejamos el flag
    // `require*` activo en el borrador para que la UI lo refleje (badge
    // "Proforma pendiente" / "Estado de pago pendiente") y los listados
    // filtren correctamente. El cron además dispara `sendBillingDocument`
    // más abajo en `runTemplate` para enviarlos en el acto.
    requireProforma: t.autoSendProforma,
    requireEstadoPago: t.autoSendPaymentStatement,
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
    // ¿La plantilla tiene al menos una línea en UF? Necesitamos resolver
    // la UF si SÍ — tanto para convertir cada línea UF → CLP, como para
    // que los placeholders {{uf_valor}}/{{uf_fecha}}/{{uf_monto}} se
    // rendereicen con el valor congelado del run.
    //
    // Backward-compat: plantillas legacy con `currency=UF` se tratan
    // como "todas las líneas son UF" (la hidratación del form las
    // remigrará a `priceCurrency` por línea al guardar).
    const rawLines = (template.lines as TemplateLine[] | null) ?? [];
    const someLineUf =
      template.currency === "UF" ||
      rawLines.some(
        (l) =>
          resolveLinePriceCurrency(l, template.currency) === "UF",
      );

    let ufContextValue: number | null = null;
    let ufContextDate: Date | null = null;
    if (someLineUf) {
      const policy = (template.ufFixingPolicy as UfFixingPolicy) ?? "RUN_DAY";
      const fixedDate = resolveUfDateForPolicy(policy, template.ufFixingDay);
      const { getUfValueForDate, getUfValue } = await import("@/lib/uf");
      if (fixedDate) {
        ufContextValue = await getUfValueForDate(fixedDate);
        ufContextDate = fixedDate;
      } else {
        const today = new Date();
        try {
          ufContextValue = await getUfValue();
          ufContextDate = new Date(
            Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate()),
          );
        } catch {
          // Si falla el fetch, las líneas UF quedan en 0 CLP. El operador
          // verá el borrador con monto irreal y podrá corregir antes de
          // emitir (no se manda al SII automáticamente).
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
        // La plantilla emite siempre en CLP. El override a "UF" lo hace
        // `templateLineToDraftLine` solo para las líneas que aplican.
        currency: "CLP",
      }),
    };

    // El draft se crea con currency=CLP y cada línea ya convertida a
    // pesos. Por eso no pasamos `ufOverride` — `computeDteAmounts` ve
    // currency=CLP y no intenta resolver UF (no hay UF "global" en este
    // modelo).
    const draft = await createDraftDte(
      tenantId,
      template.createdBy,
      templateToDraftInput(template, ctx, { ufValue: ufContextValue }),
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
