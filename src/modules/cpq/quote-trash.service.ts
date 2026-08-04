import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { nextDocumentCode } from "@/lib/cpq/document-counter";
import { createCrmHistoryLog } from "@/lib/crm-history";
import { deleteFile } from "@/lib/storage";

type Tx = Prisma.TransactionClient;
type JsonRecord = Record<string, unknown>;

export type QuoteTrashErrorCode = "QUOTE_NOT_FOUND" | "TRASH_NOT_FOUND" | "ALREADY_RESTORED" | "EXPIRED";

export class QuoteTrashError extends Error {
  code: QuoteTrashErrorCode;

  constructor(code: QuoteTrashErrorCode) {
    super(code);
    this.name = "QuoteTrashError";
    this.code = code;
  }
}

export type DeleteQuoteToTrashResult = {
  trashId: string;
  code: string;
  bundleId: string | null;
};

export type RestoreQuoteFromTrashResult = {
  quoteId: string;
  code: string;
  codeChanged: boolean;
};

const CHILD_KEYS = [
  "positions",
  "parameters",
  "serviceGroups",
  "uniformItems",
  "examItems",
  "costItems",
  "meals",
  "vehicles",
  "infrastructure",
  "additionalLines",
  "attachments",
  "includesItems",
  "installation",
  "proposalBundleQuote",
] as const;

const QUOTE_TRASH_RETENTION_MS = 30 * 24 * 60 * 60 * 1000;

function decimalToString(value: unknown): string | null {
  const decimalCtor = Prisma.Decimal as unknown as { isDecimal?: (candidate: unknown) => boolean };
  if (value instanceof Prisma.Decimal || decimalCtor.isDecimal?.(value)) {
    return (value as Prisma.Decimal).toFixed();
  }
  if (
    value &&
    typeof value === "object" &&
    value.constructor?.name === "Decimal" &&
    typeof (value as { toFixed?: unknown }).toFixed === "function"
  ) {
    return String((value as { toFixed: () => string }).toFixed());
  }
  return null;
}

export function serializeForTrash(value: unknown): unknown {
  const decimal = decimalToString(value);
  if (decimal !== null) return decimal;
  if (value instanceof Date) return value.toISOString();
  if (value === undefined) return null;
  if (value === null || typeof value !== "object") return value;
  if (Array.isArray(value)) return value.map(serializeForTrash);

  const out: JsonRecord = {};
  for (const [key, child] of Object.entries(value)) {
    out[key] = serializeForTrash(child);
  }
  return out;
}

function asRecord(value: unknown): JsonRecord {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as JsonRecord) : {};
}

function asRecords(value: unknown): JsonRecord[] {
  return Array.isArray(value) ? value.map(asRecord).filter((item) => Object.keys(item).length > 0) : [];
}

function nullableString(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 ? value : null;
}

function omitKeys(source: JsonRecord, keys: readonly string[]): JsonRecord {
  const blocked = new Set(keys);
  return Object.fromEntries(Object.entries(source).filter(([key]) => !blocked.has(key)));
}

function jsonOrDbNull(value: unknown): Prisma.InputJsonValue | typeof Prisma.DbNull {
  return value === null || value === undefined ? Prisma.DbNull : (value as Prisma.InputJsonValue);
}

async function existsByTenant(
  lookup: { findFirst: (args: { where: JsonRecord; select: { id: true } }) => Promise<unknown> },
  tenantId: string,
  id: string | null,
): Promise<string | null> {
  if (!id) return null;
  const row = await lookup.findFirst({ where: { id, tenantId }, select: { id: true } });
  return row ? id : null;
}

async function resolveProposalTemplateId(tx: Tx, tenantId: string, id: string | null): Promise<string | null> {
  if (!id) return null;
  const row = await tx.cpqProposalTemplate.findFirst({
    where: { id, OR: [{ tenantId }, { tenantId: null }] },
    select: { id: true },
  });
  return row ? id : null;
}

function attachmentStorageKeys(payload: unknown): string[] {
  const keys = new Set<string>();
  for (const attachment of asRecords(asRecord(payload).attachments)) {
    const key = nullableString(attachment.storageKey) ?? nullableString(attachment.key);
    if (key) keys.add(key);
  }
  return [...keys];
}

export async function collectQuoteSnapshot(tx: Tx, tenantId: string, quoteId: string): Promise<JsonRecord> {
  const quote = await tx.cpqQuote.findFirst({
    where: { id: quoteId, tenantId },
    include: {
      positions: true,
      parameters: true,
      serviceGroups: true,
      uniformItems: true,
      examItems: true,
      costItems: true,
      meals: true,
      vehicles: true,
      infrastructure: true,
      additionalLines: true,
      attachments: true,
      includesItems: true,
      proposalBundleQuote: true,
      installation: { select: { name: true } },
    },
  });

  if (!quote) throw new QuoteTrashError("QUOTE_NOT_FOUND");
  return serializeForTrash(quote) as JsonRecord;
}

