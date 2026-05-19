import { z } from "zod";

export const updateCashflowConfigSchema = z.object({
  horizonWeeksDefault: z.number().int().min(8).max(104).optional(),
  horizonMonthsDefault: z.number().int().min(3).max(60).optional(),
  weekStartsOn: z.number().int().min(0).max(6).optional(),
  autoSales: z.boolean().optional(),
  autoPayroll: z.boolean().optional(),
  autoTurnosExtra: z.boolean().optional(),
  autoIva: z.boolean().optional(),
  autoRecurringDte: z.boolean().optional(),
  payrollPayDay: z.number().int().min(-1).max(31).optional(),
  previRedPayDay: z.number().int().min(1).max(28).optional(),
  ivaPayDay: z.number().int().min(1).max(28).optional(),
  matchAmountToleranceClp: z.number().int().min(0).max(1000000).optional(),
  matchDaysTolerance: z.number().int().min(0).max(30).optional(),
  ufMonthlyGrowthPct: z.number().min(0).max(5).optional(),
  turnosExtraMode: z.enum(["HISTORICAL", "PCT_PAYROLL"]).optional(),
  // % como fracción: 0.05 = 5%. Cap a 0.5 por sanity.
  turnosExtraPercentage: z.number().min(0).max(0.5).optional(),
  // % del monto TE que descuenta el sueldo líquido (fracción 0–1).
  turnosExtraLiquidoDiscountPct: z.number().min(0).max(1).optional(),
  // % del monto TE que descuenta el pago de PreviRed (fracción 0–1).
  turnosExtraPreviRedDiscountPct: z.number().min(0).max(1).optional(),
  // % de ventas netas proyectadas que se retira como dividendo de socios.
  // Fracción 0–0.5 (50% es absurdo pero damos margen).
  retiroSocioPctVentas: z.number().min(0).max(0.5).optional(),
  retiroSocioPayDay: z.number().int().min(1).max(28).optional(),
  quincenaMode: z.enum(["FICHA", "PCT_LIQUIDO"]).optional(),
  // % sobre líquidos cuando quincenaMode=PCT_LIQUIDO. Fracción 0–0.5.
  quincenaPctLiquido: z.number().min(0).max(0.5).optional(),
  quincenaPayDay: z.number().int().min(1).max(28).optional(),
  writeOffAutoEnabled: z.boolean().optional(),
  writeOffMaxAmountClp: z.number().int().min(0).max(10_000_000).optional(),
  // Fracción 0–0.1 (0% a 10%). Default 0.005 = 0,5%.
  writeOffMaxPercent: z.number().min(0).max(0.1).optional(),
  writeOffShortPaymentAccountId: z.string().uuid().nullable().optional(),
  writeOffOverPaymentAccountId: z.string().uuid().nullable().optional(),
});

