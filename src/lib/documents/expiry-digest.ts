/**
 * Resumen agrupado de vencimientos para el digest diario y la bandeja (Fase 18).
 *
 * El digest es el canal por defecto de la escalera: los hitos T-30..T-3 viven
 * SOLO aquí. Es un snapshot del estado (no un goteo de crossings): todo
 * documento dentro de su ventana de atención aparece, anotando los que están
 * "En trámite". Los silenciados NO generan tarjetas pero sí se listan.
 */

import {
  collectAllExpiryItems,
  currentMilestone,
  dayKeyOf,
  describeDue,
  getCardBudgetState,
  getExpiryPolicy,
  type ExpiryDocItem,
  type ExpiryPolicy,
} from "@/lib/documents/expiry-engine";

export type DigestEntry = {
  kind: ExpiryDocItem["kind"];
  id: string;
  label: string;
  contextLabel: string;
  installationId: string | null;
  guardiaId: string | null;
  daysRemaining: number;
  expiresAt: Date;
  dueText: string;
  /** "En trámite" vigente. */
  enTramite: boolean;
  criticoLegal: boolean;
  link: string;
};

export type ExpiryDigestSummary = {
  total: number;
  vencidos: DigestEntry[];
  /** Vencen en 0..7 días. */
  estaSemana: DigestEntry[];
  /** Vencen después de esta semana pero ya cruzaron su primer hito. */
  esteMes: DigestEntry[];
  /** Cuántos del total están marcados "En trámite". */
  enTramite: number;
  /** Tarjetas plegadas al digest por el tope diario. */
  overflowCards: number;
  policy: ExpiryPolicy;
};

function toEntry(item: ExpiryDocItem, today: Date): DigestEntry {
  return {
    kind: item.kind,
    id: item.id,
    label: item.label,
    contextLabel: item.contextLabel,
    installationId: item.installationId,
    guardiaId: item.guardiaId,
    daysRemaining: item.daysRemaining,
    expiresAt: item.expiresAt,
    dueText: describeDue(item.daysRemaining, item.expiresAt),
    enTramite:
      item.renewalInProgressUntil !== null &&
      item.renewalInProgressUntil.getTime() >= today.getTime(),
    criticoLegal: item.criticoLegal,
    link: item.link,
  };
}

/** Items dentro de la ventana de atención (cruzaron su primer hito o vencieron). */
export function filterInWindow(items: ExpiryDocItem[], policy: ExpiryPolicy): ExpiryDocItem[] {
  return items.filter(
    (item) =>
      !item.dismissedAt &&
      currentMilestone(item.daysRemaining, item.ladder, policy.postExpiryCadenceDays) !== null
  );
}

/** Todas las entradas dentro de la ventana, ordenadas por severidad (para la bandeja). */
export async function listExpiryEntries(tenantId: string, today: Date): Promise<DigestEntry[]> {
  const [policy, items] = await Promise.all([
    getExpiryPolicy(tenantId),
    collectAllExpiryItems(tenantId, today),
  ]);
  return filterInWindow(items, policy)
    .sort((a, b) => a.daysRemaining - b.daysRemaining)
    .map((item) => toEntry(item, today));
}

export async function buildExpiryDigestSummary(
  tenantId: string,
  today: Date
): Promise<ExpiryDigestSummary> {
  const [policy, items] = await Promise.all([
    getExpiryPolicy(tenantId),
    collectAllExpiryItems(tenantId, today),
  ]);

  const inWindow = filterInWindow(items, policy).sort(
    (a, b) => a.daysRemaining - b.daysRemaining
  );
  const entries = inWindow.map((item) => toEntry(item, today));

  const vencidos = entries.filter((e) => e.daysRemaining < 0);
  const estaSemana = entries.filter((e) => e.daysRemaining >= 0 && e.daysRemaining <= 7);
  const esteMes = entries.filter((e) => e.daysRemaining > 7);

  const budget = await getCardBudgetState(tenantId, dayKeyOf(today));

  return {
    total: entries.length,
    vencidos,
    estaSemana,
    esteMes,
    enTramite: entries.filter((e) => e.enTramite).length,
    overflowCards: budget.overflow,
    policy,
  };
}

/** Línea corta del headline: "3 vencidos (2 en trámite) · 4 esta semana · 2 este mes". */
export function digestHeadline(summary: ExpiryDigestSummary): string {
  const vencidosTramite = summary.vencidos.filter((e) => e.enTramite).length;
  const parts: string[] = [];
  parts.push(
    `${summary.vencidos.length} vencido(s)${vencidosTramite ? ` (${vencidosTramite} en trámite)` : ""}`
  );
  parts.push(`${summary.estaSemana.length} vence(n) esta semana`);
  parts.push(`${summary.esteMes.length} este mes`);
  return parts.join(" · ");
}
