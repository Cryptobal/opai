import { z } from "zod";

const ymd = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Formato YYYY-MM-DD");

export const flowSectionSchema = z.enum([
  "INGRESOS",
  "REMUNERACIONES",
  "IMPUESTOS",
  "GAV",
  "FINANCIAMIENTO",
  "OTROS",
]);

export const flowMatrixQuerySchema = z.object({
  from: z.coerce.date().optional(),
  to: z.coerce.date().optional(),
  horizon: z.enum(["week", "month"]).default("week"),
});

export const flowRowCreateSchema = z
  .object({
    section: flowSectionSchema,
    name: z.string().trim().min(1).max(120),
    mapping: z.enum(["ACCOUNT_INSTALLATION", "CATEGORY", "SUPPLIER", "MANUAL"]),
    crmAccountId: z.string().uuid().nullish(),
    installationId: z.string().uuid().nullish(),
    recurringTemplateId: z.string().uuid().nullish(),
    categoryId: z.string().uuid().nullish(),
    supplierId: z.string().uuid().nullish(),
  })
  .refine((v) => v.mapping !== "ACCOUNT_INSTALLATION" || !!v.crmAccountId, {
    message: "crmAccountId requerido para mapping ACCOUNT_INSTALLATION",
  })
  .refine((v) => !v.recurringTemplateId || v.mapping === "ACCOUNT_INSTALLATION", {
    message: "recurringTemplateId solo aplica a mapping ACCOUNT_INSTALLATION",
  })
  .refine((v) => v.mapping !== "CATEGORY" || !!v.categoryId, {
    message: "categoryId requerido para mapping CATEGORY",
  })
  .refine((v) => v.mapping !== "SUPPLIER" || !!v.supplierId, {
    message: "supplierId requerido para mapping SUPPLIER",
  });

export const flowRowRenameSchema = z.object({
  name: z.string().trim().min(1).max(120),
});

export const flowRowUpdateSchema = z
  .object({
    name: z.string().trim().min(1).max(120).optional(),
    section: flowSectionSchema.optional(),
    categoryId: z.string().uuid().optional(),
  })
  .refine((v) => v.name != null || v.section != null || v.categoryId != null, {
    message: "Nada que actualizar",
  });

export const flowRowReorderSchema = z.object({
  section: flowSectionSchema,
  orderedIds: z.array(z.string().uuid()).min(1).max(500),
});

const planAmount = z
  .number()
  .finite()
  .min(-99_999_999_999)
  .max(99_999_999_999);

export const flowPlanUpsertSchema = z.object({
  rowId: z.string().uuid(),
  weekStart: ymd,
  amount: planAmount,
});

export const flowPlanBulkFillSchema = z.object({
  rowId: z.string().uuid(),
  weekStarts: z.array(ymd).min(1).max(60),
  amount: planAmount,
});

export const flowRecurringEndDateSchema = z.object({
  /** null = programación sin término. */
  endDate: ymd.nullable(),
});

/** Mover plan de una semana a otra dentro de la misma fila (drag / menú). */
export const flowPlanMoveSchema = z.object({
  rowId: z.string().uuid(),
  fromWeek: ymd,
  toWeek: ymd,
});

export const flowRecurrenceFrequencySchema = z.enum(["WEEKLY", "BIWEEKLY", "MONTHLY"]);
export const flowPlanCurrencySchema = z.enum(["CLP", "UF"]);
export const flowUfPolicySchema = z.enum([
  "RUN_DAY",
  "LAST_DAY_MONTH",
  "LAST_DAY_PREV_MONTH",
  "CUSTOM_DAY",
  "FIRST_DAY_MONTH",
]);

/** Egreso/financiamiento recurrente de plan (v5: N repeticiones, monto signado). */
export const flowRecurringPlanCreateSchema = z
  .object({
    rowId: z.string().uuid().optional(),
    /** CLP por ocurrencia. FINANCIAMIENTO acepta signo (− egreso / + ingreso). */
    amount: planAmount.optional().default(0),
    frequency: flowRecurrenceFrequencySchema,
    dayOfMonth: z.number().int().min(1).max(31).nullish(),
    startDate: ymd,
    endDate: ymd.nullish(),
    endAfterOccurrences: z.number().int().min(1).max(240).nullish(),
    currency: flowPlanCurrencySchema.optional().default("CLP"),
    amountUf: z.number().finite().positive().max(1_000_000).nullish(),
    ufPolicy: flowUfPolicySchema.nullish(),
    ufCustomDay: z.number().int().min(1).max(31).nullish(),
    /** Crear fila destino nueva (nombre + categoría opcional) en vez de usar rowId. */
    newRow: z
      .object({
        section: flowSectionSchema,
        name: z.string().trim().min(1).max(120),
        categoryId: z.string().uuid().nullish(),
      })
      .nullish(),
  })
  .refine((v) => !!v.rowId || !!v.newRow, {
    message: "rowId o newRow requerido",
  })
  .refine((v) => !v.endDate || v.endDate >= v.startDate, {
    message: "endDate no puede ser anterior a startDate",
  })
  .refine(
    (v) =>
      v.currency === "UF"
        ? v.amountUf != null && v.amountUf > 0
        : (v.amount ?? 0) !== 0,
    { message: "Monto requerido (CLP o UF)" },
  );

export const flowRecurringPlanUpdateSchema = z
  .object({
    amount: planAmount.optional(),
    frequency: flowRecurrenceFrequencySchema.optional(),
    dayOfMonth: z.number().int().min(1).max(31).nullish(),
    startDate: ymd.optional(),
    endDate: ymd.nullish(),
    endAfterOccurrences: z.number().int().min(1).max(240).nullish(),
    currency: flowPlanCurrencySchema.optional(),
    amountUf: z.number().finite().positive().max(1_000_000).nullish(),
    ufPolicy: flowUfPolicySchema.nullish(),
    ufCustomDay: z.number().int().min(1).max(31).nullish(),
  })
  .refine(
    (v) =>
      v.amount != null ||
      v.frequency != null ||
      v.dayOfMonth !== undefined ||
      v.startDate != null ||
      v.endDate !== undefined ||
      v.endAfterOccurrences !== undefined ||
      v.currency != null ||
      v.amountUf != null ||
      v.ufPolicy !== undefined ||
      v.ufCustomDay !== undefined,
    { message: "Nada que actualizar" },
  );

export const flowUnmatchedIncomeCreateSchema = z.object({
  dteId: z.string().uuid(),
});

/** Vincular DTE(s) de "Otros ingresos" a una programación de su cuenta. */
export const flowUnmatchedIncomeLinkTemplateSchema = z
  .object({
    dteId: z.string().uuid().optional(),
    /** Lote (v4.5): vincular N facturas del mismo cliente. */
    dteIds: z.array(z.string().uuid()).min(1).max(100).optional(),
    templateId: z.string().uuid(),
  })
  .refine((v) => !!v.dteId || (v.dteIds != null && v.dteIds.length > 0), {
    message: "dteId o dteIds requerido",
  });

export const flowChatSchema = z.object({
  message: z.string().trim().min(1).max(2000),
});

export const flowRecurringPlanDeleteSchema = z.object({
  keepCells: z.boolean().optional(),
});

/** Cierre semanal desde v3. weekEnd es un domingo (fin de semana ISO). */
export const flowWeeklyCloseSchema = z.object({
  weekEnd: ymd,
  closedBalance: z.number().finite().min(-99_999_999_999).max(99_999_999_999),
  notes: z.string().trim().max(1000).optional(),
  manualReason: z.string().trim().min(5).max(500).optional(),
});
