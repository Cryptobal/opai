import { prisma } from "@/lib/prisma";
import { Prisma } from "@prisma/client";

export type ThreadLinks = {
  contactId: string | null;
  accountId: string | null;
  dealId: string | null;
};

/**
 * Resuelve contacto / cuenta / deal a partir de las direcciones de correo de la
 * contraparte. Heurística conservadora:
 *  - contacto = primer CrmContact del tenant cuyo email coincida.
 *  - cuenta = accountId de ese contacto.
 *  - deal = solo si la cuenta tiene EXACTAMENTE un CrmDeal abierto.
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

  const contact = await prisma.crmContact.findFirst({
    where: {
      tenantId,
      OR: candidates.map((e) => ({ email: { equals: e, mode: "insensitive" as const } })),
    },
    select: { id: true, accountId: true },
  });
  if (!contact) return empty;

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
 * dueño cuando está disponible; si no, por `subject` (legacy). Un thread legacy
 * matcheado por subject se "adopta" seteándole providerThreadId/emailAccountId.
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
}): Promise<{ id: string }> {
  const { tenantId, subject, lastMessageAt, emailAccountId, providerThreadId } = params;
  const isInbound = params.isInbound !== false;
  const links = await resolveThreadLinks(tenantId, params.counterpartyEmails);

  const existing =
    (providerThreadId && emailAccountId
      ? await prisma.crmEmailThread.findUnique({
          where: {
            emailAccountId_providerThreadId: {
              emailAccountId,
              providerThreadId,
            },
          },
          select: { id: true, contactId: true, accountId: true, dealId: true, lastMessageAt: true },
        })
      : null) ??
    (await prisma.crmEmailThread.findFirst({
      where: { tenantId, subject },
      select: { id: true, contactId: true, accountId: true, dealId: true, lastMessageAt: true },
    }));

  if (!existing) {
    try {
      return await prisma.crmEmailThread.create({
        data: {
          tenantId,
          subject,
          lastMessageAt,
          emailAccountId: emailAccountId ?? null,
          providerThreadId: providerThreadId ?? null,
          contactId: links.contactId,
          accountId: links.accountId,
          dealId: links.dealId,
        },
        select: { id: true },
      });
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
  await prisma.crmEmailThread.update({
    where: { id: existing.id },
    data: {
      ...(advanceLastMsg ? { lastMessageAt } : {}),
      ...(emailAccountId ? { emailAccountId } : {}),
      ...(providerThreadId ? { providerThreadId } : {}),
      ...(existing.contactId == null && links.contactId ? { contactId: links.contactId } : {}),
      ...(existing.accountId == null && links.accountId ? { accountId: links.accountId } : {}),
      ...(existing.dealId == null && links.dealId ? { dealId: links.dealId } : {}),
    },
  });
  return { id: existing.id };
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
