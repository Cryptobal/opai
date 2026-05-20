import "server-only";
import {
  resend,
  getTenantEmailRouting,
  buildDeliverabilityHeaders,
  type EmailModule,
} from "@/lib/resend";

export interface SendTenantEmailInput {
  /** Tenant que envía. Obligatorio para resolver from/replyTo/bcc. */
  tenantId: string;
  /** Módulo lógico del envío. Determina el routing (reply-to y CCO automático). */
  module: EmailModule;
  /** Identificador del tipo de correo (usado para logging y, en Bloque 4, para toggles). */
  kind: string;
  /** Destinatario(s) principal(es). */
  to: string | string[];
  subject: string;
  /** Al menos uno de html / text debe estar presente. */
  html?: string;
  text?: string;
  /** Destinatarios en copia visible (CC). */
  cc?: string[];
  /** Destinatarios en copia oculta MANUAL (se merge con la CCO automática del módulo). */
  bcc?: string[];
  /** Override del reply-to para este envío específico. Si no se pasa, usa el del módulo. */
  replyToOverride?: string;
  /** Override del FROM (display name + address). Sólo usar en casos justificados (DTE legacy). */
  fromOverride?: string;
  attachments?: Array<{
    filename: string;
    content: Buffer | string;
    contentType?: string;
  }>;
  tags?: Array<{ name: string; value: string }>;
  /** Headers extra (List-Unsubscribe, X-Opai-*, In-Reply-To, etc). Se mergean con los de deliverability. */
  headers?: Record<string, string>;
}

export interface SendTenantEmailResult {
  /** Resend message id, null si falló o se skipeó. */
  resendId: string | null;
  /** Destinatarios efectivos. */
  effectiveTo: string[];
  effectiveCc: string[];
  effectiveBcc: string[];
  effectiveFrom: string;
  effectiveReplyTo: string;
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function dedupeCaseInsensitive(emails: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const e of emails) {
    const trimmed = e.trim();
    const key = trimmed.toLowerCase();
    if (!key || !EMAIL_RE.test(key)) continue;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(trimmed);
  }
  return out;
}

/**
 * Envía un correo del tenant al receptor, aplicando el routing por módulo:
 *   - From: del tenant (no env global).
 *   - Reply-To: del módulo si está configurado, sino el global del tenant.
 *   - BCC: automático del módulo + manual del caller, deduplicado.
 *   - Headers de deliverability (List-Unsubscribe).
 *
 * Si el tenant no tiene from configurado, lanza error (fail-loud — multi-tenant isolation).
 */
export async function sendTenantEmail(
  input: SendTenantEmailInput,
): Promise<SendTenantEmailResult> {
  if (!input.html && !input.text) {
    throw new Error("sendTenantEmail: debes pasar `html` o `text`.");
  }

  const routing = await getTenantEmailRouting(input.tenantId);
  const mod = routing.modules[input.module];

  const effectiveFrom = (input.fromOverride ?? routing.from ?? "").trim();
  if (!effectiveFrom || !effectiveFrom.includes("@")) {
    throw new Error(
      `sendTenantEmail: tenant ${input.tenantId} no tiene "from" configurado. Configurar en Empresa → Correo Electrónico.`,
    );
  }

  const effectiveReplyTo = (
    input.replyToOverride ?? mod.replyTo ?? routing.replyToGlobal ?? ""
  ).trim();

  const toArr = Array.isArray(input.to) ? input.to : [input.to];
  const effectiveTo = dedupeCaseInsensitive(toArr);
  if (effectiveTo.length === 0) {
    throw new Error("sendTenantEmail: `to` vacío o sin emails válidos.");
  }

  const effectiveCc = dedupeCaseInsensitive(input.cc ?? []);

  // BCC = manual + automático del módulo, deduplicado y excluyendo to/cc para evitar dobles.
  const toLowerSet = new Set([
    ...effectiveTo.map((e) => e.toLowerCase()),
    ...effectiveCc.map((e) => e.toLowerCase()),
  ]);
  const effectiveBcc = dedupeCaseInsensitive([
    ...(input.bcc ?? []),
    ...mod.bcc,
  ]).filter((e) => !toLowerSet.has(e.toLowerCase()));

  const headers: Record<string, string> = {
    ...buildDeliverabilityHeaders(effectiveReplyTo || undefined),
    "X-Opai-Tenant-Id": input.tenantId,
    "X-Opai-Module": input.module,
    "X-Opai-Kind": input.kind,
    ...(input.headers ?? {}),
  };

  let resendId: string | null = null;
  try {
    // El SDK de Resend exige html | text | react | template como discriminator.
    // Construimos el payload garantizando que html siempre exista (o text como
    // fallback) para evitar el union narrowing del SDK.
    const result = input.html
      ? await resend.emails.send({
          from: effectiveFrom,
          to: effectiveTo,
          cc: effectiveCc.length > 0 ? effectiveCc : undefined,
          bcc: effectiveBcc.length > 0 ? effectiveBcc : undefined,
          replyTo: effectiveReplyTo || undefined,
          subject: input.subject,
          html: input.html,
          text: input.text,
          attachments:
            input.attachments && input.attachments.length > 0
              ? input.attachments
              : undefined,
          tags: input.tags && input.tags.length > 0 ? input.tags : undefined,
          headers,
        })
      : await resend.emails.send({
          from: effectiveFrom,
          to: effectiveTo,
          cc: effectiveCc.length > 0 ? effectiveCc : undefined,
          bcc: effectiveBcc.length > 0 ? effectiveBcc : undefined,
          replyTo: effectiveReplyTo || undefined,
          subject: input.subject,
          text: input.text!,
          attachments:
            input.attachments && input.attachments.length > 0
              ? input.attachments
              : undefined,
          tags: input.tags && input.tags.length > 0 ? input.tags : undefined,
          headers,
        });
    resendId = result.data?.id ?? null;
  } catch (err) {
    console.error(
      `[sendTenantEmail] tenant=${input.tenantId} module=${input.module} kind=${input.kind} error:`,
      err,
    );
    throw err;
  }

  return {
    resendId,
    effectiveTo,
    effectiveCc,
    effectiveBcc,
    effectiveFrom,
    effectiveReplyTo,
  };
}
