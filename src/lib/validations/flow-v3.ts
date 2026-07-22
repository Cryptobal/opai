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
    categoryId: z.string().uuid().nullish(),
    supplierId: z.string().uuid().nullish(),
  })
  .refine((v) => v.mapping !== "ACCOUNT_INSTALLATION" || !!v.crmAccountId, {
    message: "crmAccountId requerido para mapping ACCOUNT_INSTALLATION",
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
