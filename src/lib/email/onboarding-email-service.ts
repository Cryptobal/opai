/**
 * Servicio de envío de emails para Onboarding y Comunicaciones.
 * Usa Resend y el sistema de plantillas por bloques.
 */

import { resend, getTenantEmailConfig } from "@/lib/resend";
import { prisma } from "@/lib/prisma";
import { resolveVariables, replaceVariables } from "./resolve-variables";
import { renderEmailTemplate } from "./render-template";
import type { EmailBlock } from "./types";
import type { OpsEmailTemplateType, OpsEmailLogType, OpsEmailTrigger } from "@prisma/client";

function chunk<T>(arr: T[], size: number): T[][] {
  const result: T[][] = [];
  for (let i = 0; i < arr.length; i += size) {
    result.push(arr.slice(i, i + size));
  }
  return result;
}

export interface SendEmailParams {
  to: string;
  subject: string;
  html: string;
  from?: string;
  attachments?: Array<{ filename: string; content: Buffer }>;
  tags?: Array<{ name: string; value: string }>;
}

export async function sendOnboardingEmail(
  params: SendEmailParams,
  tenantId?: string
) {
  const config =
    params.from || !tenantId
      ? { from: params.from ?? "OPAI <opai@gard.cl>", replyTo: "" }
      : await getTenantEmailConfig(tenantId);

  const { data, error } = await resend.emails.send({
    from: params.from ?? config.from,
    to: params.to,
    subject: params.subject,
    html: params.html,
    attachments: params.attachments,
    tags: params.tags,
  });

  return { resendId: data?.id, error };
}

export interface SendToGuardiaParams {
  tenantId: string;
  guardiaId: string;
  templateId?: string;
  asunto: string;
  contenido: EmailBlock[];
  tipo: OpsEmailLogType;
  trigger?: OpsEmailTrigger;
  loteId?: string;
}

export async function sendEmailToGuardia(params: SendToGuardiaParams) {
  const { tenantId, guardiaId, templateId, asunto, contenido, tipo, trigger, loteId } = params;

  const variables = await resolveVariables(guardiaId);
  const html = renderEmailTemplate(contenido, variables);
  const subject = replaceVariables(asunto, variables);

  const guardia = await prisma.opsGuardia.findUnique({
    where: { id: guardiaId },
    include: { persona: true },
  });

  const email =
    guardia?.personalEmail ??
    guardia?.persona?.personalEmail ??
    guardia?.persona?.email ??
    "";

  if (!email) {
    return {
      success: false,
      error: "Guardia sin email configurado",
      emailLogId: null,
    };
  }

  const config = await getTenantEmailConfig(tenantId);

  const { data, error } = await resend.emails.send({
    from: config.from,
    to: email,
    subject,
    html,
    tags: [
      { name: "type", value: "onboarding" },
      { name: "guardiaId", value: guardiaId },
    ],
  });

  const estado = error ? "ERROR" : "ENVIADO";

  const emailLog = await prisma.opsEmailLog.create({
    data: {
      tenantId,
      templateId: templateId ?? null,
      guardiaId,
      tipo,
      trigger: trigger ?? null,
      destinatario: email,
      asunto: subject,
      contenido: contenido as unknown as object,
      estado,
      resendId: data?.id ?? null,
      error: error?.message ?? null,
      loteId: loteId ?? null,
    },
  });

  return {
    success: !error,
    error: error?.message ?? null,
    emailLogId: emailLog.id,
    resendId: data?.id,
  };
}

export async function sendBatchEmails(
  emails: Array<{ to: string; subject: string; html: string; tags?: Array<{ name: string; value: string }> }>,
  from: string
) {
  const batches = chunk(emails, 100);
  const results: Array<{ data?: { id: string }[]; error?: { message: string } }> = [];

  for (const batch of batches) {
    const { data, error } = await resend.batch.send(
      batch.map((e) => ({
        from,
        to: e.to,
        subject: e.subject,
        html: e.html,
        ...(e.tags && e.tags.length > 0 && { tags: e.tags }),
      }))
    );
    results.push({
      data: data as { id: string }[] | undefined,
      error: error as { message: string } | undefined,
    });
  }

  return results;
}
