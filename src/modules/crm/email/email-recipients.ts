/**
 * Autocompletado de destinatarios (C21a): dos fuentes mergeadas —
 * (a) contactos CRM del tenant, (b) frecency propia del usuario
 * (crm.email_recipients). Dedup por email normalizado prefiriendo la entrada
 * CRM enriquecida con las estadísticas de frecuencia.
 */
import { prisma } from "@/lib/prisma";
import { extractEmailAddresses, normalizeEmailAddress } from "@/lib/email-address";
import { captureEmailError } from "./email-observability";

export type RecipientSuggestion = {
  email: string;
  name: string | null;
  source: "crm" | "recent" | "mailbox";
  contactId: string | null;
};

/** Extrae display name de headers tipo `Nombre Apellido <mail@x.cl>`. */
export function parseAddressName(raw: string): { email: string; name: string | null } {
  const email = extractEmailAddresses(raw)[0] ?? normalizeEmailAddress(raw);
  const match = raw.trim().match(/^"?([^"<]*)"?\s*<([^>]+)>\s*$/);
  const name = (match?.[1] ?? "").replace(/"/g, "").trim() || null;
  return { email, name };
}

/**
 * Ranking (documentación de la fórmula):
 *   score = matchQuality × (1 + frecuencia decaída + bono de recencia)
 *
 * - frecuencia decaída = sendCount × 0.5^(díasDesdeÚltimoEnvío / 90)
 *   (half-life ~90 días: lo que dejaste de usar pierde peso gradualmente).
 * - bono de recencia  = 8 × 0.5^(díasDesdeÚltimoEnvío / 14)
 *   (destinatarios de las últimas ~2 semanas suben aunque tengan pocos envíos).
 * - matchQuality: prefijo (email o nombre empieza con q) = 2; substring = 1.
 *   Sin query (precarga de frecuentes) = 1 para todos.
 * - Un contacto CRM sin historial queda con score = matchQuality (término 1),
 *   así aparece igual aunque nunca le hayas escrito.
 */
export function scoreRecipient(params: {
  sendCount: number;
  lastSentAt: Date | null;
  matchQuality: number;
  now?: number;
}): number {
  const now = params.now ?? Date.now();
  let frequency = 0;
  let recency = 0;
  if (params.lastSentAt && params.sendCount > 0) {
    const ageDays = Math.max(0, (now - params.lastSentAt.getTime()) / 86_400_000);
    frequency = params.sendCount * 0.5 ** (ageDays / 90);
    recency = 8 * 0.5 ** (ageDays / 14);
  }
  return params.matchQuality * (1 + frequency + recency);
}

/** prefijo > substring; 0 = no matchea (el caller filtra). */
export function matchQuality(q: string, email: string, name: string | null): number {
  if (!q) return 1;
  const query = q.toLowerCase();
  const mail = email.toLowerCase();
  const fullName = (name ?? "").toLowerCase();
  const nameWords = fullName.split(/\s+/).filter(Boolean);
  if (mail.startsWith(query) || nameWords.some((w) => w.startsWith(query))) return 2;
  if (mail.includes(query) || fullName.includes(query)) return 1;
  return 0;
}

type Frecency = { sendCount: number; lastSentAt: Date; displayName: string | null };

/**
 * Merge + dedup + ranking puro (testeable sin DB). `crm` y `recent` ya vienen
 * scoped a tenant/usuario por las queries del caller.
 */
