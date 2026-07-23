import { prisma } from "@/lib/prisma";
import {
  readSyncState,
  writeSyncState,
  type GmailSyncState,
  type SyncRunArgs,
} from "./gmail-sync-state";
import { runBackfill } from "./gmail-backfill";
import { runIncremental } from "./gmail-incremental";
import { reconcileGmailFolders } from "./gmail-folder-reconcile";
import { syncGmailDrafts } from "./gmail-drafts.service";
import { healInboxFromLocalLabels, selfHealInbox } from "./gmail-inbox-selfheal";
import { classifyAccountThreads } from "./radar-classifier.service";
import { gmailClientForAccount } from "./gmail-account-client";
import { notifyNewInboundMail } from "./gmail-new-mail-push";

const DEFAULT_BUDGET = 300;
const TIME_BUDGET_MS = 45_000;
/** Frecuencia mínima entre sweeps completos de reconciliación (throttle). */
const RECONCILE_TTL_MS = 10 * 60_000;

/** Solo persiste keys que el runner realmente cambió; preserva push/watch concurrentes. */
export function changedGmailSyncState(
  previous: GmailSyncState,
  next: GmailSyncState,
): GmailSyncState {
  const patch: Record<string, unknown> = {};
  for (const key of Object.keys(next) as Array<keyof GmailSyncState>) {
    if (JSON.stringify(previous[key]) !== JSON.stringify(next[key])) {
      patch[key] = next[key];
    }
  }
  return patch as GmailSyncState;
}

/**
 * Sync de una casilla Gmail. Decide backfill (histórico 120d paginado) o
 * incremental (`historyId`) según `syncState`. Guarda TODOS los threads del
 * usuario; el matching a contacto/cuenta/deal es enriquecimiento.
 *
 * El deadline global se reparte por fases para que ninguna corra con las
 * sobras muertas: incremental/backfill (55%), radar (hasta 12s), sweep (resto).
 *
 * @param maxResults      budget de mensajes por corrida (default 300).
 * @param deadlineMs      timestamp absoluto para cortar (el cron lo comparte
 *                        entre casillas para no exceder su maxDuration).
 * @param forceReconcile  fuerza el sweep aunque el throttle de 10 min no venza.
 */
