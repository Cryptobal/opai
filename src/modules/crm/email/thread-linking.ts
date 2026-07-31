import { prisma } from "@/lib/prisma";
import { Prisma } from "@prisma/client";
import { normalizeEmailAddress } from "@/lib/email-address";
import {
  isOwnCompanyAccount,
  loadOwnTenant,
} from "@/modules/crm/email/own-tenant-company";

export type ThreadLinks = {
  contactId: string | null;
  accountId: string | null;
  dealId: string | null;
};

/**
 * Emails de contraparte para auto-asociar un hilo.
 *
 * - Inbound: SOLO From (+ Reply-To si difiere). To/CC suelen incluir casillas
 *   propias u otros contactos internos del tenant; si esos existen como
 *   CrmContact bajo la cuenta de la propia empresa, el hilo quedaba mal
 *   asociado (p. ej. cliente @corrupac.cl → "Gard Security").
 * - Outbound: To + CC (destinatarios externos).
 */
export function counterpartyEmailsForLinking(params: {
  direction: "in" | "out";
  fromEmail: string | null | undefined;
  replyToEmail?: string | null;
  toEmails?: string[];
  ccEmails?: string[];
  ownEmail: string;
}): string[] {
  const own = normalizeEmailAddress(params.ownEmail);
  const keep = (e: string | null | undefined) => {
    if (!e) return false;
    return normalizeEmailAddress(e) !== own;
  };

  if (params.direction === "in") {
    const out: string[] = [];
    if (keep(params.fromEmail)) out.push(normalizeEmailAddress(params.fromEmail!));
    if (keep(params.replyToEmail)) {
      const rt = normalizeEmailAddress(params.replyToEmail!);
      if (!out.includes(rt)) out.push(rt);
    }
    return out;
  }

  return Array.from(
    new Set(
      [...(params.toEmails ?? []), ...(params.ccEmails ?? [])]
        .filter(keep)
        .map((e) => normalizeEmailAddress(e)),
    ),
  );
}

/**
 * Resuelve contacto / cuenta / deal a partir de las direcciones de correo de la
 * contraparte. Heurística conservadora:
 *  - contacto = primer candidato (en orden) que exista como CrmContact.
 *  - cuenta = accountId de ese contacto.
 *  - deal = solo si la cuenta tiene EXACTAMENTE un CrmDeal abierto.
 *
 * El orden de `emails` importa: el primero es la contraparte primaria (From
 * en inbound). Así no gana un CC interno por orden arbitrario de BD.
 */
export async function resolveThreadLinks(
  tenantId: string,
  emails: string[],
): Promise<ThreadLinks> {
  const empty: ThreadLinks = { contactId: null, accountId: null, dealId: null };
  const candidates = Array.from(
    new Set(emails.map((e) => e?.trim().toLowerCase()).filter(Boolean) as string[]),
  );
  if (candidates.length === 0) return empty;

  const [contacts, own] = await Promise.all([
    prisma.crmContact.findMany({
      where: {
        tenantId,
        OR: candidates.map((e) => ({ email: { equals: e, mode: "insensitive" as const } })),
      },
      select: {
        id: true,
        accountId: true,
        email: true,
        account: { select: { id: true, name: true, website: true } },
      },
      take: 30,
    }),
    loadOwnTenant(tenantId),
  ]);
  if (contacts.length === 0) return empty;

  const byEmail = new Map(
    contacts
      .filter((c) => c.email)
      .map((c) => [normalizeEmailAddress(c.email!), c] as const),
  );
  let contact = null as (typeof contacts)[number] | null;
  for (const email of candidates) {
    const hit = byEmail.get(email);
    if (hit) {
      contact = hit;
      break;
    }
  }
  if (!contact) return empty;

  // Nunca auto-asociar a la cuenta de la propia empresa del tenant.
  if (
    contact.account &&
    isOwnCompanyAccount(contact.account, own)
  ) {
    return { contactId: contact.id, accountId: null, dealId: null };
  }

  let dealId: string | null = null;
  if (contact.accountId) {
    const openDeals = await prisma.crmDeal.findMany({
      where: { tenantId, accountId: contact.accountId, status: "open" },
      select: { id: true },
      take: 2,
    });
    if (openDeals.length === 1) dealId = openDeals[0].id;
  }
  return { contactId: contact.id, accountId: contact.accountId ?? null, dealId };
}

