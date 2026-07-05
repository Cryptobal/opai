/**
 * Lectura del historial de interacciones tipificadas de una entidad CRM
 * (Fase 4/7). Fuente única para: contexto de la IA en la sala, insight
 * proactivo y las tarjetas comerciales ("última interacción: 🤝 hace 2d").
 * Solo lee notas CON `interactionType` (las notas sin tipo no cuentan como
 * interacción registrada). `tenantId` obligatorio.
 */

import { prisma } from "@/lib/prisma";
import { interactionLabel } from "./interaction-types";

export interface RecentInteraction {
  type: string;
  at: Date;
  content: string;
}

/** Últimas `limit` interacciones tipificadas (más reciente primero). */
export async function recentInteractions(
  tenantId: string,
  entityType: string,
  entityId: string,
  limit = 5,
): Promise<RecentInteraction[]> {
  const notes = await prisma.crmNote.findMany({
    where: { tenantId, entityType, entityId, interactionType: { not: null } },
    orderBy: [{ occurredAt: "desc" }, { createdAt: "desc" }],
    take: Math.max(1, Math.min(20, limit)),
    select: { interactionType: true, occurredAt: true, createdAt: true, content: true },
  });
  return notes.map((n) => ({ type: n.interactionType ?? "note", at: n.occurredAt ?? n.createdAt, content: n.content }));
}

const daysSince = (d: Date): number => Math.max(0, Math.floor((Date.now() - d.getTime()) / 86400000));

/** Antigüedad humana breve: "hoy" · "hace 2d" · "hace 3sem". */
export function agoLabel(at: Date): string {
  const d = daysSince(at);
  if (d <= 0) return "hoy";
  if (d === 1) return "hace 1d";
  if (d < 21) return `hace ${d}d`;
  return `hace ${Math.round(d / 7)}sem`;
}

/**
 * Etiqueta de última interacción para tarjetas: "🤝 hace 2d" o null si no hay.
 * Best-effort: null si la consulta falla (Fase 7).
 */
export async function lastInteractionLabel(tenantId: string, entityType: string, entityId: string): Promise<string | null> {
  try {
    const [last] = await recentInteractions(tenantId, entityType, entityId, 1);
    if (!last) return null;
    return `${interactionLabel(last.type)} · ${agoLabel(last.at)}`;
  } catch {
    return null;
  }
}

/**
 * Versión batch para tarjetas en lista (Fase 7): última interacción por entidad.
 * Devuelve Map<entityId, "🤝 hace 2d">. Best-effort: Map vacío si la query falla.
 */
export async function lastInteractionLabels(tenantId: string, entityType: string, entityIds: string[]): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  if (!entityIds.length) return out;
  try {
    const notes = await prisma.crmNote.findMany({
      where: { tenantId, entityType, entityId: { in: entityIds }, interactionType: { not: null } },
      orderBy: [{ occurredAt: "desc" }, { createdAt: "desc" }],
      select: { entityId: true, interactionType: true, occurredAt: true, createdAt: true },
    });
    for (const n of notes) {
      if (out.has(n.entityId)) continue;
      out.set(n.entityId, `${interactionLabel(n.interactionType)} · ${agoLabel(n.occurredAt ?? n.createdAt)}`);
    }
  } catch (err) {
    console.error("[crm] lastInteractionLabels falló:", err);
  }
  return out;
}
