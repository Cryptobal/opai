/**
 * Email retry helper con backoff exponencial y persistencia en dead-letter.
 *
 * Por qué: el envío del email comercial cuando entra un lead no debe perderse
 * por un fallo transitorio de Resend. Si los 3 intentos fallan, el payload
 * queda persistido en EmailDeadLetter para reintento manual desde la UI del
 * CRM.
 *
 * No bloquea el flujo: la creación del lead ya ocurrió antes de llegar aquí,
 * por lo que un fallo definitivo solo significa que no notificamos por email
 * (la push notification y la bell siguen activas).
 */

import { resend } from "@/lib/resend";
import { prisma } from "@/lib/prisma";

type SendArgs = Parameters<typeof resend.emails.send>[0];

export type EmailRetryContext = {
  tenantId: string;
  /** Slug semántico — ej: 'lead_commercial', 'lead_client', 'inquiry_admin'. */
  purpose: string;
  /** Id de la entidad relacionada (leadId, inquiryId, etc.). */
  refId?: string | null;
};

export type EmailRetryResult =
  | { success: true; messageId?: string }
  | { success: false; error: string };

const MAX_ATTEMPTS = 3;

export async function sendEmailWithRetry(
  args: SendArgs,
  context: EmailRetryContext
): Promise<EmailRetryResult> {
  let lastError: unknown = null;

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    try {
      const { data, error } = await resend.emails.send(args);
      if (error) throw error;
      return { success: true, messageId: data?.id };
    } catch (err) {
      lastError = err;
      if (attempt < MAX_ATTEMPTS) {
        // Backoff exponencial: 1s, 2s
        await new Promise((r) => setTimeout(r, 1000 * Math.pow(2, attempt - 1)));
      }
    }
  }

  const errorMessage =
    lastError instanceof Error ? lastError.message : String(lastError);

  try {
    await prisma.emailDeadLetter.create({
      data: {
        tenantId: context.tenantId,
        purpose: context.purpose,
        refId: context.refId ?? null,
        payload: args as unknown as object,
        errorMessage,
      },
    });
  } catch (dlErr) {
    // Si ni siquiera podemos persistir en dead-letter, lo único que queda es
    // dejar trazabilidad en logs. NO re-lanzar — el caller espera que esto
    // sea fail-soft.
    console.error("Failed to persist email dead letter:", dlErr);
  }

  return { success: false, error: errorMessage };
}
