"use client";

import { DataTable, EmptyState } from "@/components/opai-ds";
import type { DataTableColumn } from "@/components/opai-ds";
import { Inbox } from "lucide-react";

/**
 * Forma serializada de un audit log (Date → string ISO al cruzar
 * la frontera Server → Client).
 */
export interface AuditLogRow {
  id: string;
  createdAt: string;
  userEmail: string | null;
  action: string;
  entity: string;
  entityId: string | null;
  ipAddress: string | null;
}

interface AuditLogsTableProps {
  logs: AuditLogRow[];
}

const COLUMNS: DataTableColumn<AuditLogRow>[] = [
  {
    id: "createdAt",
    header: "Fecha",
    cell: (row) => (
      <span className="whitespace-nowrap">
        {new Date(row.createdAt).toLocaleString("es-CL")}
      </span>
    ),
  },
  {
    id: "userEmail",
    header: "Usuario",
    cell: (row) => row.userEmail || "—",
  },
  {
    id: "action",
    header: "Acción",
    cell: (row) => row.action,
  },
  {
    id: "entity",
    header: "Entidad",
    cell: (row) => row.entity,
  },
  {
    id: "entityId",
    header: "ID ficha",
    cell: (row) => row.entityId || "—",
    hideOnMobile: true,
  },
  {
    id: "ipAddress",
    header: "IP",
    cell: (row) => row.ipAddress || "—",
    hideOnMobile: true,
  },
];

export function AuditLogsTable({ logs }: AuditLogsTableProps) {
  return (
    <DataTable
      columns={COLUMNS}
      rows={logs}
      rowKey={(r) => r.id}
      empty={
        <EmptyState
          icon={Inbox}
          title="Sin registros"
          description="No hay registros de auditoría para los filtros seleccionados."
          compact
        />
      }
    />
  );
}
