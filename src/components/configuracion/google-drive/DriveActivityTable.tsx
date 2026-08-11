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

type Props = {
  rows: DriveOutboxRow[];
  inFlight?: number;
  errorCount?: number;
};

export function DriveActivityTable({
  rows,
  inFlight = 0,
  errorCount = 0,
}: Props) {
  return (
    <details className="rounded-xl border border-ds-border-subtle bg-ds-surface-1">
      <summary className="cursor-pointer list-none px-4 py-3 font-display text-[13px] font-semibold text-ds-text-1 marker:content-none [&::-webkit-details-marker]:hidden">
        Actividad
        <span className="ml-2 font-sans text-[12px] font-normal text-ds-text-4">
          · {inFlight} subiendo, {errorCount} con error
        </span>
      </summary>
      <div className="border-t border-ds-border-subtle px-3 py-3">
        {rows.length === 0 ? (
          <p className="text-[13px] text-ds-text-3">
            Sin actividad reciente. Al enviar una factura o cotización aparecerá aquí.
          </p>
        ) : (
          <ul className="divide-y divide-ds-border-subtle rounded-xl border border-ds-border-subtle">
            {rows.map((row) => (
              <li
                key={row.id}
                className="flex flex-col gap-1 px-3 py-2.5 sm:flex-row sm:items-center sm:justify-between"
              >
                <div className="min-w-0">
                  <p className="truncate text-[13px] font-medium text-ds-text-1">
                    {row.fileName}
                  </p>
                  <p className="truncate font-mono text-[12px] text-ds-text-4">
                    {row.targetPath}
                  </p>
                  {row.lastError && (
                    <p className="truncate text-[12px] text-status-danger-fg">
                      {row.lastError}
                    </p>
                  )}
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
        )}
      </div>
    </details>
  );
}
