/**
 * Zod validation schemas for the Document Management System
 */

import { z } from "zod";

// ── Template schemas ─────────────────────────────────────────

const docModuleEnum = z.enum(["crm", "payroll", "legal", "mail", "whatsapp"]);

export const createDocTemplateSchema = z.object({
  name: z.string().min(1, "Nombre requerido").max(200),
  description: z.string().max(500).optional(),
  content: z.any(), // Tiptap JSON
  module: docModuleEnum,
  category: z.string().min(1, "Categoría requerida"),
  tokensUsed: z.array(z.string()).optional(),
  isDefault: z.boolean().optional(),
  usageSlug: z.string().max(80).optional().nullable(),
});

export const updateDocTemplateSchema = z.object({
  name: z.string().min(1).max(200).optional(),
  description: z.string().max(500).optional().nullable(),
  content: z.any().optional(),
  module: docModuleEnum.optional(),
  category: z.string().min(1).optional(),
  tokensUsed: z.array(z.string()).optional(),
  isActive: z.boolean().optional(),
  isDefault: z.boolean().optional(),
  usageSlug: z.string().max(80).optional().nullable(),
  changeNote: z.string().max(200).optional(),
});

// ── Document schemas ─────────────────────────────────────────

export const createDocumentSchema = z.object({
  templateId: z.string().uuid().optional(),
  title: z.string().min(1, "Título requerido").max(300),
  content: z.any(), // Tiptap JSON (resolved or with tokens)
  tokenValues: z.record(z.string(), z.string()).optional(),
  module: docModuleEnum,
  category: z.string().min(1, "Categoría requerida"),
  effectiveDate: z.string().optional().nullable(),
  expirationDate: z.string().optional().nullable(),
  alertDaysBefore: z.number().int().min(1).max(365).optional(),
  associations: z
    .array(
      z.object({
        entityType: z.string().min(1),
        entityId: z.string().uuid(),
        role: z.enum(["primary", "related", "copy"]).optional(),
      })
    )
    .optional(),
});

export const updateDocumentSchema = z.object({
  title: z.string().min(1).max(300).optional(),
  content: z.any().optional(),
  tokenValues: z.record(z.string(), z.string()).optional(),
  status: z
    .enum(["draft", "review", "approved", "active", "expiring", "expired", "renewed"])
    .optional(),
  effectiveDate: z.string().optional().nullable(),
  expirationDate: z.string().optional().nullable(),
  renewalDate: z.string().optional().nullable(),
  alertDaysBefore: z.number().int().min(1).max(365).optional(),
  associations: z
    .array(
      z.object({
        entityType: z.string().min(1),
        entityId: z.string().uuid(),
        role: z.enum(["primary", "related", "copy"]).optional(),
      })
    )
    .optional(),
});

// ── Token resolve schema ─────────────────────────────────────

export const resolveTokensSchema = z.object({
  content: z.any(), // Tiptap JSON with tokens
  accountId: z.string().uuid().optional(),
  contactId: z.string().uuid().optional(),
  installationId: z.string().uuid().optional(),
  dealId: z.string().uuid().optional(),
  quoteId: z.string().uuid().optional(),
});

// ── Digital signature schemas ─────────────────────────────────

export const signatureRequestStatusSchema = z.enum([
  "draft",
  "pending",
  "in_progress",
  "completed",
  "cancelled",
  "expired",
]);

export const signatureRecipientStatusSchema = z.enum([
  "pending",
  "sent",
  "viewed",
  "signed",
  "declined",
  "expired",
]);

export const signatureRecipientRoleSchema = z.enum(["signer", "cc"]);
export const signatureMethodSchema = z.enum(["typed", "drawn", "uploaded"]);

const signatureRecipientInputSchema = z.object({
  name: z.string().min(2, "Nombre requerido").max(160),
  email: z.string().email("Email inválido").max(255),
  rut: z.string().max(20).optional().nullable(),
  role: signatureRecipientRoleSchema.default("signer"),
  signingOrder: z.number().int().min(1).default(1),
});

export const signingModeSchema = z.enum(["sequential", "parallel"]);

export const createSignatureRequestSchema = z.object({
  message: z.string().max(1500).optional().nullable(),
  expiresAt: z.string().datetime().optional().nullable(),
  signingMode: signingModeSchema.default("sequential"),
  recipients: z.array(signatureRecipientInputSchema).min(1, "Debe incluir al menos un firmante"),
});

export const cancelSignatureRequestSchema = z.object({
  reason: z.string().max(500).optional().nullable(),
});

export const signDocumentSchema = z.object({
  token: z.string().min(10),
  signerName: z.string().min(2).max(160),
  signerRut: z.string().max(20).optional().nullable(),
  method: signatureMethodSchema,
  typedName: z.string().max(160).optional().nullable(),
  fontFamily: z.string().max(80).optional().nullable(),
  signatureImageUrl: z.string().url().optional().nullable(),
  acceptedElectronicSignature: z.literal(true),
});

export const declineSignatureSchema = z.object({
  token: z.string().min(10),
  reason: z.string().min(3).max(500),
});

// ──────────────────────────────────────────────────────────────────
//  Upload Contract Schema — used by POST /api/crm/accounts/[id]/contracts
// ──────────────────────────────────────────────────────────────────