export function mergeRecipientSuggestions(params: {
  q: string;
  limit: number;
  crmContacts: Array<{ id: string; email: string; name: string | null }>;
  recents: Array<{ email: string; displayName: string | null; sendCount: number; lastSentAt: Date; contactId: string | null }>;
  /** Remitentes/destinatarios vistos en la bandeja sincronizada (Gmail). */
  mailbox?: Array<{ email: string; name: string | null; lastSeenAt: Date | null }>;
  now?: number;
}): RecipientSuggestion[] {
  const { q, limit } = params;
  const frecencyByEmail = new Map<string, Frecency>();
  for (const r of params.recents) {
    frecencyByEmail.set(normalizeEmailAddress(r.email), {
      sendCount: r.sendCount,
      lastSentAt: r.lastSentAt,
      displayName: r.displayName,
    });
  }

  const byEmail = new Map<string, RecipientSuggestion & { score: number }>();

  // CRM primero: en el dedup gana la entrada CRM (enriquecida con frecency).
  for (const c of params.crmContacts) {
    const email = normalizeEmailAddress(c.email);
    if (!email) continue;
    const quality = matchQuality(q, email, c.name);
    if (quality === 0) continue;
    const stats = frecencyByEmail.get(email);
    byEmail.set(email, {
      email,
      name: c.name,
      source: "crm",
      contactId: c.id,
      score: scoreRecipient({
        sendCount: stats?.sendCount ?? 0,
        lastSentAt: stats?.lastSentAt ?? null,
        matchQuality: quality,
        now: params.now,
      }),
    });
  }

  for (const r of params.recents) {
    const email = normalizeEmailAddress(r.email);
    if (!email || byEmail.has(email)) continue;
    const quality = matchQuality(q, email, r.displayName);
    if (quality === 0) continue;
    byEmail.set(email, {
      email,
      name: r.displayName,
      source: "recent",
      contactId: r.contactId,
      score: scoreRecipient({
        sendCount: r.sendCount,
        lastSentAt: r.lastSentAt,
        matchQuality: quality,
        now: params.now,
      }),
    });
  }

  for (const m of params.mailbox ?? []) {
    const email = normalizeEmailAddress(m.email);
    if (!email || byEmail.has(email)) continue;
    const quality = matchQuality(q, email, m.name);
    if (quality === 0) continue;
    byEmail.set(email, {
      email,
      name: m.name,
      source: "mailbox",
      contactId: null,
      score: scoreRecipient({
        sendCount: 1,
        lastSentAt: m.lastSeenAt,
        matchQuality: quality,
        now: params.now,
      }),
    });
  }

  return [...byEmail.values()]
    .sort((a, b) => b.score - a.score || a.email.localeCompare(b.email))
    .slice(0, limit)
    .map(({ score: _score, ...rest }) => rest);
}

