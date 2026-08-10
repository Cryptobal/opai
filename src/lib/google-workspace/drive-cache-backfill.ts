import { prisma } from "@/lib/prisma";
import { inferEntityHintFromPathKey, safeSegment } from "./drive-tree";

/**
 * Backfill idempotente de entityType/entityId en DriveFolderCache.
 * Si hay ambigüedad o no hay match, deja null (esas carpetas no ingieren
 * hasta que OPAI vuelva a escribir en ellas).
 */
export async function backfillDriveFolderEntities(
  tenantId: string,
  limit = 200,
): Promise<{ updated: number; skipped: number }> {
  const rows = await prisma.driveFolderCache.findMany({
    where: {
      tenantId,
      OR: [{ entityType: null }, { entityId: null }],
    },
    take: limit,
    orderBy: { createdAt: "asc" },
  });

  let updated = 0;
  let skipped = 0;

  for (const row of rows) {
    const hint = inferEntityHintFromPathKey(row.pathKey);
    if (!hint || hint.entityType === "trabajador") {
      skipped += 1;
      continue;
    }
    const entityId = await resolveEntityId(tenantId, hint);
    if (!entityId) {
      skipped += 1;
      continue;
    }
    await prisma.driveFolderCache.update({
      where: { id: row.id },
      data: { entityType: hint.entityType, entityId },
    });
    updated += 1;
  }

  return { updated, skipped };
}

async function resolveEntityId(
  tenantId: string,
  hint: NonNullable<ReturnType<typeof inferEntityHintFromPathKey>>,
): Promise<string | null> {
  const leaf = hint.leafName;
  switch (hint.entityType) {
    case "deal": {
      const deals = await prisma.crmDeal.findMany({
        where: { tenantId },
        select: { id: true, title: true },
        take: 500,
      });
      const matches = deals.filter((d) => safeSegment(d.title, d.id) === leaf);
      return matches.length === 1 ? matches[0]!.id : null;
    }
    case "lead": {
      const leads = await prisma.crmLead.findMany({
        where: { tenantId },
        select: { id: true, companyName: true, firstName: true, lastName: true },
        take: 500,
      });
      const matches = leads.filter((l) => {
        const label = safeSegment(
          l.companyName || `${l.firstName ?? ""} ${l.lastName ?? ""}`.trim(),
          l.id,
        );
        return label === leaf;
      });
      return matches.length === 1 ? matches[0]!.id : null;
    }
    case "account": {
      const accounts = await prisma.crmAccount.findMany({
        where: { tenantId },
        select: { id: true, name: true },
        take: 500,
      });
      const matches = accounts.filter(
        (a) => safeSegment(a.name, a.id) === leaf,
      );
      return matches.length === 1 ? matches[0]!.id : null;
    }
    case "contact": {
      const contacts = await prisma.crmContact.findMany({
        where: { tenantId },
        select: {
          id: true,
          firstName: true,
          lastName: true,
          account: { select: { name: true } },
        },
        take: 500,
      });
      const matches = contacts.filter((c) => {
        const nombre = safeSegment(`${c.firstName} ${c.lastName}`.trim(), c.id);
        if (nombre !== leaf) return false;
        if (hint.accountName) {
          return safeSegment(c.account?.name, "") === hint.accountName;
        }
        return true;
      });
      return matches.length === 1 ? matches[0]!.id : null;
    }
    case "installation": {
      const insts = await prisma.crmInstallation.findMany({
        where: { tenantId },
        select: { id: true, name: true, account: { select: { name: true } } },
        take: 500,
      });
      const matches = insts.filter((i) => {
        if (safeSegment(i.name, i.id) !== leaf) return false;
        if (hint.accountName) {
          return safeSegment(i.account?.name, "") === hint.accountName;
        }
        return true;
      });
      return matches.length === 1 ? matches[0]!.id : null;
    }
    default:
      return null;
  }
}
