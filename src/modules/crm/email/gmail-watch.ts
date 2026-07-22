import { prisma } from "@/lib/prisma";
import { captureEmailError } from "./email-observability";
import { gmailClientForAccount } from "./gmail-account-client";
import { readSyncState, writeSyncState } from "./gmail-sync-state";

const PUSH_ENABLED = process.env.GMAIL_PUSH_ENABLED === "true";
const TOPIC = process.env.GMAIL_PUSH_TOPIC ?? "";

export type GmailWatchAccount = {
  id: string;
  accessTokenEncrypted: string | null;
  refreshTokenEncrypted: string | null;
  syncState?: unknown;
};

type WatchResult = { skipped: true } | { error: true } | { ok: true };

/** Registra `users.watch` hacia Pub/Sub. Opt-in por env; nunca lanza. */
export async function registerGmailWatch(account: GmailWatchAccount): Promise<WatchResult> {
  if (!PUSH_ENABLED || !TOPIC) return { skipped: true };

  const gmail = gmailClientForAccount(account);
  if (!gmail) return { error: true };

  try {
    const res = await gmail.users.watch({
      userId: "me",
      requestBody: {
        topicName: TOPIC,
      },
    });

    const prior = readSyncState(account.syncState);
    await writeSyncState(account.id, {
      watch: {
        historyId: res.data.historyId ?? prior.watch?.historyId ?? null,
        expiration: res.data.expiration
          ? Number(res.data.expiration)
          : Date.now() + 7 * 86400_000,
        registeredAt: new Date().toISOString(),
        scope: "mailbox",
      },
    });
    return { ok: true };
  } catch (err) {
    captureEmailError(err, {
      scope: "watch-register",
      emailAccountId: account.id,
      level: "warning",
    });
    return { error: true };
  }
}

/** Detiene el watch activo y limpia `syncState.watch`. Best-effort. */
export async function stopGmailWatch(account: GmailWatchAccount): Promise<void> {
  if (!PUSH_ENABLED) return;

  const gmail = gmailClientForAccount(account);
  if (gmail) {
    try {
      await gmail.users.stop({ userId: "me" });
    } catch (err) {
      captureEmailError(err, {
        scope: "watch-stop",
        emailAccountId: account.id,
        level: "warning",
      });
    }
  }

  const next = readSyncState(account.syncState);
  delete next.watch;
  await prisma.crmEmailAccount.update({
    where: { id: account.id },
    data: { syncState: next },
  });
}

/** true si el watch vence en menos de 24h (Google renueva ~7 días). */
export function needsWatchRenewal(account: { syncState?: unknown }): boolean {
  if (!PUSH_ENABLED) return false;
  const watch = readSyncState(account.syncState).watch;
  if (watch?.scope !== "mailbox") return true;
  const exp = watch.expiration;
  if (!exp) return true;
  return exp - Date.now() < 24 * 3600_000;
}
