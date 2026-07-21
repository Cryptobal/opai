import { prisma } from "@/lib/prisma";
import { decryptText } from "@/lib/crypto";
import { getGmailClient } from "@/lib/gmail";
import { readSyncState, writeSyncState, type SyncRunArgs } from "./gmail-sync-state";
import { runBackfill } from "./gmail-backfill";
import { runIncremental } from "./gmail-incremental";
import { reconcileGmailFolders } from "./gmail-folder-reconcile";
import { selfHealInbox } from "./gmail-inbox-selfheal";
import { classifyAccountThreads } from "./radar-classifier.service";

const DEFAULT_BUDGET = 300;
const TIME_BUDGET_MS = 45_000;
/** Frecuencia mínima entre sweeps completos de reconciliación (throttle). */
const RECONCILE_TTL_MS = 10 * 60_000;

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

  const tokenSecret = process.env.GMAIL_TOKEN_SECRET || "dev-secret";
  const accessToken = decryptText(emailAccount.accessTokenEncrypted, tokenSecret);
  const refreshToken = emailAccount.refreshTokenEncrypted
    ? decryptText(emailAccount.refreshTokenEncrypted, tokenSecret)
    : undefined;
  const gmail = getGmailClient(accessToken, refreshToken);

  const state = readSyncState(emailAccount.syncState);
  const globalDeadline = params.deadlineMs ?? Date.now() + TIME_BUDGET_MS;
  const total = Math.max(globalDeadline - Date.now(), 0);

  // Fase 1 — incremental/backfill con presupuesto propio (55% del total).
  const runArgs: SyncRunArgs = {
    gmail,
    tenantId: params.tenantId,
    emailAccount: { id: emailAccount.id, email: emailAccount.email, userId: emailAccount.userId },
    state,
    budget: Math.max(params.maxResults ?? DEFAULT_BUDGET, 1),
    deadline: Date.now() + Math.floor(total * 0.55),
    createdByUserId: params.createdByUserId,
  };

  const mode: "backfill" | "incremental" = state.backfillDone ? "incremental" : "backfill";
  const result = mode === "backfill" ? await runBackfill(runArgs) : await runIncremental(runArgs);
  await writeSyncState(emailAccount.id, result.state);

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

  // Fase 3 — self-heal por-hilo (Recibidos) ANTES del sweep: verificación
  // positiva barata que repara archivado erróneo sin depender de sets globales.
  let healed = 0;
  const healRemaining = globalDeadline - Date.now();
  const minHeal = Math.max(params.selfHealBudgetMs ?? 8_000, 8_000);
  if (mode === "incremental" && healRemaining >= 3_000) {
    const healBudget = Math.min(Math.max(minHeal, healRemaining - 2_000), healRemaining);
    const heal = await selfHealInbox({
      gmail,
      tenantId: params.tenantId,
      emailAccountId: emailAccount.id,
      deadline: Date.now() + healBudget,
    });
    healed = heal.healed;
  }

  // Fase 4 — sweep global (solo TRASH/SPAM + refuerzo positivo) con throttle.
  let reconcile: "ok" | "partial" | "skipped" = "skipped";
  const sweepDue =
    state.lastReconcileComplete !== true ||
    !state.lastReconcileAt ||
    Date.now() - Date.parse(state.lastReconcileAt) > RECONCILE_TTL_MS ||
    params.forceReconcile === true;
  const sweepRemaining = globalDeadline - Date.now();
  if (mode === "incremental" && sweepDue && sweepRemaining >= 5_000) {
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
