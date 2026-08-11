import { prisma } from "@/lib/prisma";
import { Prisma } from "@prisma/client";
import { parseCursor } from "@/lib/docs/migration/cursor";
import { backfillPersonaBatch } from "@/lib/docs/migration/backfill-persona";
import { backfillOperacionalBatch } from "@/lib/docs/migration/backfill-operacional";
import { verifyParity } from "@/lib/docs/migration/parity";
import { clearReadsUnifiedCache } from "@/lib/docs/migration/reads-unified";
import {
  emptyStats,
  type MigrationStats,
  type MigrationStatus,
} from "@/lib/docs/migration/types";

function asStats(raw: unknown): MigrationStats {
  if (!raw || typeof raw !== "object") return emptyStats();
  return { ...emptyStats(), ...(raw as Partial<MigrationStats>) };
}

async function ensureState(tenantId: string) {
  return prisma.docsMigrationState.upsert({
    where: { tenantId },
    create: { tenantId, status: "pending", stats: emptyStats() },
    update: {},
  });
}

/** Un tick del cron para un tenant. Idempotente y reentrante. */
export async function runMigrationTick(tenantId: string): Promise<{
  status: MigrationStatus;
  advanced: boolean;
}> {
  const state = await ensureState(tenantId);
  const status = state.status as MigrationStatus;

  if (status === "completed" || status === "failed") {
    return { status, advanced: false };
  }

  if (status === "pending") {
    await prisma.docsMigrationState.update({
      where: { tenantId },
      data: {
        status: "running",
        startedAt: new Date(),
        cursorLegacy: "persona",
        stats: emptyStats(),
        failureReason: null,
        parityReport: Prisma.DbNull,
      },
    });
    return { status: "running", advanced: true };
  }

  if (status === "running") {
    const cursor = parseCursor(state.cursorLegacy);
    const stats = asStats(state.stats);

    if (cursor.phase === "done") {
      await prisma.docsMigrationState.update({
        where: { tenantId },
        data: { status: "verifying", stats },
      });
      return { status: "verifying", advanced: true };
    }

    stats.batches++;
    const result =
      cursor.phase === "persona"
        ? await backfillPersonaBatch(tenantId, cursor, stats)
        : await backfillOperacionalBatch(tenantId, cursor, stats);

    await prisma.docsMigrationState.update({
      where: { tenantId },
      data: {
        cursorLegacy: result.nextCursor,
        stats,
        status: result.done ? "verifying" : "running",
      },
    });
    return {
      status: result.done ? "verifying" : "running",
      advanced: true,
    };
  }

  // verifying
  const report = await verifyParity(tenantId);
  if (report.ok) {
    await prisma.docsMigrationState.update({
      where: { tenantId },
      data: {
        status: "completed",
        completedAt: new Date(),
        parityReport: report as unknown as Prisma.InputJsonValue,
        failureReason: null,
      },
    });
    clearReadsUnifiedCache(tenantId);
    return { status: "completed", advanced: true };
  }

  await prisma.docsMigrationState.update({
    where: { tenantId },
    data: {
      status: "failed",
      parityReport: report as unknown as Prisma.InputJsonValue,
      failureReason: report.mismatches
        .map((m) => `${m.kind}: ${m.detail}`)
        .slice(0, 20)
        .join("; "),
    },
  });
  return { status: "failed", advanced: true };
}

/** Procesa un lote por cada tenant activo (o todos con estado). */
export async function runMigrationCron(): Promise<{
  tenants: number;
  results: Array<{ tenantId: string; status: MigrationStatus }>;
}> {
  const tenants = await prisma.tenant.findMany({
    where: { active: true },
    select: { id: true },
  });
  const results: Array<{ tenantId: string; status: MigrationStatus }> = [];
  for (const t of tenants) {
    const r = await runMigrationTick(t.id);
    results.push({ tenantId: t.id, status: r.status });
  }
  return { tenants: tenants.length, results };
}
