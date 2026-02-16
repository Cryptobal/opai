/**
 * Zod schemas for Finance / Accounting API validation
 *
 * NOTE: We use `.nullable().transform(v => v ?? undefined)` (aliased as `optNull`)
 * so the API accepts `null` in JSON but the output type stays `T | undefined`,
 * matching service-layer signatures that use `Partial<...>`.
 */

import { z } from "zod";

/** Helper: makes a Zod schema optional + nullable, coercing null → undefined */
function optNull<T extends z.ZodTypeAny>(schema: T) {
  return schema.optional().nullable().transform((v) => v ?? undefined);
}

// ── Account Plan ──

export const createAccountSchema = z.object({
  code: z.string().trim().min(1).max(20),
  name: z.string().trim().min(1).max(200),
  type: z.enum(["ASSET", "LIABILITY", "EQUITY", "REVENUE", "COST", "EXPENSE"]),
  nature: z.enum(["DEBIT", "CREDIT"]),
  parentId: optNull(z.string().uuid()),
  level: z.number().int().min(1).max(10),
  acceptsEntries: z.boolean(),
  description: optNull(z.string().trim().max(500)),
  taxCode: optNull(z.string().trim().max(20)),
});

export const updateAccountSchema = z.object({
  name: z.string().trim().min(1).max(200).optional(),
  description: optNull(z.string().trim().max(500)),
  isActive: z.boolean().optional(),
  acceptsEntries: z.boolean().optional(),
});

// ── Accounting Periods ──

export const openPeriodSchema = z.object({
  year: z.number().int().min(2020).max(2099),
  month: z.number().int().min(1).max(12),
});

// ── Journal Entries ──

const journalLineSchema = z.object({
  accountId: z.string().uuid(),
  description: optNull(z.string().trim().max(500)),
  debit: z.number().min(0),
  credit: z.number().min(0),
  costCenterId: optNull(z.string().uuid()),
  thirdPartyId: optNull(z.string()),
  thirdPartyType: optNull(z.enum(["CUSTOMER", "SUPPLIER"])),
});

export const createJournalEntrySchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Formato de fecha debe ser YYYY-MM-DD"),
  description: z.string().trim().min(1).max(500),
  reference: optNull(z.string().trim().max(100)),
  sourceType: z
    .enum([
      "MANUAL",
      "INVOICE_ISSUED",
      "INVOICE_RECEIVED",
      "PAYMENT",
      "RECONCILIATION",
      "FACTORING",
      "EXPENSE_REPORT",
      "OPENING",
      "CLOSING",
    ])
    .optional(),
  sourceId: optNull(z.string()),
  costCenterId: optNull(z.string().uuid()),
  lines: z.array(journalLineSchema).min(2, "Un asiento requiere al menos 2 lineas"),
});

// ── Suppliers ──

export const createSupplierSchema = z.object({
  rut: z.string().trim().min(8).max(12),
  name: z.string().trim().min(1).max(200),
  tradeName: optNull(z.string().trim().max(200)),
  address: optNull(z.string().trim().max(300)),
  commune: optNull(z.string().trim().max(100)),
  city: optNull(z.string().trim().max(100)),
  email: optNull(z.string().email()),
  phone: optNull(z.string().trim().max(20)),
  contactName: optNull(z.string().trim().max(200)),
  paymentTermDays: z.number().int().min(0).max(365).optional(),
  accountPayableId: optNull(z.string().uuid()),
  accountExpenseId: optNull(z.string().uuid()),
});

export const updateSupplierSchema = createSupplierSchema.partial().omit({ rut: true });

// ── DTE Issuance ──

const dteLineSchema = z.object({
  itemCode: optNull(z.string().trim().max(50)),
  itemName: z.string().trim().min(1).max(200),
  description: optNull(z.string().trim().max(500)),
  quantity: z.number().positive(),
  unit: optNull(z.string().trim().max(20)),
  unitPrice: z.number().min(0),
  discountPct: z.number().min(0).max(100).optional(),
  isExempt: z.boolean().optional(),
  accountId: optNull(z.string().uuid()),
  costCenterId: optNull(z.string().uuid()),
});

export const issueDteSchema = z.object({
  dteType: z.number().int().refine((v) => [33, 34, 39, 52, 56, 61].includes(v), {
    message: "Tipo de DTE invalido",
  }),
  receiverRut: z.string().trim().min(8).max(12),
  receiverName: z.string().trim().min(1).max(200),
  receiverEmail: optNull(z.string().email()),
  lines: z.array(dteLineSchema).min(1, "Debe incluir al menos una linea"),
  currency: z.enum(["CLP", "USD", "UF"]).optional(),
  notes: optNull(z.string().trim().max(1000)),
  accountId: optNull(z.string()),
  autoSendEmail: z.boolean().optional(),
});

export const dteCreditNoteSchema = z.object({
  referenceDteId: z.string().uuid(),
  reason: z.string().trim().min(1).max(500),
  referenceType: z.number().int().min(1).max(3).optional(),
  lines: z.array(dteLineSchema).min(1).optional(),
});

// ── Query params helpers ──

export const dateRangeQuerySchema = z.object({
  dateFrom: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  dateTo: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  status: z.string().optional(),
  sourceType: z.string().optional(),
  page: z.coerce.number().int().min(1).optional(),
  pageSize: z.coerce.number().int().min(1).max(100).optional(),
});

export const supplierQuerySchema = z.object({
  search: z.string().optional(),
  isActive: z.coerce.boolean().optional(),
  page: z.coerce.number().int().min(1).optional(),
  pageSize: z.coerce.number().int().min(1).max(100).optional(),
});

export const ledgerQuerySchema = z.object({
  dateFrom: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  dateTo: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
});
