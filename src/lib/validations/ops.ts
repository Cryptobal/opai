import { z } from "zod";
import {
  AFP_CHILE,
  BANK_ACCOUNT_TYPES,
  CHILE_BANK_CODES,
  DOCUMENT_STATUS,
  DOCUMENT_TYPES,
  GUARDIA_COMM_CHANNELS,
  GUARDIA_LIFECYCLE_STATUSES,
  HEALTH_SYSTEMS,
  ISAPRES_CHILE,
  PERSON_SEX,
  isChileanRutFormat,
  isValidChileanRut,
  isValidMobileNineDigits,
  normalizeMobileNineDigits,
  normalizeRut,
} from "@/lib/personas";

const weekdayEnum = z.enum([
  "monday",
  "tuesday",
  "wednesday",
  "thursday",
  "friday",
  "saturday",
  "sunday",
  // Also accept Spanish short names
  "lunes",
  "martes",
  "miercoles",
  "miércoles",
  "jueves",
  "viernes",
  "sabado",
  "sábado",
  "domingo",
  // Accept short labels from shared modal
  "Lun",
  "Mar",
  "Mié",
  "Jue",
  "Vie",
  "Sáb",
  "Dom",
]);

const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
const timeRegex = /^([01]\d|2[0-3]):([0-5]\d)$/;
const decimalCoordinateRegex = /^-?\d+(\.\d+)?$/;
const percentRegex = /^\d+(\.\d{1,2})?$/;

export const createPuestoSchema = z.object({
  installationId: z.string().uuid("installationId inválido"),
  name: z.string().trim().min(1, "Nombre es requerido").max(200),
  puestoTrabajoId: z.string().uuid("puestoTrabajoId inválido").optional().nullable(),
  cargoId: z.string().uuid("cargoId inválido").optional().nullable(),
  rolId: z.string().uuid("rolId inválido").optional().nullable(),
  shiftStart: z.string().regex(timeRegex, "shiftStart debe tener formato HH:MM"),
  shiftEnd: z.string().regex(timeRegex, "shiftEnd debe tener formato HH:MM"),
  weekdays: z.array(weekdayEnum).min(1, "Debe seleccionar al menos un día"),
  requiredGuards: z.number().int().min(1).max(20).default(1),
  baseSalary: z.number().min(0).optional().nullable(),
  teMontoClp: z.number().min(0).optional().nullable(),
  activeFrom: z.string().regex(dateRegex, "activeFrom debe tener formato YYYY-MM-DD").optional().nullable(),
  active: z.boolean().optional(),
});

export const updatePuestoSchema = z.object({
  name: z.string().trim().min(1).max(200).optional(),
  puestoTrabajoId: z.string().uuid("puestoTrabajoId inválido").optional().nullable(),
  cargoId: z.string().uuid("cargoId inválido").optional().nullable(),
  rolId: z.string().uuid("rolId inválido").optional().nullable(),
  shiftStart: z.string().regex(timeRegex, "shiftStart debe tener formato HH:MM").optional(),
  shiftEnd: z.string().regex(timeRegex, "shiftEnd debe tener formato HH:MM").optional(),
  weekdays: z.array(weekdayEnum).min(1).optional(),
  requiredGuards: z.number().int().min(1).max(20).optional(),
  baseSalary: z.number().min(0).optional().nullable(),
  teMontoClp: z.number().min(0).optional().nullable(),
  activeFrom: z.string().regex(dateRegex).optional().nullable(),
  activeUntil: z.string().regex(dateRegex).optional().nullable(),
  active: z.boolean().optional(),
});

export const bulkCreatePuestosSchema = z.object({
  installationId: z.string().uuid("installationId inválido"),
  puestos: z.array(createPuestoSchema.omit({ installationId: true })).min(1, "Debes enviar al menos un puesto"),
});

export const upsertPautaItemSchema = z.object({
  puestoId: z.string().uuid("puestoId inválido"),
  slotNumber: z.number().int().min(1).max(20).default(1),
  date: z.string().regex(dateRegex, "date debe tener formato YYYY-MM-DD"),
  plannedGuardiaId: z.string().uuid("plannedGuardiaId inválido").optional().nullable(),
  shiftCode: z.string().trim().max(20).optional().nullable(),
  status: z.string().trim().min(1).max(50).default("planificado"),
  notes: z.string().trim().max(2000).optional().nullable(),
});

