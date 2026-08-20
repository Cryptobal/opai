import { z } from "zod";
import { isValidChileanRut, normalizeRut } from "@/lib/personas";
import { STAFF_CARGOS } from "@/lib/personas-staff";

const optionalRut = z
  .string()
  .trim()
  .optional()
  .nullable()
  .transform((v) => {
    if (!v) return null;
    return normalizeRut(v);
  })
  .refine((v) => v == null || isValidChileanRut(v), "RUT chileno inválido");

const optionalEmail = z
  .string()
  .trim()
  .email("Email inválido")
  .max(200)
  .optional()
  .nullable()
  .or(z.literal("").transform(() => null));

export const createStaffPersonaSchema = z.object({
  firstName: z.string().trim().max(100).optional(),
  lastName: z.string().trim().max(100).optional(),
  rut: optionalRut,
  email: optionalEmail,
  phone: z.string().trim().max(30).optional().nullable(),
  cargoStaff: z.enum(STAFF_CARGOS).optional().nullable(),
  adminId: z.string().trim().min(1).max(64).optional().nullable(),
  personaId: z.string().uuid().optional().nullable(),
  afp: z.string().trim().max(80).optional().nullable(),
  healthSystem: z.string().trim().max(40).optional().nullable(),
  isapreName: z.string().trim().max(80).optional().nullable(),
  baseSalary: z.number().positive().optional(),
  colacion: z.number().min(0).optional(),
  movilizacion: z.number().min(0).optional(),
  gratificationType: z.enum(["AUTO_25", "CUSTOM"]).optional(),
  gratificationCustomAmount: z.number().min(0).optional().nullable(),
});

export const updateStaffPersonaSchema = z.object({
  firstName: z.string().trim().min(1).max(100).optional(),
  lastName: z.string().trim().min(1).max(100).optional(),
  rut: optionalRut,
  email: optionalEmail,
  phone: z.string().trim().max(30).optional().nullable(),
  cargoStaff: z.enum(STAFF_CARGOS).optional().nullable(),
  adminId: z.string().trim().min(1).max(64).optional().nullable(),
  status: z.enum(["active", "inactive"]).optional(),
  afp: z.string().trim().max(80).optional().nullable(),
  healthSystem: z.string().trim().max(40).optional().nullable(),
  isapreName: z.string().trim().max(80).optional().nullable(),
  personalEmail: z.string().trim().email().max(200).optional().nullable(),
});

export const staffSalaryStructureSchema = z.object({
  baseSalary: z.number().positive("baseSalary es requerido"),
  colacion: z.number().min(0).optional(),
  movilizacion: z.number().min(0).optional(),
  gratificationType: z.enum(["AUTO_25", "CUSTOM"]).optional(),
  gratificationCustomAmount: z.number().min(0).optional().nullable(),
  effectiveFrom: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().nullable(),
  effectiveUntil: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().nullable(),
  isActive: z.boolean().optional(),
});
