/**
 * Cifrado de campos sensibles de OpsPersona en reposo (Ley 21.719 Fase 2).
 *
 * Estrategia: cifrado a nivel de aplicación con AES-256-GCM (ver crypto.ts).
 * - Fail-open: si no hay PERSONA_ENCRYPTION_KEY, los valores pasan en texto plano
 *   (esto permite ambientes de desarrollo sin clave configurada).
 * - Migración progresiva: el descifrado captura errores y devuelve el valor
 *   original, lo que permite que datos legacy en texto plano sigan leyéndose
 *   correctamente mientras se rota a cifrado.
 *
 * IMPORTANTE: estos campos NO deben usarse en filtros/where de Prisma una vez
 * cifrados, porque el ciphertext es no determinístico (IV aleatorio en cada
 * cifrado). Los campos elegidos (afp, healthSystem, isapreName) no se usan en
 * búsquedas operacionales.
 */

import { encryptText, decryptText } from "@/lib/crypto";

const ENCRYPTION_SECRET =
  process.env.PERSONA_ENCRYPTION_KEY || process.env.AUTH_SECRET || "";

/** Campos de OpsPersona que se cifran en reposo. */
export const ENCRYPTED_PERSONA_FIELDS = [
  "afp",
  "healthSystem",
  "isapreName",
] as const;

type EncryptedField = (typeof ENCRYPTED_PERSONA_FIELDS)[number];

/**
 * Cifra los campos sensibles del input antes de un create/update de Prisma.
 * Acepta cualquier objeto parcial y solo modifica los campos definidos en
 * ENCRYPTED_PERSONA_FIELDS si tienen un string no vacío.
 */
export function encryptPersonaFields<T extends Record<string, unknown>>(data: T): T {
  if (!ENCRYPTION_SECRET) return data;
  const result = { ...data } as Record<string, unknown>;
  for (const field of ENCRYPTED_PERSONA_FIELDS) {
    const value = result[field];
    if (typeof value === "string" && value.length > 0) {
      result[field] = encryptText(value, ENCRYPTION_SECRET);
    }
  }
  return result as T;
}

/**
 * Descifra los campos sensibles después de leer un OpsPersona desde Prisma.
 * Tolerante a valores plaintext legacy (try/catch silencioso).
 */
export function decryptPersonaFields<T extends Record<string, unknown> | null | undefined>(
  data: T
): T {
  if (!data || !ENCRYPTION_SECRET) return data;
  const result = { ...data } as Record<string, unknown>;
  for (const field of ENCRYPTED_PERSONA_FIELDS) {
    const value = result[field];
    if (typeof value === "string" && value.length > 0) {
      try {
        result[field] = decryptText(value, ENCRYPTION_SECRET);
      } catch {
        // Valor legacy en texto plano — dejarlo tal cual.
      }
    }
  }
  return result as T;
}

/** True si la clave de cifrado está configurada. */
export function isPersonaEncryptionEnabled(): boolean {
  return !!ENCRYPTION_SECRET;
}
