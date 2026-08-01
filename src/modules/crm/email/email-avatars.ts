/**
 * Resolución de avatares de correo:
 * 1) Foto de Admin del tenant (misma casilla/email)
 * 2) Cache local (CrmEmailContactAvatar)
 * 3) Google People API (si la casilla tiene scopes) → cache
 */

import { google } from "googleapis";
import { prisma } from "@/lib/prisma";
import { decryptText, getGmailTokenSecret } from "@/lib/crypto";
import {
  getGmailOAuthClient,
  hasPeopleContactsScope,
  PEOPLE_CONTACTS_SCOPE,
  PEOPLE_OTHER_CONTACTS_SCOPE,
} from "@/lib/gmail";

type OAuthClient = ReturnType<typeof getGmailOAuthClient>;
const CACHE_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 días
const NEGATIVE_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 días sin foto
const MAX_PEOPLE_LOOKUPS = 15;

/** Extrae email de un From crudo (`Nombre <a@b.cl>` o `a@b.cl`). */
export function normalizeEmail(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const trimmed = raw.trim();
  if (!trimmed) return null;
  const match = trimmed.match(/<([^>]+)>/);
  const email = (match ? match[1] : trimmed).replace(/[<>]/g, "").trim().toLowerCase();
  if (!email || !email.includes("@")) return null;
  return email;
}

export function extractEmails(rawList: Array<string | null | undefined>): string[] {
  const out = new Set<string>();
  for (const raw of rawList) {
    const email = normalizeEmail(raw);
    if (email) out.add(email);
  }
  return [...out];
}

/** Lookup síncrono: Admin + cache. No llama a People. */
export async function resolveCachedEmailAvatars(
  tenantId: string,
  emails: string[],
): Promise<Map<string, string>> {
  const normalized = extractEmails(emails);
  const result = new Map<string, string>();
  if (normalized.length === 0) return result;

  const now = new Date();

  const [admins, cached] = await Promise.all([
    prisma.admin.findMany({
      where: {
        tenantId,
        status: "active",
        email: { in: normalized, mode: "insensitive" },
        photoUrl: { not: null },
      },
      select: { email: true, photoUrl: true },
    }),
    prisma.crmEmailContactAvatar.findMany({
      where: {
        tenantId,
        email: { in: normalized },
        expiresAt: { gt: now },
        photoUrl: { not: null },
      },
      select: { email: true, photoUrl: true },
    }),
  ]);

  for (const row of cached) {
    if (row.photoUrl) result.set(row.email, row.photoUrl);
  }
  // Admin prevalece sobre cache People
  for (const admin of admins) {
    const email = admin.email.trim().toLowerCase();
    if (admin.photoUrl) result.set(email, admin.photoUrl);
  }

  return result;
}

type PeoplePhotoHit = { email: string; photoUrl: string | null };

function oauthClientForAccount(account: {
  accessTokenEncrypted: string | null;
  refreshTokenEncrypted: string | null;
}): OAuthClient | null {
  if (!account.accessTokenEncrypted) return null;
  const secret = getGmailTokenSecret();
  const accessToken = decryptText(account.accessTokenEncrypted, secret);
  const refreshToken = account.refreshTokenEncrypted
    ? decryptText(account.refreshTokenEncrypted, secret)
    : undefined;
  const client = getGmailOAuthClient();
  client.setCredentials({
    access_token: accessToken,
    refresh_token: refreshToken,
  });
  return client;
}

async function searchPeoplePhoto(
  auth: OAuthClient,
  email: string,
  canContacts: boolean,
  canOther: boolean,
): Promise<string | null> {
  const people = google.people({ version: "v1", auth });

  const pickPhoto = (
    photos: Array<{ url?: string | null; default?: boolean | null }> | undefined,
  ): string | null => {
    if (!photos?.length) return null;
    const preferred =
      photos.find((p) => p.default && p.url) ?? photos.find((p) => p.url);
    return preferred?.url ?? null;
  };

  if (canContacts) {
    try {
      const res = await people.people.searchContacts({
        query: email,
        readMask: "emailAddresses,photos",
        pageSize: 5,
      });
      for (const hit of res.data.results ?? []) {
        const person = hit.person;
        const emails =
          person?.emailAddresses?.map((e) => e.value?.trim().toLowerCase()) ?? [];
        if (!emails.includes(email)) continue;
        const url = pickPhoto(person?.photos ?? undefined);
        if (url) return url;
      }
    } catch (err) {
      console.warn("[EMAIL-AVATAR] searchContacts failed:", err);
    }
  }

  if (canOther) {
    try {
      const res = await people.otherContacts.search({
        query: email,
        readMask: "emailAddresses,photos",
        pageSize: 5,
      });
      for (const hit of res.data.results ?? []) {
        const person = hit.person;
        const emails =
          person?.emailAddresses?.map((e) => e.value?.trim().toLowerCase()) ?? [];
        if (!emails.includes(email)) continue;
        const url = pickPhoto(person?.photos ?? undefined);
        if (url) return url;
      }
    } catch (err) {
      console.warn("[EMAIL-AVATAR] otherContacts.search failed:", err);
    }
  }

  return null;
}

