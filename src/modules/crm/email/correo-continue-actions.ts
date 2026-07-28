/**
 * Acciones de continuación deterministas tras el resumen del hilo.
 * Puro: usa solo datos ya presentes en CorreoDetail — no llama al modelo.
 */

export type ContinueActionId =
  | "primary"
  | "deadline"
  | "attachments"
  | "associate"
  | "reply"
  | "since-read";

export type ContinueAction = {
  id: ContinueActionId;
  label: string;
  tone: "primary" | "warn" | "neutral";
};

const MAX_ACTIONS = 4;

function daysUntil(isoDate: string, now = new Date()): number | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(isoDate);
  if (!m) return null;
  const target = Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  const today = Date.UTC(now.getFullYear(), now.getMonth(), now.getDate());
  return Math.round((target - today) / 86_400_000);
}

function formatDdMm(isoDate: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(isoDate);
  if (!m) return isoDate;
  return `${m[3]}-${m[2]}`;
}

export type ResolveContinueActionsInput = {
  /** Título de la acción principal (p. ej. primaryActionCopy(...).title). */
  primaryTitle?: string | null;
  /** true si la acción principal ya se ejecutó en esta sesión. */
  primaryExecuted?: boolean;
  /**
   * Si true, incluye la acción principal en la lista de «Continuar».
   * Default false: el CTA héroe ya la muestra; no duplicar.
   */
  includePrimary?: boolean;
  /** Cursor de lectura capturado al abrir (no el sello post-markRead). */
  lastReadAt: string | null;
  messages: Array<{ sentAt: string | null }>;
  dealFechaEntrega: string | null;
  attachments: Array<{ savedFileId?: string | null }>;
  /** Si true, no se ofrece guardar adjuntos (recuento no fiable). */
  degraded?: boolean;
  accountId: string | null;
  /** false oculta acciones que mutan (usuario solo lectura). */
  canEdit?: boolean;
  now?: Date;
};

/**
 * Resuelve hasta 4 acciones de continuación, en el orden del brief §12.
 */
export function resolveContinueActions(input: ResolveContinueActionsInput): ContinueAction[] {
  const {
    primaryTitle,
    primaryExecuted = false,
    includePrimary = false,
    lastReadAt,
    messages,
    dealFechaEntrega,
    attachments,
    degraded = false,
    accountId,
    canEdit = true,
    now = new Date(),
  } = input;

  const actions: ContinueAction[] = [];

  if (includePrimary && primaryTitle && !primaryExecuted && canEdit) {
    actions.push({ id: "primary", label: primaryTitle, tone: "primary" });
  }

  if (lastReadAt) {
    const cursor = Date.parse(lastReadAt);
    if (!Number.isNaN(cursor)) {
      const hasNewer = messages.some((m) => {
        if (!m.sentAt) return false;
        const t = Date.parse(m.sentAt);
        return !Number.isNaN(t) && t > cursor;
      });
      if (hasNewer) {
        actions.push({
          id: "since-read",
          label: "Novedades desde tu lectura",
          tone: "warn",
        });
      }
    }
  }

  if (dealFechaEntrega) {
    const days = daysUntil(dealFechaEntrega, now);
    if (days != null && days >= -30 && days <= 365) {
      actions.push({
        id: "deadline",
        label: `Agendar cierre ${formatDdMm(dealFechaEntrega)}`,
        tone: "warn",
      });
    }
  }

  if (!degraded && attachments.length > 0) {
    const pending = attachments.filter((a) => !a.savedFileId).length;
    if (pending > 0 && canEdit) {
      actions.push({
        id: "attachments",
        label: `Guardar ${pending} adjunto${pending === 1 ? "" : "s"}`,
        tone: "warn",
      });
    }
  }

  if (accountId == null && canEdit) {
    actions.push({ id: "associate", label: "Asociar cuenta", tone: "warn" });
  }

  actions.push({ id: "reply", label: "Redactar respuesta", tone: "neutral" });

  return actions.slice(0, MAX_ACTIONS);
}
