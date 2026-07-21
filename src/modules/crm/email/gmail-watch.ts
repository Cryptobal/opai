import { prisma } from "@/lib/prisma";
import { gmailClientForAccount } from "./gmail-account-client";
import { writeSyncState, readSyncState } from "./gmail-sync-state";

/**
 * Gmail push (opt-in por env): requiere `GMAIL_PUSH_TOKEN` (verificación del
 * webhook) y `GMAIL_PUBSUB_TOPIC` (topic Pub/Sub). Sin ambos, todo el bloque es
 * no-op y el polling del cron sigue siendo la red de seguridad.
 */
export function gmailPushEnabled(): boolean {
  return Boolean(process.env.GMAIL_PUSH_TOKEN && process.env.GMAIL_PUBSUB_TOPIC);
}

/**
 * Registra/renueva el `users.watch` de una casilla hacia el topic Pub/Sub y
 * guarda `watchExpiration` en el syncState. Best-effort: nunca lanza; no-op si
 * el push no está configurado o la casilla no está conectada.
 */
export async function registerGmailWatch(emailAccountId: string): Promise<boolean> {
  if (!gmailPushEnabled()) return false;
  try {
    const account = await prisma.crmEmailAccount.findUnique({
      where: { id: emailAccountId },
      select: {
        provider: true,
        status: true,
        accessTokenEncrypted: true,
        refreshTokenEncrypted: true,
      },
    });
    if (!account || account.provider !== "gmail" || account.status !== "active") return false;
    const gmail = gmailClientForAccount(account);
    if (!gmail) return false;

    const res = await gmail.users.watch({
      userId: "me",
      requestBody: {
        topicName: process.env.GMAIL_PUBSUB_TOPIC,
        labelIds: ["INBOX"],
        labelFilterAction: "include",
      },
    });
    await writeSyncState(emailAccountId, {
      watchExpiration: res.data.expiration ? Number(res.data.expiration) : Date.now() + 7 * 86400_000,
    });
    return true;
  } catch (err) {
    console.warn("[gmail-watch] registerGmailWatch falló", emailAccountId, err);
    return false;
  }
}

/**
 * Renueva los watch próximos a vencer (< 48h). Pensado como paso diario del
 * cron. Cap 40 casillas por corrida. No-op sin push configurado.
 */
export async function renewGmailWatches(now: number = Date.now()): Promise<number> {
  if (!gmailPushEnabled()) return 0;
  const horizon = now + 48 * 3600_000;
  const accounts = await prisma.crmEmailAccount.findMany({
    where: { provider: "gmail", status: "active" },
    select: { id: true, syncState: true },
    take: 40,
  });
  let renewed = 0;
  for (const acc of accounts) {
    const exp = readSyncState(acc.syncState).watchExpiration;
    if (exp && exp > horizon) continue;
    if (await registerGmailWatch(acc.id)) renewed++;
  }
  return renewed;
}
