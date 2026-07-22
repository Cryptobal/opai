/**
 * Backfill de frecency de destinatarios (PR-05, C21a).
 *
 * Recorre crm.email_messages con direction='out' y hace upsert en
 * crm.email_recipients de cada To/CC/BCC por el usuario dueño de la casilla,
 * acumulando send_count y fechas first/last.
 *
 * IDEMPOTENTE: los totales se calculan completos en memoria y se aplican de
 * forma monotónica — en el update, send_count solo se escribe si el total
 * calculado supera el existente (así una segunda corrida no duplica y no
 * pisa contadores que ya crecieron orgánicamente con envíos nuevos).
 *
 * Uso: npx tsx scripts/backfill-email-recipients.ts
 */
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();
const BATCH = 500;

function normalize(email: string): string {
  return email.trim().toLowerCase();
}

type Acc = { count: number; first: Date; last: Date };

async function main() {
  // Dueño de cada casilla (los mensajes out registran emailAccountId).
  const accounts = await prisma.crmEmailAccount.findMany({
    select: { id: true, tenantId: true, userId: true },
  });
  const accountById = new Map(accounts.map((a) => [a.id, a]));

  const totals = new Map<string, Acc>(); // key: tenantId|userId|email
  let cursor: string | null = null;
  let scanned = 0;

  for (;;) {
    const messages: Array<{
      id: string;
      emailAccountId: string | null;
      toEmails: string[];
      ccEmails: string[];
      bccEmails: string[];
      sentAt: Date | null;
      createdAt: Date;
    }> = await prisma.crmEmailMessage.findMany({
      where: { direction: "out" },
      select: {
        id: true,
        emailAccountId: true,
        toEmails: true,
        ccEmails: true,
        bccEmails: true,
        sentAt: true,
        createdAt: true,
      },
      orderBy: { id: "asc" },
      take: BATCH,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
    });
    if (messages.length === 0) break;
    cursor = messages[messages.length - 1].id;
    scanned += messages.length;

    for (const m of messages) {
      const account = m.emailAccountId ? accountById.get(m.emailAccountId) : null;
      if (!account) continue;
      const when = m.sentAt ?? m.createdAt;
      const emails = new Set(
        [...m.toEmails, ...m.ccEmails, ...m.bccEmails]
          .map(normalize)
          .filter((e) => e.includes("@")),
      );
      for (const email of emails) {
        const key = `${account.tenantId}|${account.userId}|${email}`;
        const acc = totals.get(key);
        if (!acc) {
          totals.set(key, { count: 1, first: when, last: when });
        } else {
          acc.count += 1;
          if (when < acc.first) acc.first = when;
          if (when > acc.last) acc.last = when;
        }
      }
    }
    console.log(`  … ${scanned} mensajes out procesados`);
  }

  console.log(`Mensajes: ${scanned}. Destinatarios únicos: ${totals.size}.`);

  // Vincular contactId por email dentro de cada tenant.
  const tenantIds = [...new Set([...totals.keys()].map((k) => k.split("|")[0]))];
  const contactsByTenant = new Map<string, Map<string, { id: string; name: string }>>();
  for (const tenantId of tenantIds) {
    const contacts = await prisma.crmContact.findMany({
      where: { tenantId, email: { not: null } },
      select: { id: true, email: true, firstName: true, lastName: true },
    });
    contactsByTenant.set(
      tenantId,
      new Map(
        contacts
          .filter((c) => c.email)
          .map((c) => [
            normalize(c.email as string),
            { id: c.id, name: `${c.firstName} ${c.lastName}`.trim() },
          ]),
      ),
    );
  }

  let created = 0;
  let updated = 0;
  let unchanged = 0;
  for (const [key, acc] of totals) {
    const [tenantId, userId, email] = key.split("|");
    const contact = contactsByTenant.get(tenantId)?.get(email) ?? null;
    const existing = await prisma.crmEmailRecipient.findUnique({
      where: { tenantId_userId_email: { tenantId, userId, email } },
      select: { id: true, sendCount: true, firstSentAt: true, lastSentAt: true },
    });
    if (!existing) {
      await prisma.crmEmailRecipient.create({
        data: {
          tenantId,
          userId,
          email,
          displayName: contact?.name || null,
          source: "backfill",
          sendCount: acc.count,
          firstSentAt: acc.first,
          lastSentAt: acc.last,
          contactId: contact?.id ?? null,
        },
      });
      created += 1;
    } else if (acc.count > existing.sendCount) {
      await prisma.crmEmailRecipient.update({
        where: { id: existing.id },
        data: {
          sendCount: acc.count,
          firstSentAt: acc.first < existing.firstSentAt ? acc.first : existing.firstSentAt,
          lastSentAt: acc.last > existing.lastSentAt ? acc.last : existing.lastSentAt,
          ...(contact ? { contactId: contact.id } : {}),
        },
      });
      updated += 1;
    } else {
      unchanged += 1;
    }
  }

  console.log(`✅ Backfill: ${created} creados, ${updated} actualizados, ${unchanged} sin cambios.`);
}

main()
  .catch((error) => {
    console.error("❌ Backfill falló:", error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
