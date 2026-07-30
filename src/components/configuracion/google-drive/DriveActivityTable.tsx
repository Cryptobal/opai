"use client";

import { Tag } from "@/components/opai-ds";

export type DriveOutboxRow = {
  id: string;
  docType: string;
  fileName: string;
  targetPath: string;
  status: string;
  createdAt: string;
  lastError?: string | null;
};

const STATUS_VARIANT: Record<string, "ok" | "warn" | "danger" | "neutral"> = {
  SENT: "ok",
  PENDING: "warn",
  ERROR: "danger",
};

type Props = { rows: DriveOutboxRow[] };

export function DriveActivityTable({ rows }: Props) {
  if (rows.length === 0) {
    return (
      <p className="text-ds-body text-ds-text-3">
        Sin actividad reciente. Al enviar una factura o cotización aparecerá aquí.
      </p>
    );
  }

  return (
    <ul className="divide-y divide-ds-border-subtle rounded-xl border border-ds-border-subtle">
      {rows.map((row) => (
        <li key={row.id} className="flex flex-col gap-1 px-3 py-2.5 sm:flex-row sm:items-center sm:justify-between">
          <div className="min-w-0">
            <p className="truncate text-ds-body font-medium text-ds-text-1">{row.fileName}</p>
            <p className="truncate font-mono text-[12px] text-ds-text-4">{row.targetPath}</p>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <Tag variant={STATUS_VARIANT[row.status] ?? "neutral"} size="sm">
              {row.status}
            </Tag>
            <span className="text-[12px] text-ds-text-4">
              {new Date(row.createdAt).toLocaleString("es-CL")}
            </span>
          </div>
        </li>
      ))}
    </ul>
  );
}
