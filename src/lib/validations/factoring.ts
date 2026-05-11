/**
 * Zod schemas para los endpoints de factoring (Bloque 4 v3).
 */

import { z } from "zod";

const yyyyMmDd = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Fecha en formato YYYY-MM-DD requerida");

const pctField = (label: string) =>
  z
    .number()
    .min(0, `${label} no puede ser negativo`)
    .max(100, `${label} debe ser un porcentaje entre 0 y 100`)
    .nullable()
    .optional();

/** Schema para crear/actualizar empresas de factoring (catálogo). */
export const factoringCompanyInputSchema = z.object({
  rut: z.string().min(2, "RUT requerido"),
  razonSocial: z.string().min(2, "Razón social requerida"),
  direccion: z.string().nullable().optional(),
  comuna: z.string().nullable().optional(),
  ciudad: z.string().nullable().optional(),
  email: z.string().email("Email inválido").nullable().optional().or(z.literal("")),
  contactName: z.string().nullable().optional(),
  contactEmail: z
    .string()
    .email("Email de contacto inválido")
    .nullable()
    .optional()
    .or(z.literal("")),
  contactPhone: z.string().nullable().optional(),
  defaultAdvanceRate: pctField("Anticipo default"),
  defaultInterestRate: pctField("Interés mensual default"),
  /** @deprecated — se mantiene para no romper clientes legacy. La UI nueva usa defaultCommissionAmount (CLP). */
  defaultCommissionPct: pctField("Comisión default"),
  /** Monto fijo en CLP que cobra el factoring por cesión. */
  defaultCommissionAmount: z
    .number()
    .min(0, "Comisión default no puede ser negativa")
    .nullable()
    .optional(),
  notes: z.string().nullable().optional(),
});

export type FactoringCompanyInputSchema = z.infer<typeof factoringCompanyInputSchema>;

/** Schema para PATCH (todos los campos opcionales). */
export const factoringCompanyUpdateSchema = factoringCompanyInputSchema.partial();

/** Schema para POST cede en /api/finance/billing/issued/[id]/cede. */
export const cedeDteSchema = z.object({
  factoringCompanyId: z.string().uuid("factoringCompanyId debe ser uuid"),
  fechaCesion: yyyyMmDd,
  fechaVencimiento: yyyyMmDd,
  advanceRate: z.number().min(0).max(100),
  interestRate: z.number().min(0).max(100),
  commissionAmount: z.number().min(0),
  emailDeudor: z.string().email("Email deudor inválido").optional().or(z.literal("")),
  notes: z.string().optional(),
  contactNombre: z.string().optional(),
  contactFono: z.string().optional(),
  contactEmail: z
    .string()
    .email("Email contacto inválido")
    .optional()
    .or(z.literal("")),
});

export type CedeDteSchema = z.infer<typeof cedeDteSchema>;

/** Schema para POST cancel. */
export const cancelOperationSchema = z.object({
  reason: z.string().min(3, "Razón de cancelación requerida (mín 3 chars)"),
});
