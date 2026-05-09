import { z } from "zod";
import { isValidRut } from "@/lib/chile-rut";

export const checkEmailSchema = z.object({
  email: z.string().email().max(200),
});

export const lookupRutSchema = z.object({
  rut: z.string().trim().min(8).max(15)
    .refine(isValidRut, "RUT inválido"),
});

export const signupSchema = z.object({
  // Cuenta del owner
  email: z.string().email().max(200).toLowerCase().trim(),
  password: z.string()
    .min(10, "Mínimo 10 caracteres")
    .max(200)
    .refine((p) => /[a-z]/.test(p) && /\d/.test(p), "Debe incluir letras y números"),
  ownerName: z.string().trim().min(2).max(150),
  ownerPhone: z.string().trim().max(30).optional(),

  // Empresa
  companyRut: z.string().trim().max(15).optional()
    .refine((r) => !r || isValidRut(r), "RUT inválido"),
  legalName: z.string().trim().max(200).optional(),
  commercialName: z.string().trim().min(2).max(150),
  proposedSlug: z.string().trim().regex(/^[a-z0-9-]+$/, "Solo minúsculas, números y guiones").min(3).max(40),
  industry: z.string().trim().max(50).optional(),
  estimatedGuards: z.enum(["1-5", "6-15", "16-30", "31-100", "101-300", "300+"]).optional(),

  // Domicilio
  address: z.string().trim().max(300).optional(),
  commune: z.string().trim().max(100).optional(),
  city: z.string().trim().max(100).optional(),
  giro: z.string().trim().max(300).optional(),

  // Tracking
  source: z.string().trim().max(50).optional(),
  utmSource: z.string().trim().max(100).optional(),
  utmCampaign: z.string().trim().max(100).optional(),
  utmMedium: z.string().trim().max(100).optional(),

  // Anti-bot
  honeypot: z.string().max(0).optional().default(""),
  turnstileToken: z.string().min(1, "Captcha requerido"),

  // Consentimiento
  acceptTerms: z.literal(true, { message: "Debes aceptar términos" }),
});

export type SignupInput = z.infer<typeof signupSchema>;

export const verifySignupSchema = z.object({
  token: z.string().min(20).max(100),
});

export const resendVerificationSchema = z.object({
  email: z.string().email().max(200),
});
