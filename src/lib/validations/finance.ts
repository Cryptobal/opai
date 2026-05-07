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

/**
 * Valida el dígito verificador de un RUT chileno (módulo 11).
 * Acepta formatos "12.345.678-9", "12345678-9", "123456789".
 * Devuelve true si el DV es correcto. NO valida que el RUT exista en SII
 * (eso requiere consulta al SII y no es necesario para emitir DTE — el
 * SII solo rechaza por DV inválido, no por RUT inexistente).
 */
function validateRutDV(rut: string): boolean {
  const clean = rut.replace(/[^\dKk]/g, "").toUpperCase();
  if (clean.length < 2) return false;
  const cuerpo = clean.slice(0, -1);
  const dv = clean.slice(-1);
  if (!/^\d+$/.test(cuerpo)) return false;
  let suma = 0;
  let multi = 2;
  for (let i = cuerpo.length - 1; i >= 0; i--) {
    suma += parseInt(cuerpo[i], 10) * multi;
    multi = multi === 7 ? 2 : multi + 1;
  }
  const resto = 11 - (suma % 11);
  const dvCalc = resto === 11 ? "0" : resto === 10 ? "K" : String(resto);
  return dv === dvCalc;
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
  // Cuando currency=UF, unitPriceUf trae el precio en UF que el usuario
  // ingresó. El servicio convierte a CLP usando la UF del día y guarda
  // ambos. Para CLP queda undefined.
  unitPriceUf: z.number().positive().optional(),
  discountPct: z.number().min(0).max(100).optional(),
  isExempt: z.boolean().optional(),
  accountId: optNull(z.string().uuid()),
  costCenterId: optNull(z.string().uuid()),
  refuerzoSolicitudId: optNull(z.string().uuid()),
});

// Bloque <Referencia> SII para Notas de Crédito (61) y Débito (56).
// Para borradores también se acepta opcional para que el usuario pueda
// preparar la NC/ND antes de elegir el DTE original. Al emitir se valida
// que esté presente.
const dteReferenceSchema = z.object({
  docId: optNull(z.string().uuid()),
  type: z.number().int(),
  folio: z.number().int().min(1),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Fecha YYYY-MM-DD"),
  code: z.union([z.literal(1), z.literal(2), z.literal(3)]),
  reason: z.string().trim().min(1).max(500),
});

export const issueDteSchema = z.object({
  dteType: z.number().int().refine((v) => [33, 34, 39, 52, 56, 61].includes(v), {
    message: "Tipo de DTE invalido",
  }),
  receiverRut: z.string().trim().min(8).max(12).refine(validateRutDV, {
    message: "RUT inválido (dígito verificador no coincide)",
  }),
  receiverName: z.string().trim().min(1).max(200),
  receiverEmail: optNull(z.string().email()),
  // Datos del receptor (opcional — el provider usa defaults si no vienen).
  receiverGiro: optNull(z.string().trim().max(80)),
  receiverDireccion: optNull(z.string().trim().max(200)),
  receiverComuna: optNull(z.string().trim().max(80)),
  receiverCiudad: optNull(z.string().trim().max(80)),
  // Centros de costo: cliente CRM e instalación (opcional pero
  // recomendado para reportes financieros consolidados).
  crmAccountId: optNull(z.string().uuid()),
  installationId: optNull(z.string().uuid()),
  /**
   * Emails CC para el envío del PDF/XML. El XML del SII solo lleva el
   * receiverEmail principal. Estos son solo para la copia que envía OPAI.
   * Tope de 10 destinatarios para evitar abuso.
   */
  receiverEmailCc: z
    .array(z.string().email())
    .max(10, "Máximo 10 emails CC")
    .optional(),
  /**
   * Referencias adicionales (no-DTE): OC, HES, Contrato, Resolución, etc.
   * Cada referencia tiene tipo (TpoDocRef SII), folio (alfanumérico ok),
   * fecha (YYYY-MM-DD) y razón. Se concatenan al bloque <Referencia>
   * del XML SII. Tope de 40 según especificación SII (acá ponemos 30
   * para dejar margen si además hay reference principal).
   */
  additionalReferences: z
    .array(
      z.object({
        tipoDocRef: z.string().trim().min(1).max(10),
        folioRef: z.string().trim().min(1).max(40),
        fchRef: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Fecha YYYY-MM-DD"),
        razonRef: z.string().trim().min(1).max(90),
      }),
    )
    .max(30, "Máximo 30 referencias adicionales")
    .optional(),
  lines: z.array(dteLineSchema).min(1, "Debe incluir al menos una linea"),
  currency: z.enum(["CLP", "USD", "UF"]).optional(),
  notes: optNull(z.string().trim().max(1000)),
  accountId: optNull(z.string()),
  autoSendEmail: z.boolean().optional(),
  // Referencia al DTE original (obligatoria para tipos 56 y 61).
  reference: dteReferenceSchema.optional(),
  // Email XML al backoffice (contador): si null, se aplica el default
  // del tenant (TenantDteConfig.defaultXmlRecipientAlwaysSend).
  sendXmlToBackoffice: z.boolean().optional(),
  backofficeEmailsOverride: z.array(z.string().email()).max(5).optional(),
});

