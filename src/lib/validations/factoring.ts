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

/** Datos extraídos del PDF de simulación del factoring (Fase 1). Todos
 *  los montos en CLP. Todos opcionales — si el usuario no subió PDF o
 *  la IA no pudo extraer un campo, el server persiste null. */
const simulationSnapshotSchema = z
  .object({
    fileUrl: z.string().url().optional().nullable(),
    fileKey: z.string().optional().nullable(),
    fileName: z.string().optional().nullable(),
    extractedJson: z.unknown().optional(),
    montoBruto: z.number().nonnegative().optional().nullable(),
    montoAGirar: z.number().nonnegative().optional().nullable(),
    difPrecio: z.number().nonnegative().optional().nullable(),
    comision: z.number().nonnegative().optional().nullable(),
    iva: z.number().nonnegative().optional().nullable(),
    gastosLegal: z.number().nonnegative().optional().nullable(),
    notaria: z.number().nonnegative().optional().nullable(),
    gastosOperacionales: z.number().nonnegative().optional().nullable(),
  })
  .strict();

/** Schema para POST cede en /api/finance/billing/issued/[id]/cede. */
export const cedeDteSchema = z.object({
  factoringCompanyId: z.string().uuid("factoringCompanyId debe ser uuid"),
  fechaCesion: yyyyMmDd,
  fechaVencimiento: yyyyMmDd,
  advanceRate: z.number().min(0).max(100),
  interestRate: z.number().min(0).max(100),
  commissionAmount: z.number().min(0),
  emailDeudor: z.string().email("Email deudor inválido").optional().or(z.literal("")),
  /** Lista ordenada de correos del deudor. El PRIMERO se embebe en el AEC
   *  (<eMailDeudor> — el SII admite uno solo); a TODOS les llega el aviso
   *  de cesión por correo. Puede ir vacía (SII_DIRECT). */
  deudorEmails: z
    .array(z.string().email("Email deudor inválido"))
    .max(20, "Máximo 20 correos de deudor")
    .optional(),
  notes: z.string().optional(),
  contactNombre: z.string().optional(),
  contactFono: z.string().optional(),
  contactEmail: z
    .string()
    .email("Email contacto inválido")
    .optional()
    .or(z.literal("")),
  simulation: simulationSnapshotSchema.optional(),
});

export type CedeDteSchema = z.infer<typeof cedeDteSchema>;

/** Schema para POST bulk-cede en /api/finance/factoring/bulk-cede (Fase 2).
 *  Cede N facturas bajo un mismo batch. Los totales se prorratean por
 *  monto bruto entre las N operaciones hijas. */
export const bulkCedeSchema = z.object({
  dteIds: z.array(z.string().uuid("dteId debe ser uuid")).min(2, "Mínimo 2 DTEs"),
  factoringCompanyId: z.string().uuid("factoringCompanyId debe ser uuid"),
  fechaCesion: yyyyMmDd,
  fechaVencimiento: yyyyMmDd,
  advanceRate: z.number().min(0).max(100),
  interestRate: z.number().min(0).max(100),
  totals: z
    .object({
      montoAGirar: z.number().nonnegative().optional().nullable(),
      difPrecio: z.number().nonnegative().optional().nullable(),
      comision: z.number().nonnegative().optional().nullable(),
      iva: z.number().nonnegative().optional().nullable(),
      gastosLegal: z.number().nonnegative().optional().nullable(),
      notaria: z.number().nonnegative().optional().nullable(),
      gastosOperacionales: z.number().nonnegative().optional().nullable(),
    })
    .partial()
    .default({}),
  emailDeudor: z.string().email("Email deudor inválido").optional().or(z.literal("")),
  notes: z.string().optional(),
  contactNombre: z.string().optional(),
  contactFono: z.string().optional(),
  contactEmail: z
    .string()
    .email("Email contacto inválido")
    .optional()
    .or(z.literal("")),
  simulation: simulationSnapshotSchema.optional(),
});

export type BulkCedeSchema = z.infer<typeof bulkCedeSchema>;

/** Schema para POST cancel. */
export const cancelOperationSchema = z.object({
  reason: z.string().min(3, "Razón de cancelación requerida (mín 3 chars)"),
});
