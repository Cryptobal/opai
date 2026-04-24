/**
 * Resuelve tokens en plantillas de mensajes del módulo psych.
 * Tokens soportados: {{nombre}}, {{link}}, {{expira}}, {{tenant}}
 *
 * Para email (body HTML), `escapeHtml` sanitiza valores antes de la
 * sustitución. Para WhatsApp/SMS se usa texto plano (sin escape).
 */

export interface MessageTokenContext {
  nombre: string;
  link: string;
  expira: Date;
  tenant: string;
}

export type MessageChannel = "whatsapp" | "email" | "sms" | "copy-link";

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function formatDateCL(d: Date): string {
  return d.toLocaleDateString("es-CL", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
}

/**
 * Reemplaza tokens en la plantilla con los valores del contexto.
 * Si la plantilla es vacía o null, retorna "".
 */
export function resolveMessageTokens(
  template: string | null | undefined,
  ctx: MessageTokenContext,
  options?: { escape?: boolean },
): string {
  if (!template) return "";
  const esc = options?.escape ?? false;
  const pick = (v: string) => (esc ? escapeHtml(v) : v);

  return template
    .replace(/\{\{\s*nombre\s*\}\}/gi, pick(ctx.nombre))
    .replace(/\{\{\s*link\s*\}\}/gi, pick(ctx.link))
    .replace(/\{\{\s*expira\s*\}\}/gi, pick(formatDateCL(ctx.expira)))
    .replace(/\{\{\s*tenant\s*\}\}/gi, pick(ctx.tenant));
}

/**
 * Resuelve un template con las reglas de escape apropiadas al canal.
 */
export function resolveForChannel(
  template: string | null | undefined,
  channel: MessageChannel,
  ctx: MessageTokenContext,
): string {
  return resolveMessageTokens(template, ctx, {
    escape: channel === "email",
  });
}

export const DEFAULT_WHATSAPP_TEMPLATE =
  `Hola {{nombre}} 👋, te invitamos a completar una breve evaluación psicolaboral de {{tenant}}.

📱 Toma 20-25 minutos desde tu celular.
🔒 Tus respuestas son confidenciales.
📅 Vence el {{expira}}.

{{link}}

Cualquier duda, respondenos por aquí.`;

export const DEFAULT_EMAIL_SUBJECT = "Test psicolaboral — {{tenant}}";

export const DEFAULT_EMAIL_BODY =
  "Hola {{nombre}},\n\nTe enviamos el test psicolaboral de {{tenant}}. Puedes completarlo desde tu celular:\n\n{{link}}\n\nEste enlace expira el {{expira}}.\n\nSaludos.";

export const DEFAULT_SMS_TEMPLATE =
  "{{tenant}}: test psicolaboral para {{nombre}}. {{link}} (expira {{expira}}).";
