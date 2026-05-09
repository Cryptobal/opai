/**
 * Validations Zod para el módulo "Documento de Cobro" (Proforma /
 * Estado de Pago / DTE Preview).
 */

import { z } from "zod";

/* ────────────────────────────────────────────────────────────────────── */
/*  Firmantes (TenantBillingSigner)                                       */
/* ────────────────────────────────────────────────────────────────────── */

export const billingSignerSchema = z.object({
  name: z
    .string()
    .trim()
    .min(1, "El nombre es requerido")
    .max(120, "Máximo 120 caracteres"),
  role: z
    .string()
    .trim()
    .min(1, "El cargo es requerido")
    .max(120, "Máximo 120 caracteres"),
  signatureStorageKey: z.string().trim().max(500).nullable().optional(),
  displayOrder: z.number().int().min(0).max(10).default(0),
  isActive: z.boolean().optional().default(true),
});

export type BillingSignerInput = z.infer<typeof billingSignerSchema>;

export const billingSignerUpdateSchema = billingSignerSchema.partial();
export type BillingSignerUpdateInput = z.infer<typeof billingSignerUpdateSchema>;

/* ────────────────────────────────────────────────────────────────────── */
/*  Configuración de plantillas y branding del documento de cobro         */
/* ────────────────────────────────────────────────────────────────────── */

const optionalText = z.string().max(5000).nullable().optional();
const optionalShortText = z.string().max(200).nullable().optional();
const hexColor = z
  .string()
  .regex(/^#[0-9A-Fa-f]{6}$/i, "Color hex inválido (ej: #0D1117)")
  .nullable()
  .optional();

/**
 * Tokens válidos para `verificationCodeTemplate`.
 * Cualquier token desconocido `{{xxx}}` hará fallar la validación para
 * evitar typos como `{{anio}}` que el renderer dejaría literal.
 */
const KNOWN_VERIF_TOKENS = new Set([
  "year",
  "month",
  "folio",
  "accountSlug",
  "installationSlug",
]);

const verificationCodeTemplateSchema = z
  .string()
  .min(3)
  .max(120)
  .refine(
    (template) => {
      const tokens = template.match(/\{\{([^}]+)\}\}/g) ?? [];
      for (const raw of tokens) {
        const key = raw.replace(/[{}]/g, "").trim();
        if (!KNOWN_VERIF_TOKENS.has(key)) return false;
      }
      return true;
    },
    {
      message: `Plantilla con token desconocido. Tokens válidos: ${[...KNOWN_VERIF_TOKENS]
        .map((t) => `{{${t}}}`)
        .join(", ")}`,
    },
  );

export const tenantBillingDocConfigSchema = z.object({
  proformaEmailSubject: optionalText,
  proformaEmailIntro: optionalText,
  estadoPagoEmailSubject: optionalText,
  estadoPagoEmailIntro: optionalText,
  estadoPagoFooterLegal: optionalText,
  billingDocBrandPrimary: hexColor,
  billingDocBrandSecondary: hexColor,
  verificationCodeTemplate: verificationCodeTemplateSchema.optional(),
});

export type TenantBillingDocConfigInput = z.infer<
  typeof tenantBillingDocConfigSchema
>;

/* ────────────────────────────────────────────────────────────────────── */
/*  Configuración del documento de cobro POR CrmAccount                    */
/* ────────────────────────────────────────────────────────────────────── */

export const crmAccountBillingSchema = z.object({
  numeroOrdenContrato: z.string().trim().max(60).nullable().optional(),
  contactoEstadoPagoId: z.string().uuid().nullable().optional(),
  layoutDocumentoCobro: z
    .enum(["DTE_PREVIEW", "PROFORMA", "ESTADO_DE_PAGO"])
    .optional(),
});

export type CrmAccountBillingInput = z.infer<typeof crmAccountBillingSchema>;

/* ────────────────────────────────────────────────────────────────────── */
/*  Helpers                                                                */
/* ────────────────────────────────────────────────────────────────────── */

/**
 * Renderiza la plantilla del código de verificación con valores reales.
 * Tokens desconocidos se dejan literales (la validación previene esto al
 * persistir, pero es defensivo en runtime).
 */
export function renderVerificationCode(
  template: string,
  vars: {
    year: string | number;
    month: string | number;
    folio: string | number;
    accountSlug?: string;
    installationSlug?: string;
  },
): string {
  return template.replace(/\{\{([^}]+)\}\}/g, (match, key: string) => {
    const k = key.trim();
    if (k === "year") return String(vars.year);
    if (k === "month") return String(vars.month).padStart(2, "0");
    if (k === "folio") return String(vars.folio);
    if (k === "accountSlug") return vars.accountSlug ?? "";
    if (k === "installationSlug") return vars.installationSlug ?? "";
    return match;
  });
}