// Schema para plantillas de facturación recurrente. El cron diario crea
// un borrador (no emite directo) en cada nextRunAt.
export const recurringTemplateSchema = z.object({
  name: z.string().trim().min(1).max(100),
  isActive: z.boolean().default(true),
  dteType: z.number().int().refine((v) => [33, 34].includes(v), {
    message: "Solo Factura (33) y Factura Exenta (34) en recurrentes",
  }),
  receiverRut: z.string().refine(validateRutDV, {
    message: "RUT inválido (dígito verificador no coincide)",
  }),
  receiverName: z.string().trim().min(1).max(200),
  receiverEmail: optNull(z.string().email()),
  receiverEmailCc: z.array(z.string().email()).max(10).default([]),
  receiverGiro: optNull(z.string().trim().max(80)),
  receiverDireccion: optNull(z.string().trim().max(200)),
  receiverComuna: optNull(z.string().trim().max(80)),
  receiverCiudad: optNull(z.string().trim().max(80)),
  crmAccountId: optNull(z.string().uuid()),
  installationId: optNull(z.string().uuid()),
  currency: z.enum(["CLP", "UF"]).default("CLP"),
  lines: z.array(dteLineSchema).min(1, "Debe incluir al menos una linea"),
  notes: optNull(z.string().trim().max(1000)),
  additionalReferences: z
    .array(
      z.object({
        tipoDocRef: z.string().trim().min(1).max(10),
        folioRef: z.string().trim().min(1).max(40),
        fchRef: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Fecha YYYY-MM-DD"),
        razonRef: z.string().trim().min(1).max(90),
      }),
    )
    .max(30)
    .optional(),
  frequency: z.enum(["monthly", "biweekly", "weekly", "yearly"]),
  // Día del mes 1-31 (o -1 para último día del mes). monthly/yearly.
  dayOfMonth: z.number().int().min(-1).max(31).optional(),
  // Día de la semana 0=Domingo .. 6=Sábado. weekly/biweekly.
  dayOfWeek: z.number().int().min(0).max(6).optional(),
  // Mes del año 1-12. Solo yearly.
  monthOfYear: z.number().int().min(1).max(12).optional(),
  startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Fecha YYYY-MM-DD"),
  endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  autoSendEmail: z.boolean().default(true),
  // Política de fijación de UF (solo aplica si currency=UF). Default
  // RUN_DAY = comportamiento previo. Ver dte-recurring.service para
  // la semántica de cada policy.
  ufFixingPolicy: z
    .enum([
      "RUN_DAY",
      "LAST_DAY_PREV_MONTH",
      "FIRST_DAY_MONTH",
      "LAST_DAY_MONTH",
      "CUSTOM_DAY",
    ])
    .default("RUN_DAY"),
  ufFixingDay: z.number().int().min(1).max(31).nullable().optional(),
});