export const createCashflowCategorySchema = z.object({
  code: z.string().min(2).max(50).regex(/^[A-Z0-9_]+$/, "Solo MAYÚSCULAS, números y _"),
  name: z.string().min(2).max(120),
  kind: z.enum(["INCOME", "EXPENSE"]),
  color: z.string().regex(/^#[0-9A-F]{6}$/i).optional(),
  accountPlanId: z.string().uuid().optional(),
  sortOrder: z.number().int().min(0).max(9999).optional(),
});

export const updateCashflowCategorySchema = z.object({
  name: z.string().min(2).max(120).optional(),
  color: z.string().regex(/^#[0-9A-F]{6}$/i).optional(),
  sortOrder: z.number().int().min(0).max(9999).optional(),
  accountPlanId: z.string().uuid().nullable().optional(),
  isActive: z.boolean().optional(),
  isTaxExempt: z.boolean().optional(),
});

const recurrenceSchema = z.enum(["ONCE", "WEEKLY", "BIWEEKLY", "MONTHLY", "QUARTERLY", "YEARLY"]);

export const createCashflowItemSchema = z.object({
  categoryId: z.string().uuid(),
  kind: z.enum(["INCOME", "EXPENSE"]),
  source: z.enum(["MANUAL", "SUPPLIER", "OTHER"]).optional(),
  name: z.string().min(2).max(120),
  description: z.string().max(500).optional(),
  amount: z.number().positive(),
  currency: z.enum(["CLP", "UF"]).optional(),
  ufFixingPolicy: z.enum(["RUN_DAY", "LAST_DAY_PREV_MONTH", "FIRST_DAY_MONTH", "LAST_DAY_MONTH", "CUSTOM_DAY"]).optional(),
  ufFixingDay: z.number().int().min(1).max(31).optional(),
  recurrence: recurrenceSchema,
  dayOfMonth: z.number().int().min(-1).max(31).optional(),
  dayOfWeek: z.number().int().min(0).max(6).optional(),
  monthOfYear: z.number().int().min(1).max(12).optional(),
  startDate: z.coerce.date(),
  endDate: z.coerce.date().optional(),
  installationId: z.string().uuid().optional(),
  crmAccountId: z.string().uuid().optional(),
  supplierId: z.string().uuid().optional(),
  notes: z.string().max(2000).optional(),
});

export const updateCashflowItemSchema = createCashflowItemSchema.partial().extend({
  isActive: z.boolean().optional(),
});

export const projectionQuerySchema = z.object({
  from: z.coerce.date(),
  to: z.coerce.date(),
  granularity: z.enum(["weekly", "monthly"]).default("weekly"),
});

export const upsertOccurrenceSchema = z.object({
  amountOverride: z.number().positive().optional(),
  effectiveDate: z.coerce.date().optional(),
  status: z.enum(["PROJECTED", "CONFIRMED", "PAID", "CANCELLED"]).optional(),
  notes: z.string().max(500).optional(),
});

export const changeOccurrenceStatusSchema = z.object({
  status: z.enum(["PROJECTED", "CONFIRMED", "PAID", "CANCELLED"]),
  effectiveDate: z.coerce.date().optional(),
});

export const linkBankTxSchema = z.object({
  bankTransactionId: z.string().uuid(),
});

/** Crear un FinanceCashflowItem (recurrente o puntual) a partir de un
 *  bank tx no clasificado, materializando una occurrence PAID en la
 *  fecha del bank tx y vinculándolos. Lo usa el drawer de cierre semanal
 *  para "meter al flujo" un movimiento inesperado en una sola acción. */
export const createItemFromBankTxSchema = z.object({
  bankTransactionId: z.string().uuid(),
  categoryId: z.string().uuid(),
  name: z.string().min(2).max(200),
  recurrence: z.enum([
    "ONCE",
    "WEEKLY",
    "BIWEEKLY",
    "MONTHLY",
    "QUARTERLY",
    "YEARLY",
  ]),
  /** Opcional: si no viene, se toma el monto absoluto del bank tx. */
  amountClp: z.number().positive().optional(),
  installationId: z.string().uuid().optional(),
  notes: z.string().max(1000).optional(),
});

export const autoMatchSchema = z.object({
  from: z.coerce.date(),
  to: z.coerce.date(),
});

export const upsertAndActSchema = z.discriminatedUnion("action", [
  z
    .object({
      action: z.literal("move"),
      itemId: z.string().uuid(),
      originalDate: z.coerce.date(),
      newDate: z.coerce.date().optional(),
      daysFromCurrent: z.number().int().optional(),
      resolveStrategy: z.enum(["replace", "next_free"]).optional(),
    })
    .refine(
      (v) => v.newDate !== undefined || v.daysFromCurrent !== undefined,
      "Falta newDate o daysFromCurrent",
    ),
  z.object({
    action: z.literal("amount"),
    itemId: z.string().uuid(),
    originalDate: z.coerce.date(),
    amountClp: z.number().positive(),
  }),
  // Cancelar solo esta ocurrencia: la materializa (si no existe) y la marca
  // CANCELLED. El item recurrente sigue activo: las próximas cuotas se
  // proyectan normalmente.
  z.object({
    action: z.literal("cancel"),
    itemId: z.string().uuid(),
    originalDate: z.coerce.date(),
  }),
]);