export async function deleteQuoteToTrash(opts: {
  tx?: Tx;
  tenantId: string;
  quoteId: string;
  userId?: string | null;
  reason?: string | null;
}): Promise<DeleteQuoteToTrashResult> {
  const run = async (tx: Tx): Promise<DeleteQuoteToTrashResult> => {
    const snapshot = await collectQuoteSnapshot(tx, opts.tenantId, opts.quoteId);
    const bundleId = nullableString(asRecord(snapshot.proposalBundleQuote).bundleId);
    const salePriceMonthly = nullableString(asRecord(snapshot.parameters).salePriceMonthly);
    const installationName = nullableString(asRecord(snapshot.installation).name);
    const expiresAt = new Date(Date.now() + QUOTE_TRASH_RETENTION_MS);

    const trash = await tx.cpqQuoteTrash.create({
      data: {
        tenantId: opts.tenantId,
        quoteId: opts.quoteId,
        code: String(snapshot.code),
        name: nullableString(snapshot.name),
        status: String(snapshot.status),
        accountId: nullableString(snapshot.accountId),
        dealId: nullableString(snapshot.dealId),
        bundleId,
        installationName,
        salePriceMonthly,
        payload: snapshot as Prisma.InputJsonValue,
        reason: opts.reason?.trim() || null,
        deletedBy: opts.userId ?? null,
        expiresAt,
      },
    });

    await tx.crmDealQuote.deleteMany({ where: { tenantId: opts.tenantId, quoteId: opts.quoteId } });
    await tx.crmEmailThreadLink.deleteMany({
      where: { tenantId: opts.tenantId, entityType: "quote", entityId: opts.quoteId },
    });
    await tx.cpqQuote.delete({ where: { id: opts.quoteId } });

    await createCrmHistoryLog(
      {
        tenantId: opts.tenantId,
        entityType: "quote",
        entityId: opts.quoteId,
        action: "quote_deleted",
        details: { code: trash.code, trashId: trash.id, reason: opts.reason ?? null },
        createdBy: opts.userId ?? null,
      },
      tx as unknown as Parameters<typeof createCrmHistoryLog>[1],
    );

    return { trashId: trash.id, code: trash.code, bundleId };
  };

  return opts.tx ? run(opts.tx) : prisma.$transaction(run);
}

async function restoreQuoteChildren(tx: Tx, quoteId: string, tenantId: string, payload: JsonRecord): Promise<void> {
  const serviceGroupIds = new Map<string, string>();
  for (const group of asRecords(payload.serviceGroups)) {
    const created = await tx.cpqServiceGroup.create({
      data: {
        ...omitKeys(group, ["id", "quoteId"]),
        quoteId,
        tenantId,
      } as Prisma.CpqServiceGroupUncheckedCreateInput,
    });
    const oldId = nullableString(group.id);
    if (oldId) serviceGroupIds.set(oldId, created.id);
  }

  const positions = asRecords(payload.positions);
  if (positions.length > 0) {
    await tx.cpqPosition.createMany({
      data: positions.map((position) => ({
        ...omitKeys(position, ["id", "quoteId"]),
        quoteId,
        serviceGroupId: serviceGroupIds.get(nullableString(position.serviceGroupId) ?? "") ?? null,
        payrollSnapshot: jsonOrDbNull(position.payrollSnapshot),
      })) as Prisma.CpqPositionCreateManyInput[],
    });
  }

  const parameters = asRecord(payload.parameters);
  if (Object.keys(parameters).length > 0) {
    await tx.cpqQuoteParameters.create({
      data: {
        ...omitKeys(parameters, ["id", "quoteId"]),
        quoteId,
      } as Prisma.CpqQuoteParametersUncheckedCreateInput,
    });
  }

  const createMany = async <T>(items: JsonRecord[], create: (data: T[]) => Promise<unknown>) => {
    if (items.length > 0) await create(items as T[]);
  };

  await createMany<Prisma.CpqQuoteUniformItemCreateManyInput>(
    asRecords(payload.uniformItems).map((item) => ({
      ...omitKeys(item, ["id", "quoteId"]),
      quoteId,
    })),
    (data) => tx.cpqQuoteUniformItem.createMany({ data }),
  );
  await createMany<Prisma.CpqQuoteExamItemCreateManyInput>(
    asRecords(payload.examItems).map((item) => ({ ...omitKeys(item, ["id", "quoteId"]), quoteId })),
    (data) => tx.cpqQuoteExamItem.createMany({ data }),
  );
  await createMany<Prisma.CpqQuoteCostItemCreateManyInput>(
    asRecords(payload.costItems).map((item) => ({ ...omitKeys(item, ["id", "quoteId"]), quoteId })),
    (data) => tx.cpqQuoteCostItem.createMany({ data }),
  );
  await createMany<Prisma.CpqQuoteMealCreateManyInput>(
    asRecords(payload.meals).map((item) => ({ ...omitKeys(item, ["id", "quoteId"]), quoteId })),
    (data) => tx.cpqQuoteMeal.createMany({ data }),
  );
  await createMany<Prisma.CpqQuoteVehicleCreateManyInput>(
    asRecords(payload.vehicles).map((item) => ({ ...omitKeys(item, ["id", "quoteId"]), quoteId })),
    (data) => tx.cpqQuoteVehicle.createMany({ data }),
  );
  await createMany<Prisma.CpqQuoteInfrastructureCreateManyInput>(
    asRecords(payload.infrastructure).map((item) => ({ ...omitKeys(item, ["id", "quoteId"]), quoteId })),
    (data) => tx.cpqQuoteInfrastructure.createMany({ data }),
  );
  await createMany<Prisma.CpqQuoteAdditionalLineCreateManyInput>(
    asRecords(payload.additionalLines).map((item) => ({ ...omitKeys(item, ["id", "quoteId"]), quoteId })),
    (data) => tx.cpqQuoteAdditionalLine.createMany({ data }),
  );
  await createMany<Prisma.CpqQuoteIncludesItemCreateManyInput>(
    asRecords(payload.includesItems).map((item) => ({ ...omitKeys(item, ["id", "quoteId"]), quoteId })),
    (data) => tx.cpqQuoteIncludesItem.createMany({ data }),
  );
  await createMany<Prisma.CpqQuoteAttachmentCreateManyInput>(
    asRecords(payload.attachments).map((item) => ({
      ...omitKeys(item, ["id", "quoteId"]),
      quoteId,
      tenantId,
    })),
    (data) => tx.cpqQuoteAttachment.createMany({ data }),
  );
}