async function upsertAvatarCache(
  tenantId: string,
  hits: PeoplePhotoHit[],
): Promise<void> {
  if (hits.length === 0) return;
  const now = new Date();
  await Promise.all(
    hits.map((hit) => {
      const ttl = hit.photoUrl ? CACHE_TTL_MS : NEGATIVE_TTL_MS;
      return prisma.crmEmailContactAvatar.upsert({
        where: {
          tenantId_email: { tenantId, email: hit.email },
        },
        create: {
          tenantId,
          email: hit.email,
          photoUrl: hit.photoUrl,
          source: hit.photoUrl ? "people" : "none",
          checkedAt: now,
          expiresAt: new Date(now.getTime() + ttl),
        },
        update: {
          photoUrl: hit.photoUrl,
          source: hit.photoUrl ? "people" : "none",
          checkedAt: now,
          expiresAt: new Date(now.getTime() + ttl),
        },
      });
    }),
  );
}

/**
 * Completa avatares faltantes vía People API (máx N por llamada) y actualiza cache.
 * Requiere casilla Gmail del usuario con scopes People.
 */
export async function fetchMissingPeopleAvatars(opts: {
  tenantId: string;
  userId: string;
  emails: string[];
  emailAccountId?: string | null;
}): Promise<Map<string, string>> {
  const result = await resolveCachedEmailAvatars(opts.tenantId, opts.emails);
  const normalized = extractEmails(opts.emails);
  const missing = normalized.filter((e) => !result.has(e));
  if (missing.length === 0) return result;

  const now = new Date();
  const negative = await prisma.crmEmailContactAvatar.findMany({
    where: {
      tenantId: opts.tenantId,
      email: { in: missing },
      expiresAt: { gt: now },
      source: "none",
    },
    select: { email: true },
  });
  const skip = new Set(negative.map((n) => n.email));
  const toFetch = missing.filter((e) => !skip.has(e)).slice(0, MAX_PEOPLE_LOOKUPS);
  if (toFetch.length === 0) return result;

  const account = opts.emailAccountId
    ? await prisma.crmEmailAccount.findFirst({
        where: {
          id: opts.emailAccountId,
          tenantId: opts.tenantId,
          userId: opts.userId,
          status: "active",
        },
      })
    : await prisma.crmEmailAccount.findFirst({
        where: {
          tenantId: opts.tenantId,
          userId: opts.userId,
          status: "active",
        },
        orderBy: { createdAt: "asc" },
      });

  if (!account || !hasPeopleContactsScope(account.grantedScopes)) {
    return result;
  }

  const scopes = (account.grantedScopes ?? "").split(/[\s,]+/);
  const canContacts = scopes.includes(PEOPLE_CONTACTS_SCOPE);
  const canOther = scopes.includes(PEOPLE_OTHER_CONTACTS_SCOPE);
  const auth = oauthClientForAccount(account);
  if (!auth) return result;

  const hits: PeoplePhotoHit[] = [];
  for (const email of toFetch) {
    const photoUrl = await searchPeoplePhoto(auth, email, canContacts, canOther);
    hits.push({ email, photoUrl });
    if (photoUrl) result.set(email, photoUrl);
  }

  try {
    await upsertAvatarCache(opts.tenantId, hits);
  } catch (err) {
    console.warn("[EMAIL-AVATAR] cache upsert failed:", err);
  }

  return result;
}

/** Adjunta fromPhotoUrl a DTOs con fromEmail. */
export function attachFromPhotoUrl<T extends { fromEmail: string | null }>(
  items: T[],
  avatars: Map<string, string>,
): Array<T & { fromPhotoUrl: string | null }> {
  return items.map((item) => {
    const email = normalizeEmail(item.fromEmail);
    return {
      ...item,
      fromPhotoUrl: email ? avatars.get(email) ?? null : null,
    };
  });
}
