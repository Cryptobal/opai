/**
 * Handlers de interactividad del tablero de relevo (control de asistencia desde
 * Slack). Reusan el servicio de dominio `@/lib/ops/asistencia-control` (cero
 * lógica nueva) — paridad total con la web. Gate: módulo `ops`. El tenant se
 * re-resuelve por team_id (nunca se confía en el payload).
 */

import { hasModuleAccess } from "@/lib/permissions";
import { getTenantForTeam, getWorkspaceForTenant } from "../workspace";
import { resolveLinkedAdmin, type LinkedAdmin } from "../user-link";
import { slackRespondUrl } from "../api";
import { confirmarLlegada, reportarAusencia } from "@/lib/ops/asistencia-control";
import { refreshRelevoBoardForInstallation } from "@/lib/ops/relevo-board";

type Payload = Record<string, unknown>;

function field<T>(p: Payload, path: string[]): T | undefined {
  let cur: unknown = p;
  for (const k of path) cur = (cur as Record<string, unknown> | undefined)?.[k];
  return cur as T | undefined;
}

function asistenciaIdOf(p: Payload): string | undefined {
  const actions = field<Array<{ value?: string }>>(p, ["actions"]);
  return actions?.[0]?.value;
}

interface Actor {
  tenantId: string;
  linked: LinkedAdmin;
  responseUrl?: string;
}

/** Resuelve tenant (por team_id) + identidad vinculada + gate ops. */
async function resolveActor(p: Payload): Promise<Actor | null> {
  const teamId = field<string>(p, ["team", "id"]);
  const slackUserId = field<string>(p, ["user", "id"]);
  if (!teamId || !slackUserId) return null;
  const resolved = await getTenantForTeam(teamId);
  if (!resolved) return null;
  const workspace = await getWorkspaceForTenant(resolved.tenantId);
  if (!workspace) return null;
  const linked = await resolveLinkedAdmin(workspace, slackUserId);
  if (!linked || !hasModuleAccess(linked.perms, "ops")) return null;
  return { tenantId: workspace.tenantId, linked, responseUrl: field<string>(p, ["response_url"]) };
}

async function ephemeral(actor: Actor, text: string): Promise<void> {
  if (actor.responseUrl) {
    await slackRespondUrl(actor.responseUrl, { response_type: "ephemeral", text }).catch(() => {});
  }
}

/** "📞 En camino" → abre el mini-modal (consume el trigger_id perecedero YA). */
export async function handleAsistenciaCamino(p: Payload): Promise<void> {
  const asistenciaId = asistenciaIdOf(p);
  const teamId = field<string>(p, ["team", "id"]);
  const triggerId = field<string>(p, ["trigger_id"]);
  const slackUserId = field<string>(p, ["user", "id"]);
  if (!asistenciaId || !teamId || !triggerId || !slackUserId) return;
  const { openModalByCallback } = await import("../modals/dispatch");
  await openModalByCallback({
    teamId,
    triggerId,
    callbackId: "opai_asist_camino",
    slackUserId,
    arg: asistenciaId,
  });
}

/** "✓ Confirmar llegada" → acción directa + refresh del tablero. */
export async function handleAsistenciaConfirmar(p: Payload): Promise<void> {
  const asistenciaId = asistenciaIdOf(p);
  const actor = await resolveActor(p);
  if (!asistenciaId || !actor) return;
  const r = await confirmarLlegada({ tenantId: actor.tenantId, asistenciaId, operadorId: actor.linked.adminId });
  if (!r.ok) return void ephemeral(actor, r.error ?? "No se pudo confirmar la llegada.");
  if (r.installationId && r.date) {
    refreshRelevoBoardForInstallation(actor.tenantId, r.installationId, r.date).catch(() => {});
  }
}

/** "Reportar ausencia" → marca no_asistió, refresca y ofrece registrar cobertura. */
export async function handleAsistenciaAusente(p: Payload): Promise<void> {
  const asistenciaId = asistenciaIdOf(p);
  const actor = await resolveActor(p);
  if (!asistenciaId || !actor) return;
  const r = await reportarAusencia({ tenantId: actor.tenantId, asistenciaId, operadorId: actor.linked.adminId });
  if (!r.ok) return void ephemeral(actor, r.error ?? "No se pudo reportar la ausencia.");
  if (r.installationId && r.date) {
    refreshRelevoBoardForInstallation(actor.tenantId, r.installationId, r.date).catch(() => {});
  }
  // Gancho de cobertura: apila el modal de ingreso de turno extra (quien cubre).
  const teamId = field<string>(p, ["team", "id"]);
  const triggerId = field<string>(p, ["trigger_id"]);
  const slackUserId = field<string>(p, ["user", "id"]);
  if (r.needsCobertura && teamId && triggerId && slackUserId) {
    const { openModalByCallback } = await import("../modals/dispatch");
    await openModalByCallback({ teamId, triggerId, callbackId: "opai_turno_extra", slackUserId, arg: asistenciaId });
  }
}
