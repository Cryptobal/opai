import { z } from "zod";
import { isValidRut } from "@/lib/chile-rut";

const FREE_EMAIL_DOMAINS = new Set([
  "gmail.com", "yahoo.com", "hotmail.com", "outlook.com", "live.com",
  "icloud.com", "me.com", "aol.com", "yahoo.es", "yahoo.cl", "hotmail.cl",
  "hotmail.es", "outlook.es", "msn.com", "protonmail.com", "proton.me",
]);

export function isFreeEmail(email: string): boolean {
  const domain = email.split("@")[1]?.toLowerCase().trim();
  return !!domain && FREE_EMAIL_DOMAINS.has(domain);
}

export const step1Schema = z.object({
  email: z.string().email("Email inválido").max(200).trim().toLowerCase(),
  password: z
    .string()
    .min(10, "Mínimo 10 caracteres")
    .max(200)
    .refine((p) => /[a-z]/i.test(p) && /\d/.test(p), "Debe incluir letras y números"),
  ownerName: z.string().trim().min(2, "Mínimo 2 caracteres").max(150),
  ownerPhone: z
    .string()
    .trim()
    .max(30)
    .optional()
    .refine((v) => !v || /^[+\d\s\-()]{7,}$/.test(v), "Teléfono inválido"),
  acceptTerms: z.literal(true, { message: "Debes aceptar los términos" }),
});

export type Step1Input = z.infer<typeof step1Schema>;

export const step2Schema = z
  .object({
    companyRut: z
      .string()
      .trim()
      .max(15)
      .optional()
      .refine((r) => !r || isValidRut(r), "RUT inválido"),
    legalName: z.string().trim().max(200).optional(),
    commercialName: z.string().trim().min(2, "Mínimo 2 caracteres").max(150),
    proposedSlug: z
      .string()
      .trim()
      .toLowerCase()
      .min(3, "Mínimo 3 caracteres")
      .max(40, "Máximo 40 caracteres")
      .regex(/^[a-z0-9-]+$/, "Solo minúsculas, números y guiones"),
    address: z.string().trim().max(300).optional(),
    commune: z.string().trim().max(100).optional(),
    city: z.string().trim().max(100).optional(),
    giro: z.string().trim().max(300).optional(),
  });

export type Step2Input = z.infer<typeof step2Schema>;

export const step3Schema = z.object({
  industry: z.string().trim().max(50).optional(),
  estimatedGuards: z
    .enum(["1-5", "6-15", "16-30", "31-100", "101-300", "300+"])
    .optional(),
  source: z.string().trim().max(50).optional(),
  turnstileToken: z.string().min(1, "Captcha requerido"),
  honeypot: z.string().max(0).optional().default(""),
});

export type Step3Input = z.infer<typeof step3Schema>;

export interface PasswordStrengthResult {
  score: 0 | 1 | 2 | 3 | 4;
  label: "Muy débil" | "Débil" | "Regular" | "Buena" | "Excelente";
  hints: string[];
}

export function calculatePasswordStrength(p: string): PasswordStrengthResult {
  const hints: string[] = [];
  let score = 0;

  if (p.length >= 10) score++;
  else hints.push("Al menos 10 caracteres");

  if (/[a-z]/.test(p) && /[A-Z]/.test(p)) score++;
  else hints.push("Mezcla mayúsculas y minúsculas");

  if (/\d/.test(p)) score++;
  else hints.push("Incluye al menos un número");

  if (/[^a-zA-Z0-9]/.test(p)) score++;
  else hints.push("Agrega un símbolo (mayor seguridad)");

  const labels: PasswordStrengthResult["label"][] = [
    "Muy débil",
    "Débil",
    "Regular",
    "Buena",
    "Excelente",
  ];

  return {
    score: Math.min(score, 4) as PasswordStrengthResult["score"],
    label: labels[Math.min(score, 4)],
    hints,
  };
}