export const generatePautaSchema = z.object({
  installationId: z.string().uuid("installationId inválido"),
  month: z.number().int().min(1).max(12),
  year: z.number().int().min(2020).max(2100),
  overwrite: z.boolean().default(false),
});

export const pintarSerieSchema = z.object({
  puestoId: z.string().uuid("puestoId inválido"),
  slotNumber: z.coerce.number().int().min(1).max(20),
  patternCode: z.string().trim().min(1).max(20),
  patternWork: z.coerce.number().int().min(1).max(30),
  patternOff: z.coerce.number().int().min(0).max(30),
  startDate: z.string().regex(dateRegex, "startDate debe tener formato YYYY-MM-DD"),
  startPosition: z.coerce.number().int().min(1).max(60),
  month: z.coerce.number().int().min(1).max(12),
  year: z.coerce.number().int().min(2020).max(2100),
  // Rotative shift fields (optional, backward compatible)
  isRotativo: z.boolean().default(false),
  rotatePuestoId: z.string().uuid("rotatePuestoId inválido").optional().nullable(),
  rotateSlotNumber: z.coerce.number().int().min(1).max(20).optional().nullable(),
  startShift: z.enum(["day", "night"]).optional().nullable(),
});

export const updateAsistenciaSchema = z.object({
  attendanceStatus: z.enum(["pendiente", "asistio", "no_asistio", "reemplazo", "ppc"]).optional(),
  actualGuardiaId: z.string().uuid("actualGuardiaId inválido").optional().nullable(),
  replacementGuardiaId: z.string().uuid("replacementGuardiaId inválido").optional().nullable(),
  plannedGuardiaId: z.string().uuid("plannedGuardiaId inválido").optional().nullable(),
  notes: z.string().trim().max(2000).optional().nullable(),
  checkInAt: z.string().datetime().optional().nullable(),
  checkOutAt: z.string().datetime().optional().nullable(),
  forceDeletePaidTe: z.boolean().optional(),
  forceDeleteReason: z.string().trim().max(500).optional().nullable(),
});

