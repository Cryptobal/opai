"use client";

import { useEffect, useState } from "react";
import { Surface, Tag, Spinner } from "@/components/opai-ds";

type MigrationData = {
  status: string;
  stats: {
    personaMigrated?: number;
    operacionalMigrated?: number;
    skipped?: number;
    typesCreated?: string[];
    needsAttention?: number;
    batches?: number;
  } | null;
  parityReport: unknown;
  failureReason: string | null;
  needsAttention: number;
  startedAt: string | null;
  completedAt: string | null;
};

const STATUS_VARIANT: Record<string, "neutral" | "info" | "ok" | "warn" | "danger"> = {
  pending: "neutral",
  running: "info",
  verifying: "info",
  completed: "ok",
  failed: "danger",
};

export function DocsMigrationStatusCard() {
  const [data, setData] = useState<MigrationData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/admin/docs-migration-status")
      .then((r) => r.json())
      .then((res) => {
        if (res.success) setData(res.data);
      })
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <Surface elevation={1} padding="md" className="flex items-center gap-2">
        <Spinner size="sm" />
        <span className="text-[13px] text-ds-text-3">Cargando migración…</span>
      </Surface>
    );
  }
  if (!data) return null;

  const stats = data.stats;
  const typesCreated = stats?.typesCreated?.length ?? 0;

  return (
    <Surface elevation={1} padding="md" className="space-y-3">
      <div className="flex items-center justify-between gap-3">
        <h3 className="font-display text-[15px] font-semibold">Migración documental</h3>
        <Tag variant={STATUS_VARIANT[data.status] ?? "neutral"} size="sm">
          {data.status}
        </Tag>
      </div>
      <dl className="grid grid-cols-2 gap-2 text-[13px] sm:grid-cols-4">
        <div>
          <dt className="text-ds-text-3">Persona</dt>
          <dd className="font-medium tabular-nums">{stats?.personaMigrated ?? 0}</dd>
        </div>
        <div>
          <dt className="text-ds-text-3">Operacional</dt>
          <dd className="font-medium tabular-nums">{stats?.operacionalMigrated ?? 0}</dd>
        </div>
        <div>
          <dt className="text-ds-text-3">Tipos auto</dt>
          <dd className="font-medium tabular-nums">{typesCreated}</dd>
        </div>
        <div>
          <dt className="text-ds-text-3">Requiere atención</dt>
          <dd className="font-medium tabular-nums text-status-warn-fg">
            {data.needsAttention}
          </dd>
        </div>
      </dl>
      {data.status === "failed" && data.failureReason && (
        <p className="rounded-md border border-status-danger-border bg-status-danger-soft p-2 text-[13px] text-status-danger-fg">
          {data.failureReason}
        </p>
      )}
      {data.status === "completed" && (
        <p className="text-[13px] text-ds-text-3">
          Lectura unificada activa. Las tablas legadas se conservan intactas.
        </p>
      )}
    </Surface>
  );
}
