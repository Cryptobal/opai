/**
 * Aliases de envío Gmail (C08/PR-10 §7): cachea `users.settings.sendAs` en
 * `email_accounts.send_as` con TTL. El selector de identidad (PR-04) los
 * ofrece y el envío valida que el From pertenezca a la casilla.
 */
import type { gmail_v1 } from "googleapis";
import { prisma } from "@/lib/prisma";
import { gmailClientForAccount } from "./gmail-account-client";

const SEND_AS_TTL_MS = 24 * 60 * 60_000;

export type SendAsAlias = {
  email: string;
  displayName: string | null;
  isDefault: boolean;
  /** Solo aliases verificados (o la casilla primaria) son usables para enviar. */
  verified: boolean;
};

type SendAsCache = { aliases: SendAsAlias[]; fetchedAt: string };

function parseCache(raw: unknown): SendAsCache | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const cache = raw as Partial<SendAsCache>;
  if (!Array.isArray(cache.aliases) || typeof cache.fetchedAt !== "string") return null;
  return cache as SendAsCache;
}

function mapAlias(alias: gmail_v1.Schema$SendAs): SendAsAlias {
  return {
    email: (alias.sendAsEmail ?? "").toLowerCase(),
    displayName: alias.displayName || null,
    isDefault: alias.isDefault === true,
    verified:
      alias.verificationStatus === "accepted" || alias.isPrimary === true,
  };
}

/**
 * Aliases de una casilla, desde cache si está fresca; si no, se refrescan de
 * Gmail y persisten. Degrada al email de la casilla si la API falla.
 */
export async function getSendAsAliases(account: {
  id: string;
  email: string;
  accessTokenEncrypted: string | null;
  refreshTokenEncrypted: string | null;
  sendAs: unknown;
}): Promise<SendAsAlias[]> {
  const cached = parseCache(account.sendAs);
  if (cached && Date.now() - Date.parse(cached.fetchedAt) < SEND_AS_TTL_MS) {
    return cached.aliases;
  }
  const fallback: SendAsAlias[] = [
    { email: account.email.toLowerCase(), displayName: null, isDefault: true, verified: true },
  ];
  try {
    const gmail = gmailClientForAccount(account);
    if (!gmail) return cached?.aliases ?? fallback;
    const res = await gmail.users.settings.sendAs.list({ userId: "me" });
    const aliases = (res.data.sendAs ?? [])
      .map(mapAlias)
      .filter((a) => a.email && a.verified);
    if (aliases.length === 0) return cached?.aliases ?? fallback;
    await prisma.crmEmailAccount.update({
      where: { id: account.id },
      data: {
        sendAs: { aliases, fetchedAt: new Date().toISOString() } as object,
      },
    });
    return aliases;
  } catch {
    return cached?.aliases ?? fallback;
  }
}

/**
 * Resuelve el header From para enviar: valida que `fromAlias` sea un alias
 * verificado de la casilla. Devuelve `null` si no es válido (usar el default).
 */
export function resolveFromHeader(
  aliases: SendAsAlias[],
  fromAlias: string | null | undefined,
): string | null {
  if (!fromAlias) return null;
  const wanted = fromAlias.trim().toLowerCase();
  const match = aliases.find((a) => a.email === wanted);
  if (!match) return null;
  return match.displayName ? `${match.displayName} <${match.email}>` : match.email;
}
