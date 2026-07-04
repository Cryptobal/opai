"use client";

import { useState } from "react";
import Link from "next/link";
import { DataTable, Tag, Surface, type DataTableColumn } from "@/components/opai-ds";
import { AiActionRow, entityPath, statusTagVariant } from "./types";

function formatDate(iso: string): string {
  return new Date(iso).toLocaleString("es-CL", { dateStyle: "short", timeStyle: "short" });
}

function ErrorCell({ message }: { message: string | null }) {
  const [open, setOpen] = useState(false);
  if (!message) return <span className="text-ds-text-4">—</span>;
  const short = message.length > 60 ? `${message.slice(0, 60)}…` : message;
  return (
    <div className="min-w-0">
      <span className="text-[13px] text-status-danger-fg">{short}</span>
      {message.length > 60 && (
        <button
          type="button"
          className="ml-1 text-[12px] text-ds-text-3 underline"
          onClick={() => setOpen((v) => !v)}
        >
          {open ? "menos" : "más"}
        </button>
      )}
      {open && <p className="mt-1 text-[12px] text-ds-text-2 whitespace-pre-wrap">{message}</p>}
    </div>
  );
}

const columns: DataTableColumn<AiActionRow>[] = [
  {
    id: "date",
    header: "Fecha",
    cell: (r) => <span className="text-[13px] text-ds-text-2">{formatDate(r.createdAt)}</span>,
  },
  {
    id: "tenant",
    header: "Tenant",
    cell: (r) => (
      <div className="min-w-0">
        <p className="truncate text-[13px] font-medium text-ds-text-1">{r.tenantName}</p>
        <p className="truncate text-[12px] text-ds-text-3">{r.tenantSlug}</p>
      </div>
    ),
  },
  {
    id: "user",
    header: "Usuario",
    hideOnMobile: true,
    cell: (r) => <span className="text-[13px] text-ds-text-2">{r.userName}</span>,
  },
  {
    id: "tool",
    header: "Tool",
    cell: (r) => <code className="text-[12px] text-ds-text-2">{r.toolName}</code>,
  },
  {
    id: "status",
    header: "Estado",
    cell: (r) => <Tag variant={statusTagVariant(r.status)} size="sm">{r.status}</Tag>,
  },
  {
    id: "duration",
    header: "ms",
    align: "right",
    hideOnMobile: true,
    cell: (r) => <span className="ds-num text-[13px] text-ds-text-2">{r.durationMs}</span>,
  },
  {
    id: "entity",
    header: "Entidad",
    cell: (r) => {
      const path = entityPath(r.resultEntityType, r.resultEntityId);
      if (!path) return <span className="text-ds-text-4">—</span>;
      return (
        <Link href={path} className="text-[13px] text-primary hover:underline">
          {r.resultEntityType?.replace("crm_", "") ?? "ver"} · {r.resultEntityId?.slice(0, 8)}…
        </Link>
      );
    },
  },
  {
    id: "error",
    header: "Error",
    hideOnMobile: true,
    cell: (r) => <ErrorCell message={r.errorMessage} />,
  },
];

type Props = { rows: AiActionRow[]; loading?: boolean };

export function AiActionsTable({ rows, loading }: Props) {
  return (
    <>
      <div className="hidden sm:block">
        <DataTable
          columns={columns}
          rows={rows}
          rowKey={(r) => r.id}
          loading={loading}
          empty={<span className="text-ds-text-3">Sin registros para los filtros actuales.</span>}
        />
      </div>
      <ul className="space-y-2 sm:hidden">
        {rows.map((r) => (
          <li key={r.id}>
            <Surface elevation={1} padding="sm" className="space-y-1">
              <div className="flex items-center justify-between gap-2">
                <span className="text-[12px] text-ds-text-3">{formatDate(r.createdAt)}</span>
                <Tag variant={statusTagVariant(r.status)} size="sm">{r.status}</Tag>
              </div>
              <p className="font-medium text-[13px] text-ds-text-1">{r.toolName}</p>
              <p className="text-[12px] text-ds-text-3">{r.tenantName} · {r.userName}</p>
              <p className="text-[12px] text-ds-text-3">{r.durationMs} ms</p>
              {r.errorMessage && <p className="text-[12px] text-status-danger-fg">{r.errorMessage.slice(0, 120)}</p>}
            </Surface>
          </li>
        ))}
      </ul>
    </>
  );
}