export const CONTRACT_CATEGORIES = [
  "contrato_cliente",
  "contrato_confidencialidad",
  "acuerdo_nivel_servicio",
  "adendum",
] as const;

export type ContractCategory = (typeof CONTRACT_CATEGORIES)[number];

export const CONTRACT_CATEGORY_LABELS: Record<ContractCategory, string> = {
  contrato_cliente: "Contrato Cliente",
  contrato_confidencialidad: "Acuerdo de Confidencialidad (NDA)",
  acuerdo_nivel_servicio: "Acuerdo de Nivel de Servicio (SLA)",
  adendum: "Adendum / Anexo",
};

/**
 * Validates fields parsed from the multipart upload of a manual contract PDF.
 * The actual `file` is validated separately (magic bytes + size) in the route.
 */
export const uploadContractSchema = z
  .object({
    title: z.string().trim().min(1, "Título requerido").max(300),
    category: z.enum(CONTRACT_CATEGORIES).default("contrato_cliente"),
    effectiveDate: z.string().optional().nullable(),
    expirationDate: z.string().optional().nullable(),
    durationMonths: z.coerce
      .number()
      .int()
      .min(1)
      .max(600)
      .optional()
      .nullable(),
    alertDaysBefore: z.coerce.number().int().min(1).max(365).default(30),
    // NOTE: `z.coerce.boolean()` uses the JS `Boolean()` constructor under the
    // hood, which converts ANY non-empty string (including the literal "false")
    // to `true`. Since this field arrives via FormData as a string, we must
    // preprocess it manually so "false" stays false.
    signedExternally: z
      .preprocess((v) => {
        if (typeof v === "boolean") return v;
        if (typeof v === "string") {
          const s = v.trim().toLowerCase();
          if (s === "true" || s === "1" || s === "on" || s === "yes") return true;
          if (s === "false" || s === "0" || s === "" || s === "off" || s === "no")
            return false;
        }
        return Boolean(v);
      }, z.boolean())
      .default(false),
    signedAt: z.string().optional().nullable(),
    signedBy: z.string().trim().max(200).optional().nullable(),
    notes: z.string().trim().max(2000).optional().nullable(),
    // ── Vinculación opcional con Flujo de Caja ──
    // Si el usuario habilita el toggle, se crea un FinanceCashflowItem mensual
    // que cobra `monthlyAmountClp` el día `paymentDay` desde `effectiveDate`
    // hasta `expirationDate`. Vinculado al contrato vía sourceRefId=document.id.
    installationId: z.string().uuid().optional().nullable(),
    addToCashflow: z
      .preprocess((v) => {
        if (typeof v === "boolean") return v;
        if (typeof v === "string") {
          const s = v.trim().toLowerCase();
          if (s === "true" || s === "1" || s === "on" || s === "yes") return true;
          if (s === "false" || s === "0" || s === "" || s === "off" || s === "no")
            return false;
        }
        return Boolean(v);
      }, z.boolean())
      .default(false),
    monthlyAmountClp: z.coerce.number().positive().optional().nullable(),
    /// "CLP" (default) o "UF". Si UF, el monto se persiste tal cual y la
    /// proyección lo convierte a CLP con la UF del día de pago.
    currency: z.enum(["CLP", "UF"]).optional().default("CLP"),
    paymentDay: z.coerce.number().int().min(-1).max(31).optional().nullable(),
  })
  .superRefine((val, ctx) => {
    if (val.effectiveDate && val.expirationDate) {
      const eff = new Date(val.effectiveDate);
      const exp = new Date(val.expirationDate);
      if (Number.isFinite(eff.getTime()) && Number.isFinite(exp.getTime()) && exp < eff) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["expirationDate"],
          message: "La fecha de vencimiento debe ser posterior a la fecha de inicio",
        });
      }
    }
    if (val.signedExternally && !val.signedAt) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["signedAt"],
        message: "Si fue firmado externamente, indica la fecha de firma",
      });
    }
    if (val.addToCashflow) {
      if (!val.monthlyAmountClp || val.monthlyAmountClp <= 0) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["monthlyAmountClp"],
          message: "Indica el monto mensual del contrato",
        });
      }
      if (val.paymentDay === null || val.paymentDay === undefined) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["paymentDay"],
          message: "Indica el día del mes en que se cobra",
        });
      }
      if (!val.effectiveDate) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["effectiveDate"],
          message: "La fecha de inicio es requerida si vinculás al flujo de caja",
        });
      }
    }
  });

/**
 * Computes expirationDate from effectiveDate + durationMonths.
 * Mirrors the convention used by `generate-service-contract.ts`:
 *   end = start + N months − 1 day (so a 12-month contract starting 2026-01-01
 *   expires on 2026-12-31, not 2027-01-01).
 *
 * Returns ISO date string (YYYY-MM-DD) or null if inputs are insufficient.
 */
export function computeExpirationFromDuration(
  effectiveDate: string | null | undefined,
  durationMonths: number | null | undefined,
): string | null {
  if (!effectiveDate || !durationMonths || durationMonths <= 0) return null;
  const m = effectiveDate.slice(0, 10).match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return null;
  const startYear = Number(m[1]);
  const startMonth = Number(m[2]) - 1;
  const startDay = Number(m[3]);
  const end = new Date(Date.UTC(startYear, startMonth + durationMonths, startDay));
  end.setUTCDate(end.getUTCDate() - 1);
  return end.toISOString().slice(0, 10);
}
