/**
 * Syncs the first representante legal from the new AccountRepresentanteLegal table
 * back to the legacy CrmAccount.legalRepresentativeName / legalRepresentativeRut fields.
 *
 * Also provides auto-migration from legacy fields to the new table.
 */
import { prisma } from "@/lib/prisma";

/**
 * After any mutation on AccountRepresentanteLegal, call this to keep
 * the legacy single-representante fields on CrmAccount in sync.
 */
export async function syncRepresentanteLegacyFields(accountId: string) {
  const first = await prisma.accountRepresentanteLegal.findFirst({
    where: { accountId },
    select: { nombre: true, rut: true },
    orderBy: { createdAt: "asc" },
  });

  await prisma.crmAccount.update({
    where: { id: accountId },
    data: {
      legalRepresentativeName: first?.nombre ?? null,
      legalRepresentativeRut: first?.rut ?? null,
    },
  });
}

/**
 * On portal/CRM load: if the new table is empty but legacy fields exist,
 * auto-create a record in AccountRepresentanteLegal from legacy data.
 * Returns the (possibly newly created) representantes list.
 */
export async function migrateAndGetRepresentantes(
  accountId: string,
  tenantId: string
): Promise<{ id: string; nombre: string; rut: string }[]> {
  let reps: { id: string; nombre: string; rut: string }[] = [];

  try {
    reps = await prisma.accountRepresentanteLegal.findMany({
      where: { accountId, tenantId },
      select: { id: true, nombre: true, rut: true },
      orderBy: { createdAt: "asc" },
    });
  } catch {
    // Table may not exist yet
    return [];
  }

  // Auto-migrate legacy fields if new table is empty
  if (reps.length === 0) {
    const account = await prisma.crmAccount.findUnique({
      where: { id: accountId },
      select: { legalRepresentativeName: true, legalRepresentativeRut: true },
    });

    if (account?.legalRepresentativeName?.trim()) {
      try {
        const created = await prisma.accountRepresentanteLegal.create({
          data: {
            tenantId,
            accountId,
            nombre: account.legalRepresentativeName.trim(),
            rut: account.legalRepresentativeRut?.trim() ?? "",
          },
          select: { id: true, nombre: true, rut: true },
        });
        reps = [created];
      } catch {
        // Table may not exist yet
      }
    }
  }

  return reps;
}