export async function restoreQuoteFromTrash(opts: {
  tenantId: string;
  trashId: string;
  userId?: string | null;
}): Promise<RestoreQuoteFromTrashResult> {
  const trash = await prisma.cpqQuoteTrash.findFirst({
    where: { id: opts.trashId, tenantId: opts.tenantId },
  });
  if (!trash) throw new QuoteTrashError("TRASH_NOT_FOUND");
  if (trash.restoredAt) throw new QuoteTrashError("ALREADY_RESTORED");
  if (trash.expiresAt.getTime() < Date.now()) throw new QuoteTrashError("EXPIRED");

  return prisma.$transaction(async (tx) => {
    const payload = asRecord(trash.payload);
    const originalCode = trash.code;
    const existingCode = await tx.cpqQuote.findFirst({
      where: { tenantId: opts.tenantId, code: originalCode },
      select: { id: true },
    });
    const code = existingCode ? await nextDocumentCode(tx, opts.tenantId, "quote") : originalCode;
    const accountId = await existsByTenant(tx.crmAccount, opts.tenantId, nullableString(payload.accountId));
    const dealId = await existsByTenant(tx.crmDeal, opts.tenantId, nullableString(payload.dealId));
    const contactId = await existsByTenant(tx.crmContact, opts.tenantId, nullableString(payload.contactId));
    const installationId = await existsByTenant(
      tx.crmInstallation,
      opts.tenantId,
      nullableString(payload.installationId),
    );
    const proposalTemplateId = await resolveProposalTemplateId(
      tx,
      opts.tenantId,
      nullableString(payload.proposalTemplateId),
    );

    const quoteData = {
      ...omitKeys(payload, ["id", "code", ...CHILD_KEYS]),
      id: trash.quoteId,
      tenantId: opts.tenantId,
      code,
      accountId,
      dealId,
      contactId,
      installationId,
      proposalTemplateId,
      proposalAiContent: jsonOrDbNull(payload.proposalAiContent),
    } as Prisma.CpqQuoteUncheckedCreateInput;

    const quote = await tx.cpqQuote.create({ data: quoteData });
    await restoreQuoteChildren(tx, quote.id, opts.tenantId, payload);
    await tx.cpqQuoteTrash.update({ where: { id: trash.id }, data: { restoredAt: new Date() } });

    await createCrmHistoryLog(
      {
        tenantId: opts.tenantId,
        entityType: "quote",
        entityId: quote.id,
        action: "quote_restored",
        details: { trashId: trash.id, originalCode, code, codeChanged: code !== originalCode },
        createdBy: opts.userId ?? null,
      },
      tx as unknown as Parameters<typeof createCrmHistoryLog>[1],
    );

    return { quoteId: quote.id, code, codeChanged: code !== originalCode };
  });
}

export async function purgeExpiredTrash(): Promise<{ purged: number }> {
  const now = new Date();
  const rows = await prisma.cpqQuoteTrash.findMany({
    where: { expiresAt: { lt: now }, restoredAt: null },
    select: { id: true, payload: true },
  });

  for (const row of rows) {
    for (const storageKey of attachmentStorageKeys(row.payload)) {
      try {
        await deleteFile(storageKey);
      } catch {
        // La purga de metadata no debe bloquearse por objetos ya inexistentes.
      }
    }
  }

  const deleted = await prisma.cpqQuoteTrash.deleteMany({
    where: { id: { in: rows.map((row) => row.id) } },
  });
  return { purged: deleted.count };
}