export const createGuardiaSchema = z.object({
  firstName: z.string().trim().min(1, "Nombre es requerido").max(100),
  lastName: z.string().trim().min(1, "Apellido es requerido").max(100),
  rut: z.string().trim()
    .refine((v) => isChileanRutFormat(v), "RUT debe ir sin puntos y con guión (ej: 12345678-5)")
    .refine((v) => isValidChileanRut(v), "RUT chileno inválido (dígito verificador incorrecto)")
    .transform((v) => normalizeRut(v)),
  email: z.string().trim().email("Email inválido").max(200),
  phone: z.string().trim().max(30).optional().nullable(),
  phoneMobile: z.string().trim()
    .refine((v) => isValidMobileNineDigits(v), "Celular debe tener exactamente 9 dígitos (sin +56)")
    .transform((v) => normalizeMobileNineDigits(v)),
  addressFormatted: z.string().trim().min(5, "Dirección es requerida").max(300),
  googlePlaceId: z.string().trim().min(10, "Debes seleccionar una dirección válida de Google Maps").max(200),
  addressLine1: z.string().trim().max(200).optional().nullable(),
  commune: z.string().trim().max(120).optional().nullable(),
  city: z.string().trim().max(120).optional().nullable(),
  region: z.string().trim().max(120).optional().nullable(),
  sex: z.enum(PERSON_SEX),
  lat: z.union([z.number(), z.string().regex(decimalCoordinateRegex)]).optional().nullable(),
  lng: z.union([z.number(), z.string().regex(decimalCoordinateRegex)]).optional().nullable(),
  birthDate: z.string().regex(dateRegex, "birthDate debe tener formato YYYY-MM-DD").optional().nullable(),
  afp: z.enum(AFP_CHILE).optional().nullable(),
  healthSystem: z.enum(HEALTH_SYSTEMS).optional().nullable(),
  isapreName: z.enum(ISAPRES_CHILE).optional().nullable(),
  isapreHasExtraPercent: z.boolean().optional().nullable(),
  isapreExtraPercent: z.union([z.number(), z.string().regex(percentRegex)]).optional().nullable(),
  hasMobilization: z.boolean().optional().nullable(),
  availableExtraShifts: z.boolean().optional().nullable(),
  notes: z.string().trim().max(2000).optional().nullable(),
  lifecycleStatus: z.enum(GUARDIA_LIFECYCLE_STATUSES).default("postulante"),
  bankCode: z.string().trim().max(20).optional().nullable(),
  bankName: z.string().trim().max(120).optional().nullable(),
  accountType: z.enum(BANK_ACCOUNT_TYPES).optional().nullable(),
  accountNumber: z.string().trim().max(100).optional().nullable(),
  holderName: z.string().trim().max(150).optional().nullable(),
}).superRefine((val, ctx) => {
  const hasBankData = Boolean(val.bankCode || val.accountType || val.accountNumber);
  if (hasBankData) {
    if (!val.bankCode || !CHILE_BANK_CODES.includes(val.bankCode)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["bankCode"],
        message: "Debes seleccionar un banco chileno válido",
      });
    }
    if (!val.accountType) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["accountType"],
        message: "Debes seleccionar el tipo de cuenta",
      });
    }
    if (!val.accountNumber?.trim()) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["accountNumber"],
        message: "Número de cuenta es requerido",
      });
    }
    // holderName se infiere del RUT si no se envía
  }
  if (val.healthSystem === "isapre" && !val.isapreName) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["isapreName"],
      message: "Debes indicar la Isapre",
    });
  }
  if (val.healthSystem !== "isapre" && val.isapreName) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["isapreName"],
      message: "Isapre solo aplica cuando salud es ISAPRE",
    });
  }
  if (val.healthSystem === "isapre" && val.isapreHasExtraPercent) {
    const pct = Number(val.isapreExtraPercent ?? 0);
    if (!Number.isFinite(pct) || pct <= 7) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["isapreExtraPercent"],
        message: "Debe indicar porcentaje mayor a 7%",
      });
    }
  }
});

export const updateGuardiaSchema = z.object({
  firstName: z.string().trim().min(1).max(100).optional(),
  lastName: z.string().trim().min(1).max(100).optional(),
  rut: z.string().trim()
    .refine((v) => isChileanRutFormat(v), "RUT debe ir sin puntos y con guión (ej: 12345678-5)")
    .refine((v) => isValidChileanRut(v), "RUT chileno inválido (dígito verificador incorrecto)")
    .transform((v) => normalizeRut(v))
    .optional()
    .nullable(),
  email: z.string().trim().email("Email inválido").max(200).optional().nullable().or(z.literal("")),
  phone: z.string().trim().max(30).optional().nullable(),
  phoneMobile: z.string().trim()
    .refine((v) => isValidMobileNineDigits(v), "Celular debe tener exactamente 9 dígitos (sin +56)")
    .transform((v) => normalizeMobileNineDigits(v))
    .optional()
    .nullable(),
  addressFormatted: z.string().trim().min(5).max(300).optional(),
  googlePlaceId: z.string().trim().min(10).max(200).optional(),
  addressLine1: z.string().trim().max(200).optional().nullable(),
  commune: z.string().trim().max(120).optional().nullable(),
  city: z.string().trim().max(120).optional().nullable(),
  region: z.string().trim().max(120).optional().nullable(),
  sex: z.enum(PERSON_SEX).optional().nullable(),
  lat: z.union([z.number(), z.string().regex(decimalCoordinateRegex)]).optional().nullable(),
  lng: z.union([z.number(), z.string().regex(decimalCoordinateRegex)]).optional().nullable(),
  birthDate: z.string().regex(dateRegex, "birthDate debe tener formato YYYY-MM-DD").optional().nullable(),
  afp: z.enum(AFP_CHILE).optional().nullable(),
  healthSystem: z.enum(HEALTH_SYSTEMS).optional().nullable(),
  isapreName: z.enum(ISAPRES_CHILE).optional().nullable(),
  isapreHasExtraPercent: z.boolean().optional().nullable(),
  isapreExtraPercent: z.union([z.number(), z.string().regex(percentRegex)]).optional().nullable(),
  hasMobilization: z.boolean().optional().nullable(),
  availableExtraShifts: z.boolean().optional().nullable(),
  notes: z.string().trim().max(2000).optional().nullable(),
  lifecycleStatus: z.enum(GUARDIA_LIFECYCLE_STATUSES).optional(),
  status: z.string().trim().max(50).optional(),
  hiredAt: z.string().regex(dateRegex, "hiredAt debe tener formato YYYY-MM-DD").optional().nullable(),
  terminatedAt: z.string().regex(dateRegex, "terminatedAt debe tener formato YYYY-MM-DD").optional().nullable(),
  terminationReason: z.string().trim().max(500).optional().nullable(),
});


