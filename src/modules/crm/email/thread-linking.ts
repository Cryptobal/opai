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
  try {
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
