/**
 * Email retry helper.
 * Envia un email vía Resend con backoff exponencial (1s/2s/4s).
 * Si los 3 intentos fallan, persiste en EmailDeadLetter para retry manual.
 */

import { resend } from "@/lib/resend";
import { prisma } from "@/lib/prisma";

type SendArgs = Parameters<typeof resend.emails.send>[0];

export interface EmailRetryContext {
  tenantId: string;
  purpose: string;
  refId?: string | null;
}

export interface EmailRetryResult {
  success: boolean;
  messageId?: string;
  error?: string;
}

export async function sendEmailWithRetry(
  args: SendArgs,
  context: EmailRetryContext
): Promise<EmailRetryResult> {
  const MAX_ATTEMPTS = 3;
  let lastError: unknown = null;

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    try {
      const { data, error } = await resend.emails.send(args);
      if (error) throw error;
      return { success: true, messageId: data?.id };
    } catch (err) {
      lastError = err;
      if (attempt < MAX_ATTEMPTS) {
        await new Promise((r) => setTimeout(r, 1000 * Math.pow(2, attempt - 1)));
      }
    }
  }

  try {
    await prisma.emailDeadLetter.create({
      data: {
        tenantId: context.tenantId,
        purpose: context.purpose,
        refId: context.refId ?? null,
        payload: args as unknown as object,
        errorMessage:
          lastError instanceof Error ? lastError.message : String(lastError),
      },
    });
  } catch (dlErr) {
    console.error("Failed to persist email dead letter:", dlErr);
  }

  return {
    success: false,
    error:
      lastError instanceof Error ? lastError.message : String(lastError),
  };
}