// Schema para crear/actualizar borradores. Es el mismo que issueDteSchema
// pero MÁS permisivo: receiverRut/Name pueden venir parciales mientras el
// usuario llena el form. La validación dura (RUT con DV correcto, refs
// para NC/ND) se aplica al emitir, no al guardar el borrador.
export const draftDteSchema = issueDteSchema.extend({
  receiverRut: z.string().trim().max(12).optional(),
  receiverName: z.string().trim().max(200).optional(),
  reference: dteReferenceSchema.optional(),
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

// ── Bank Accounts ──

export const createBankAccountSchema = z.object({
  bankCode: z.string().trim().min(1).max(10),
  bankName: z.string().trim().min(1).max(100),
  accountType: z.enum(["CHECKING", "SAVINGS", "VISTA"]),
  accountNumber: z.string().trim().min(1).max(30),
  currency: z.enum(["CLP", "USD", "UF"]).optional(),
  holderName: z.string().trim().min(1).max(200),
  holderRut: z.string().trim().min(8).max(12),
  accountPlanId: optNull(z.string().uuid()),
  isDefault: z.boolean().optional(),
});

export const updateBankAccountSchema = createBankAccountSchema.partial();

// ── Bank Transactions (manual entry) ──

export const createBankTransactionSchema = z.object({
  bankAccountId: z.string().uuid(),
  transactionDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Formato YYYY-MM-DD"),
  description: z.string().trim().min(1).max(500),
  reference: optNull(z.string().trim().max(100)),
  amount: z.number(),
  balance: z.number().optional(),
  category: optNull(z.string().trim().max(50)),
  source: z.enum(["API", "MANUAL", "CSV_IMPORT"]).optional(),
});

// ── DTE Received (purchase invoices) ──

export const registerReceivedDteSchema = z.object({
  dteType: z.number().int().refine((v) => [33, 34, 56, 61].includes(v), {
    message: "Tipo de DTE recibido inválido",
  }),
  folio: z.number().int().positive(),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  dueDate: optNull(z.string().regex(/^\d{4}-\d{2}-\d{2}$/)),
  issuerRut: z.string().trim().min(8).max(12),
  issuerName: z.string().trim().min(1).max(200),
  netAmount: z.number().min(0),
  exemptAmount: z.number().min(0).optional(),
  taxAmount: z.number().min(0),
  totalAmount: z.number().min(0),
  supplierId: optNull(z.string().uuid()),
  accountId: optNull(z.string().uuid()),
  notes: optNull(z.string().trim().max(1000)),
  receptionStatus: z.enum(["PENDING_REVIEW", "ACCEPTED", "CLAIMED", "PARTIAL_CLAIM"]).optional(),
});

export const updateReceivedDteSchema = z.object({
  dueDate: optNull(z.string().regex(/^\d{4}-\d{2}-\d{2}$/)),
  supplierId: optNull(z.string().uuid()),
  accountId: optNull(z.string().uuid()),
  receptionStatus: z.enum(["PENDING_REVIEW", "ACCEPTED", "CLAIMED", "PARTIAL_CLAIM"]).optional(),
  notes: optNull(z.string().trim().max(1000)),
});

/**
 * Zod schema para `POST /api/finance/billing/received/[id]/acuse`.
 * `action` es la intención de alto nivel del usuario; el service la
 * traduce internamente a las llamadas SimpleAPI ACD/RCD/ERM/RFP/RFT.
 */
export const acuseReceivedDteSchema = z.object({
  action: z.enum([
    "ACCEPT", // ACD + ERM (acepta y habilita uso de crédito IVA)
    "ACCEPT_CONTENT_ONLY", // solo ACD (sin acuse de mercaderías)
    "CLAIM_CONTENT", // RCD (rechazo de contenido)
    "CLAIM_PARTIAL", // RFP (faltante parcial mercaderías)
    "CLAIM_TOTAL", // RFT (faltante total mercaderías)
  ]),
  reason: optNull(z.string().trim().max(500)),
});

// ── Payment Records (supplier payments / customer collections) ──

export const createPaymentRecordSchema = z.object({
  type: z.enum(["COLLECTION", "DISBURSEMENT"]),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  amount: z.number().positive(),
  currency: z.enum(["CLP", "USD", "UF"]).optional(),
  paymentMethod: z.enum(["TRANSFER", "CHECK", "CASH", "CREDIT_CARD", "FACTORING", "COMPENSATION", "OTHER"]),
  bankAccountId: optNull(z.string().uuid()),
  checkNumber: optNull(z.string().trim().max(30)),
  transferReference: optNull(z.string().trim().max(100)),
  supplierId: optNull(z.string().uuid()),
  notes: optNull(z.string().trim().max(500)),
  allocations: z.array(z.object({
    dteId: z.string().uuid(),
    amount: z.number().positive(),
  })).optional(),
});

// ── Reconciliation ──

export const createReconciliationSchema = z.object({
  bankAccountId: z.string().uuid(),
  periodYear: z.number().int().min(2020).max(2099),
  periodMonth: z.number().int().min(1).max(12),
  bankBalance: z.number(),
  bookBalance: z.number(),
});

export const reconciliationMatchSchema = z.object({
  bankTransactionId: z.string().uuid(),
  paymentRecordId: optNull(z.string().uuid()),
  journalEntryId: optNull(z.string().uuid()),
  matchType: z.enum(["AUTO", "MANUAL"]),
});
