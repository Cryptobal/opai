import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";

type JsonObj = Record<string, unknown>;

type CrmHistoryClientLike = {
  crmHistoryLog: {
    create: (args: {
      data: {
        tenantId: string;
        entityType: string;
        entityId: string;
        action: string;
        details?: Prisma.InputJsonValue;
        createdBy?: string | null;
      };
    }) => Promise<unknown>;
  };
};

export type CrmHistoryEntityType =
  | "account"
  | "contact"
  | "deal"
  | "installation"
  | "quote"
  | "lead";

export async function createCrmHistoryLog(
  input: {
    tenantId: string;
    entityType: CrmHistoryEntityType;
    entityId: string;
    action: string;
    details?: JsonObj;
    createdBy?: string | null;
  },
  client: CrmHistoryClientLike = prisma as unknown as CrmHistoryClientLike
): Promise<void> {
  try {
    await client.crmHistoryLog.create({
      data: {
        tenantId: input.tenantId,
        entityType: input.entityType,
        entityId: input.entityId,
        action: input.action,
        details: input.details as Prisma.InputJsonValue | undefined,
        createdBy: input.createdBy ?? null,
      },
    });
  } catch (error) {
    console.error("[CRM] Error writing history log:", error);
  }
}

function normalizeComparable(value: unknown): unknown {
  if (value instanceof Date) return value.toISOString();
  if (value === undefined) return undefined;
  if (value === null) return null;
  if (typeof value === "bigint") return value.toString();
  if (typeof value === "object") {
    try {
      return JSON.parse(JSON.stringify(value));
    } catch {
      return String(value);
    }
  }
  return value;
}

export function computeChangedFields(
  previous: JsonObj,
  patch: JsonObj
): {
  changedFields: string[];
  changes: Record<string, { from: unknown; to: unknown }>;
} {
  const changes: Record<string, { from: unknown; to: unknown }> = {};

  for (const [key, nextRaw] of Object.entries(patch)) {
    if (nextRaw === undefined) continue;
    const prevNorm = normalizeComparable(previous[key]);
    const nextNorm = normalizeComparable(nextRaw);
    if (JSON.stringify(prevNorm) === JSON.stringify(nextNorm)) continue;
    changes[key] = { from: prevNorm, to: nextNorm };
  }

  return {
    changedFields: Object.keys(changes),
    changes,
  };
}