/** Sugerencias To/CC/BCC. Con q vacío devuelve los frecuentes del usuario. */
export async function suggestRecipients(
  q: string,
  opts: { tenantId: string; userId: string; limit?: number },
): Promise<RecipientSuggestion[]> {
  const limit = Math.min(Math.max(opts.limit ?? 8, 1), 25);
  const query = q.trim();

  const accounts = await prisma.crmEmailAccount.findMany({
    where: { tenantId: opts.tenantId, userId: opts.userId, status: "active" },
    select: { id: true },
    take: 5,
  });
  const accountIds = accounts.map((a) => a.id);

  const [contacts, recents, mailboxRows] = await Promise.all([
    query
      ? prisma.crmContact.findMany({
          where: {
            tenantId: opts.tenantId,
            email: { not: null },
            OR: [
              { email: { contains: query, mode: "insensitive" } },
              { firstName: { contains: query, mode: "insensitive" } },
              { lastName: { contains: query, mode: "insensitive" } },
            ],
          },
          select: { id: true, email: true, firstName: true, lastName: true },
          take: 25,
        })
      : Promise.resolve([]),
    prisma.crmEmailRecipient.findMany({
      where: {
        tenantId: opts.tenantId,
        userId: opts.userId,
        ...(query
          ? {
              OR: [
                { email: { contains: query, mode: "insensitive" } },
                { displayName: { contains: query, mode: "insensitive" } },
              ],
            }
          : {}),
      },
      orderBy: [{ sendCount: "desc" }, { lastSentAt: "desc" }],
      take: 50,
    }),
    accountIds.length > 0
      ? prisma.crmEmailMessage.findMany({
          where: {
            tenantId: opts.tenantId,
            isDraft: false,
            thread: { emailAccountId: { in: accountIds } },
            ...(query
              ? {
                  OR: [
                    { fromEmail: { contains: query, mode: "insensitive" } },
                    { toEmails: { has: query.toLowerCase() } },
                  ],
                }
              : {}),
          },
          select: {
            fromEmail: true,
            toEmails: true,
            sentAt: true,
            receivedAt: true,
            direction: true,
          },
          orderBy: [{ sentAt: "desc" }],
          take: query ? 80 : 40,
        })
      : Promise.resolve([]),
  ]);

  const mailboxMap = new Map<string, { email: string; name: string | null; lastSeenAt: Date | null }>();
  for (const row of mailboxRows) {
    const seenAt = row.sentAt ?? row.receivedAt ?? null;
    if (row.direction !== "out") {
      const parsed = parseAddressName(row.fromEmail);
      if (parsed.email && !mailboxMap.has(parsed.email)) {
        mailboxMap.set(parsed.email, { ...parsed, lastSeenAt: seenAt });
      }
    }
    for (const raw of row.toEmails) {
      const parsed = parseAddressName(raw);
      if (parsed.email && !mailboxMap.has(parsed.email)) {
        mailboxMap.set(parsed.email, { ...parsed, lastSeenAt: seenAt });
      }
    }
  }

  return mergeRecipientSuggestions({
    q: query,
    limit,
    crmContacts: contacts
      .filter((c) => c.email)
      .map((c) => ({
        id: c.id,
        email: c.email as string,
        name: `${c.firstName} ${c.lastName}`.trim() || null,
      })),
    recents,
    mailbox: [...mailboxMap.values()],
  });
}

/**
 * Upsert incremental tras un envío exitoso: acumula send_count y actualiza
 * last_sent_at por cada destinatario To/CC/BCC. Vincula contactId cuando el
 * email matchea un contacto del tenant. Nunca lanza.
 */
export async function recordRecipients(params: {
  tenantId: string;
  userId: string;
  to: string[];
  cc?: string[];
  bcc?: string[];
  sentAt?: Date;
}): Promise<void> {
  try {
    const sentAt = params.sentAt ?? new Date();
    const emails = [...new Set(
      [...params.to, ...(params.cc ?? []), ...(params.bcc ?? [])]
        .map((e) => normalizeEmailAddress(e))
        .filter((e): e is string => Boolean(e && e.includes("@"))),
    )];
    if (emails.length === 0) return;

    const contacts = await prisma.crmContact.findMany({
      where: { tenantId: params.tenantId, email: { in: emails, mode: "insensitive" } },
      select: { id: true, email: true, firstName: true, lastName: true },
    });
    const contactByEmail = new Map(
      contacts
        .filter((c) => c.email)
        .map((c) => [normalizeEmailAddress(c.email as string), c]),
    );

    for (const email of emails) {
      const contact = contactByEmail.get(email);
      const displayName = contact
        ? `${contact.firstName} ${contact.lastName}`.trim() || null
        : null;
      await prisma.crmEmailRecipient.upsert({
        where: {
          tenantId_userId_email: {
            tenantId: params.tenantId,
            userId: params.userId,
            email,
          },
        },
        create: {
          tenantId: params.tenantId,
          userId: params.userId,
          email,
          displayName,
          source: "send",
          sendCount: 1,
          firstSentAt: sentAt,
          lastSentAt: sentAt,
          contactId: contact?.id ?? null,
        },
        update: {
          sendCount: { increment: 1 },
          lastSentAt: sentAt,
          ...(displayName ? { displayName } : {}),
          ...(contact ? { contactId: contact.id } : {}),
        },
      });
    }
  } catch (error) {
    captureEmailError(error, {
      scope: "record-recipients",
      tenantId: params.tenantId,
      level: "warning",
    });
  }
}