export async function syncGmailAccount(params: {
  tenantId: string;
  emailAccountId: string;
  maxResults?: number;
  deadlineMs?: number;
  createdByUserId?: string | null;
  forceReconcile?: boolean;
  /** Presupuesto mínimo del self-heal (ms). El botón "Sincronizar" pasa ~10s. */
  selfHealBudgetMs?: number;
  /**
   * `delta` es la ruta crítica del push: solo history/backfill + labels.
   * `maintenance` agrega Radar, self-heal y reconciliación completa.
   */
  profile?: "delta" | "maintenance";
}): Promise<{
  syncedCount: number;
  fetched: number;
  mode: "backfill" | "incremental";
  reconcile: "ok" | "partial" | "skipped";
  healed: number;
}> {
  const emailAccount = await prisma.crmEmailAccount.findFirst({
    where: {
      id: params.emailAccountId,
      tenantId: params.tenantId,
      provider: "gmail",
      status: "active",
    },
  });
  if (!emailAccount?.accessTokenEncrypted) {
    throw new Error("Gmail no conectado");
  }

  const gmail = gmailClientForAccount(emailAccount);
  if (!gmail) throw new Error("Gmail no conectado");

  const state = readSyncState(emailAccount.syncState);
  // PR-15: marca de inicio de corrida — el push de correo nuevo solo cuenta
  // mensajes insertados después de este punto.
  const runStartedAt = new Date();
  const globalDeadline = params.deadlineMs ?? Date.now() + TIME_BUDGET_MS;
  const total = Math.max(globalDeadline - Date.now(), 0);
  const maintenance = params.profile !== "delta";

  // Fase 1 — la ruta realtime dedica casi todo el presupuesto al delta. La
  // ruta de mantenimiento reserva 45% para Radar/heal/sweep.
  const runArgs: SyncRunArgs = {
    gmail,
    tenantId: params.tenantId,
    emailAccount: { id: emailAccount.id, email: emailAccount.email, userId: emailAccount.userId },
    state,
    budget: Math.max(params.maxResults ?? DEFAULT_BUDGET, 1),
    deadline: maintenance
      ? Date.now() + Math.floor(total * 0.55)
      : Math.max(Date.now(), globalDeadline - 250),
    createdByUserId: params.createdByUserId,
    maintenance,
  };

  const mode: "backfill" | "incremental" = state.backfillDone ? "incremental" : "backfill";
  const result = mode === "backfill" ? await runBackfill(runArgs) : await runIncremental(runArgs);
  await writeSyncState(
    emailAccount.id,
    changedGmailSyncState(state, result.state),
  );

  // PR-15 (C22a): una notificación push por casilla por corrida con los
  // inbound nuevos. Solo en incremental (el backfill importa histórico y
  // avisaría por correos viejos). Best-effort: nunca lanza ni frena el sync.
  if (mode === "incremental" && result.synced > 0) {
    await notifyNewInboundMail({
      tenantId: params.tenantId,
      emailAccountId: emailAccount.id,
      ownerUserId: emailAccount.userId,
      ownEmail: emailAccount.email,
      since: runStartedAt,
    });
  }

  if (!maintenance) {
    return {
      syncedCount: result.synced,
      fetched: result.fetched,
      mode,
      reconcile: "skipped",
      healed: 0,
    };
  }

  // Fase 2 — Radar Comercial ANTES del sweep, con presupuesto reservado
  // (hasta 12s): clasifica hilos con inbound nuevo y genera RadarItems.
  // Best-effort: nunca lanza ni bloquea el sync.
  const radarRemaining = globalDeadline - Date.now();
  if (radarRemaining > 0) {
    await classifyAccountThreads({
      tenantId: params.tenantId,
      emailAccountId: emailAccount.id,
      userId: emailAccount.userId,
      deadlineMs: Date.now() + Math.min(12_000, radarRemaining * 0.6),
    });
  }

  // Fase 3 — self-heal Recibidos ANTES del sweep.
  // Heal local (instantáneo) siempre; remoto por-hilo cuando hay presupuesto
  // (incremental, force, o sync manual con selfHealBudgetMs).
  const healRemaining = globalDeadline - Date.now();
  const minHeal = Math.max(params.selfHealBudgetMs ?? 8_000, 8_000);
  const runRemoteHeal =
    healRemaining >= 3_000 &&
    (mode === "incremental" || params.forceReconcile === true || params.selfHealBudgetMs != null);
  let healed = 0;
  if (runRemoteHeal) {
    // Cap 15s: sin tope, el heal remoto consumía todo el presupuesto restante
    // y el sweep (fase 4, que importa hilos INBOX faltantes) quedaba con <5s
    // y se saltaba siempre en el cron.
    const healBudget = Math.min(Math.max(minHeal, healRemaining - 2_000), healRemaining, 15_000);
    const heal = await selfHealInbox({
      gmail,
      tenantId: params.tenantId,
      emailAccountId: emailAccount.id,
      deadline: Date.now() + healBudget,
    });
    healed = heal.healed;
  } else {
    healed = await healInboxFromLocalLabels({
      tenantId: params.tenantId,
      emailAccountId: emailAccount.id,
    });
  }

  // Fase 3.5 — espejo de borradores Gmail→OPAI (C08). Presupuesto corto,
  // best-effort: un draft creado en Gmail aparece en OPAI y viceversa.
  const draftsRemaining = globalDeadline - Date.now();
  if (draftsRemaining >= 3_000) {
    await syncGmailDrafts({
      gmail,
      tenantId: params.tenantId,
      emailAccount: runArgs.emailAccount,
      deadline: Date.now() + Math.min(8_000, draftsRemaining * 0.4),
    });
  }

  // Fase 3.6 — indexación incremental de embeddings (A07). Solo tras el
  // backfill de correo (no embeber histórico sin opt-in) y con presupuesto
  // corto; el histórico va por scripts/backfill-email-embeddings.ts.
  const embedRemaining = globalDeadline - Date.now();
  if (state.backfillDone && embedRemaining >= 3_000) {
    const { indexRecentEmailMessages } = await import("./email-embeddings");
    await indexRecentEmailMessages({
      tenantId: params.tenantId,
      emailAccountId: emailAccount.id,
      deadline: Date.now() + Math.min(6_000, embedRemaining * 0.3),
    });
  }

  // Fase 4 — sweep global (solo TRASH/SPAM + refuerzo positivo) con throttle.
  let reconcile: "ok" | "partial" | "skipped" = "skipped";
  const sweepDue =
    state.lastReconcileComplete !== true ||
    !state.lastReconcileAt ||
    Date.now() - Date.parse(state.lastReconcileAt) > RECONCILE_TTL_MS ||
    params.forceReconcile === true ||
    healed > 0;
  const sweepRemaining = globalDeadline - Date.now();
  if ((mode === "incremental" || params.forceReconcile === true) && sweepDue && sweepRemaining >= 5_000) {
    const sweepResult = await reconcileGmailFolders({
      gmail,
      tenantId: params.tenantId,
      emailAccount: runArgs.emailAccount,
      deadline: Date.now() + Math.max(sweepRemaining, 8_000),
    });
    reconcile = sweepResult.complete ? "ok" : "partial";
    await writeSyncState(emailAccount.id, {
      lastReconcileAt: new Date().toISOString(),
      lastReconcileComplete: sweepResult.complete,
    });
  }

  return { syncedCount: result.synced, fetched: result.fetched, mode, reconcile, healed };
}
