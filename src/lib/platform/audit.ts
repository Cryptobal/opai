/**
 * Auditoría de acciones de plataforma (PlatformAuditLog).
 * No persiste passwords, tokens ni secretos.
 */

import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";

const SENSITIVE_KEY = /^(password|apiKey|secret|token|pin)/i;

export type PlatformActorType = "platform_admin" | "system";

export interface LogPlatformActionInput {
  actorType: PlatformActorType;
  actorId?: string | null;
  actorEmail?: string | null;
  action: string;
  tenantId?: string | null;
  targetType: string;
  targetId?: string | null;
  before?: Record<string, unknown> | null;
  after?: Record<string, unknown> | null;
  request?: Request | null;
  ip?: string | null;
  userAgent?: string | null;
}

export type PlatformAuditDb = {
  platformAuditLog: {
    create: (args: { data: Prisma.PlatformAuditLogUncheckedCreateInput }) => Promise<unknown>;
  };
};

function sanitizeRecord(
  record: Record<string, unknown> | null | undefined,
): Prisma.InputJsonValue | undefined {
  if (!record) return undefined;
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(record)) {
    if (SENSITIVE_KEY.test(key)) continue;
    out[key] = value;
  }
  return out as Prisma.InputJsonValue;
}

export function extractRequestMeta(request?: Request | null): {
  ip?: string;
  userAgent?: string;
} {
  if (!request) return {};
  const forwarded = request.headers.get("x-forwarded-for");
  const ip =
    forwarded?.split(",")[0]?.trim() ||
    request.headers.get("x-real-ip") ||
    undefined;
  const userAgent = request.headers.get("user-agent") || undefined;
  return { ip, userAgent };
}

export async function logPlatformAction(
  params: LogPlatformActionInput,
  db: PlatformAuditDb = prisma,
): Promise<void> {
  try {
    const fromRequest = extractRequestMeta(params.request);
    await db.platformAuditLog.create({
      data: {
        actorType: params.actorType,
        actorId: params.actorId ?? undefined,
        actorEmail: params.actorEmail ?? undefined,
        action: params.action,
        tenantId: params.tenantId ?? undefined,
        targetType: params.targetType,
        targetId: params.targetId ?? undefined,
        before: sanitizeRecord(params.before),
        after: sanitizeRecord(params.after),
        ip: params.ip ?? fromRequest.ip,
        userAgent: params.userAgent ?? fromRequest.userAgent,
      },
    });
  } catch (error) {
    console.error("[PlatformAuditLog] Failed to write:", error);
  }
}

export async function hasPlatformAuditToday(input: {
  tenantId: string;
  action: string;
  now?: Date;
}): Promise<boolean> {
  const now = input.now ?? new Date();
  const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  const existing = await prisma.platformAuditLog.findFirst({
    where: {
      tenantId: input.tenantId,
      action: input.action,
      createdAt: { gte: start },
    },
    select: { id: true },
  });
  return Boolean(existing);
}