/**
 * Busca o crea el thread y, al hacerlo, vincula contacto/cuenta/deal.
 *
 * Matching: por `providerThreadId` (id de hilo Gmail) + `emailAccountId` del
 * dueño cuando está disponible. El fallback por `subject` (legacy) SOLO adopta
 * hilos huérfanos —sin `providerThreadId` y de la propia casilla o sin dueño—
 * seteándoles providerThreadId/emailAccountId; nunca cruza casillas ni fusiona
 * dos hilos Gmail distintos con el mismo asunto.
 *
 * En threads existentes hace backfill SOLO de los FKs que estén null — nunca
 * sobreescribe un dealId (u otro vínculo) ya seteado. `lastMessageAt` solo
 * avanza con correos RECIBIDOS (isInbound): así la bandeja se ordena por el
 * último inbound, como Gmail, y responder no reordena el hilo. En un thread
 * nuevo sí toma la fecha del primer mensaje (sea cual sea su dirección).
 */
export async function upsertLinkedThread(params: {
  tenantId: string;
  subject: string;
  lastMessageAt: Date;
  counterpartyEmails: string[];
  emailAccountId?: string | null;
  providerThreadId?: string | null;
  /** El mensaje que gatilla el upsert es entrante. Default true (compat). */
  isInbound?: boolean;
  /**
   * Si true, al autoasociar cuenta/contacto por match exacto de email se
   * escribe AuditLog `email.associate` con `meta.via = "rule"`.
   */
  auditAutoAssociate?: boolean;
  createdByUserId?: string | null;
}): Promise<{ id: string }> {
  const { tenantId, subject, lastMessageAt, emailAccountId, providerThreadId } = params;
  const isInbound = params.isInbound !== false;
  const links = await resolveThreadLinks(tenantId, params.counterpartyEmails);

  const threadSelect = {
    id: true,
    contactId: true,
    accountId: true,
    dealId: true,
    lastMessageAt: true,
    lastInboundAt: true,
    lastOutboundAt: true,
    firstInboundAt: true,
  } as const;

  const existing =
    (providerThreadId && emailAccountId
      ? await prisma.crmEmailThread.findUnique({
          where: {
            emailAccountId_providerThreadId: {
              emailAccountId,
              providerThreadId,
            },
          },
          select: threadSelect,
        })
      : null) ??
    // Fallback legacy por asunto — SOLO para adoptar hilos huérfanos: los
    // creados por otras vías (followup, web4leads) SIN threadId de Gmail y sin
    // dueño, o los del propio dueño aún sin threadId. Se acota por:
    //  · `providerThreadId: null` → nunca fusiona dos hilos Gmail distintos que
    //    comparten asunto (adoptar solo, jamás mezclar).
    //  · casilla == propia o sin dueño → NUNCA roba el hilo de otra casilla.
    // Sin este scope, dos usuarios componiendo borradores con el mismo asunto
    // (en especial el default "(Borrador sin asunto)") colisionaban en un único
    // hilo, y un inbound de una casilla robaba el hilo de otra: los borradores
    // de un usuario aparecían en la bandeja de otro y Recibidos se
    // desincronizaba de Gmail.
    (await prisma.crmEmailThread.findFirst({
      where: {
        tenantId,
        subject,
        providerThreadId: null,
        ...(emailAccountId
          ? { OR: [{ emailAccountId: null }, { emailAccountId }] }
          : { emailAccountId: null }),
      },
      select: threadSelect,
    }));

  if (!existing) {
    try {
      const created = await prisma.crmEmailThread.create({
        data: {
          tenantId,
          subject,
          lastMessageAt,
          emailAccountId: emailAccountId ?? null,
          providerThreadId: providerThreadId ?? null,
          contactId: links.contactId,
          accountId: links.accountId,
          dealId: links.dealId,
          ...(isInbound
            ? { lastInboundAt: lastMessageAt, firstInboundAt: lastMessageAt }
            : { lastOutboundAt: lastMessageAt }),
        },
        select: { id: true },
      });
      if (params.auditAutoAssociate && links.accountId) {
        const { auditEmailAction } = await import("@/lib/audit-email");
        void auditEmailAction({
          tenantId,
          userId: params.createdByUserId,
          action: "associate",
          entityType: "email_thread",
          entityId: created.id,
          meta: {
            via: "rule",
            accountId: links.accountId,
            contactId: links.contactId,
            dealId: links.dealId,
          },
        });
      }
      return created;
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === "P2002" &&
        emailAccountId &&
        providerThreadId
      ) {
        const winner = await prisma.crmEmailThread.findUnique({
          where: {
            emailAccountId_providerThreadId: {
              emailAccountId,
              providerThreadId,
            },
          },
          select: { id: true },
        });
        if (winner) return winner;
      }
      throw error;
    }
  }

  // Solo los recibidos reordenan la bandeja (los enviados no bumpean el hilo).
  const advanceLastMsg =
    isInbound && (!existing.lastMessageAt || lastMessageAt > existing.lastMessageAt);
  const advanceInbound =
    isInbound &&
    (!existing.lastInboundAt || lastMessageAt > existing.lastInboundAt);
  const advanceOutbound =
    !isInbound &&
    (!existing.lastOutboundAt || lastMessageAt > existing.lastOutboundAt);
  const autoAccount =
    existing.accountId == null && Boolean(links.accountId);
  const autoContact =
    existing.contactId == null && Boolean(links.contactId);
  try {
    await prisma.crmEmailThread.update({
      where: { id: existing.id },
      data: {
        ...(advanceLastMsg ? { lastMessageAt } : {}),
        ...(advanceInbound ? { lastInboundAt: lastMessageAt } : {}),
        ...(isInbound && !existing.firstInboundAt
          ? { firstInboundAt: lastMessageAt }
          : {}),
        ...(advanceOutbound ? { lastOutboundAt: lastMessageAt } : {}),
        ...(emailAccountId ? { emailAccountId } : {}),
        ...(providerThreadId ? { providerThreadId } : {}),
        ...(autoContact ? { contactId: links.contactId } : {}),
        ...(autoAccount ? { accountId: links.accountId } : {}),
        ...(existing.dealId == null && links.dealId ? { dealId: links.dealId } : {}),
      },
    });
    if (params.auditAutoAssociate && autoAccount && links.accountId) {
      const { auditEmailAction } = await import("@/lib/audit-email");
      void auditEmailAction({
        tenantId,
        userId: params.createdByUserId,
        action: "associate",
        entityType: "email_thread",
        entityId: existing.id,
        meta: {
          via: "rule",
          accountId: links.accountId,
          contactId: links.contactId,
          dealId: links.dealId,
        },
      });
    }
    return { id: existing.id };
  } catch (error) {
    // Conflicto al adoptar huérfano: ya hay un hilo con ese providerThreadId.
    // Devolver el canónico para que el mensaje quede en el espejo correcto.
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2002" &&
      emailAccountId &&
      providerThreadId
    ) {
      const winner = await prisma.crmEmailThread.findUnique({
        where: {
          emailAccountId_providerThreadId: {
            emailAccountId,
            providerThreadId,
          },
        },
        select: { id: true },
      });
      if (winner) return winner;
    }
    throw error;
  }
}

/**
 * Re-match retroactivo liviano: al crear un contacto nuevo, vincula los threads
 * existentes de ese email que aún no tengan contactId. Setea contactId (+ accountId
 * y dealId si la cuenta tiene 1 deal abierto). Devuelve cuántos threads tocó.
 */
export async function rematchThreadsForContact(
  tenantId: string,
  contactEmail: string,
): Promise<number> {
  const email = contactEmail?.trim().toLowerCase();
  if (!email) return 0;
  const links = await resolveThreadLinks(tenantId, [email]);
  if (!links.contactId) return 0;

  const orphans = await prisma.crmEmailThread.findMany({
    where: {
      tenantId,
      contactId: null,
      messages: { some: { fromEmail: { equals: email, mode: "insensitive" } } },
    },
    select: { id: true, accountId: true, dealId: true },
    take: 200,
  });

  let touched = 0;
  for (const t of orphans) {
    await prisma.crmEmailThread.update({
      where: { id: t.id },
      data: {
        contactId: links.contactId,
        ...(t.accountId == null && links.accountId ? { accountId: links.accountId } : {}),
        ...(t.dealId == null && links.dealId ? { dealId: links.dealId } : {}),
      },
    });
    touched += 1;
  }
  return touched;
}
