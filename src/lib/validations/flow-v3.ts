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

/** Egreso recurrente de plan (§5J). dayOfMonth 1–31 solo para MONTHLY. */
export const flowRecurringPlanCreateSchema = z
  .object({
    rowId: z.string().uuid(),
    amount: planAmount,
    frequency: flowRecurrenceFrequencySchema,
    dayOfMonth: z.number().int().min(1).max(31).nullish(),
    startDate: ymd,
    endDate: ymd.nullish(),
  })
  .refine((v) => !v.endDate || v.endDate >= v.startDate, {
    message: "endDate no puede ser anterior a startDate",
  });

export const flowRecurringPlanUpdateSchema = z
  .object({
    amount: planAmount.optional(),
    frequency: flowRecurrenceFrequencySchema.optional(),
    dayOfMonth: z.number().int().min(1).max(31).nullish(),
    startDate: ymd.optional(),
    endDate: ymd.nullish(),
  })
  .refine(
    (v) =>
      v.amount != null ||
      v.frequency != null ||
      v.dayOfMonth !== undefined ||
      v.startDate != null ||
      v.endDate !== undefined,
    { message: "Nada que actualizar" },
  );

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