export const createGuardiaBankAccountSchema = z.object({
  bankCode: z.string().trim().refine((v) => CHILE_BANK_CODES.includes(v), "Banco inválido"),
  bankName: z.string().trim().min(2).max(120),
  accountType: z.enum(BANK_ACCOUNT_TYPES),
  accountNumber: z.string().trim().min(4).max(100),
  holderName: z.string().trim().min(3).max(150),
  isDefault: z.boolean().default(false),
});

export const updateGuardiaBankAccountSchema = createGuardiaBankAccountSchema.partial();

export const createGuardiaDocumentSchema = z.object({
  type: z.enum(DOCUMENT_TYPES),
  fileUrl: z.string().trim().max(3000000).refine(
    (value) => /^https?:\/\//i.test(value) || value.startsWith("/uploads/guardias/"),
    "fileUrl inválido (debe ser URL https o path /uploads/guardias/)"
  ),
  status: z.enum(DOCUMENT_STATUS).default("pendiente"),
  issuedAt: z.string().regex(dateRegex, "issuedAt debe tener formato YYYY-MM-DD").optional().nullable(),
  expiresAt: z.string().regex(dateRegex, "expiresAt debe tener formato YYYY-MM-DD").optional().nullable(),
  notes: z.string().trim().max(1000).optional().nullable(),
});

export const updateGuardiaDocumentSchema = createGuardiaDocumentSchema.partial();

export const updateGuardiaLifecycleSchema = z.object({
  lifecycleStatus: z.enum(GUARDIA_LIFECYCLE_STATUSES),
  reason: z.string().trim().max(500).optional().nullable(),
  effectiveAt: z.string().regex(dateRegex, "effectiveAt debe tener formato YYYY-MM-DD").optional().nullable(),
});

export const sendGuardiaCommunicationSchema = z.object({
  channel: z.enum(GUARDIA_COMM_CHANNELS),
  templateId: z.string().trim().min(1, "templateId es requerido"),
});

export const rejectTeSchema = z.object({
  reason: z.string().trim().max(500).optional().nullable(),
});

export const aprobarTeSchema = z.object({
  amountClp: z.number().min(0).optional(),
});

export const createLoteTeSchema = z.object({
  weekStart: z.string().regex(dateRegex, "weekStart debe tener formato YYYY-MM-DD").optional(),
  weekEnd: z.string().regex(dateRegex, "weekEnd debe tener formato YYYY-MM-DD").optional(),
  turnoExtraIds: z.array(z.string().uuid()).min(1, "Selecciona al menos un turno extra").optional(),
});

const dateRegexYmd = /^\d{4}-\d{2}-\d{2}$/;

export const createTeManualSchema = z.object({
  installationId: z.string().uuid("installationId inválido"),
  puestoId: z.string().uuid("puestoId inválido").optional().nullable(),
  slotNumber: z.number().int().min(1).max(20).optional(),
  guardiaId: z.string().uuid("guardiaId inválido"),
  date: z.string().regex(dateRegexYmd, "date debe tener formato YYYY-MM-DD"),
  tipo: z.enum(["turno_extra", "hora_extra"], "tipo debe ser turno_extra o hora_extra"),
  amountClp: z.number().min(0).optional(),
  horasExtra: z.number().min(0).max(24).optional().nullable(),
  notes: z.string().trim().max(2000).optional().nullable(),
});
