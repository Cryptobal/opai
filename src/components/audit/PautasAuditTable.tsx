"use client";

import { DataTable, EmptyState } from "@/components/opai-ds";
import type { DataTableColumn } from "@/components/opai-ds";
import { Inbox } from "lucide-react";

/* ------------------------------------------------------------------ */
/*  Human-readable labels for OPS audit actions                       */
/* ------------------------------------------------------------------ */

const ACTION_LABELS: Record<string, string> = {
  // Pauta mensual
  "ops.pauta.generated": "Generó pauta mensual",
  "ops.pauta.bulk_saved": "Guardó cambios en pauta",
  "ops.pauta.upsert": "Actualizó celda de pauta",
  "ops.pauta.serie_painted": "Pintó serie (fija)",
  "ops.pauta.serie_rotativa_painted": "Pintó serie (rotativa)",
  "ops.pauta.eliminar_dia": "Eliminó día de pauta",
  "ops.pauta.eliminar_serie": "Eliminó serie completa",
  "ops.pauta.auto_sync_created": "Auto-sync: creó filas faltantes",
  "ops.pauta.auto_sync_projected": "Auto-sync: proyectó series",
  "ops.pauta.export_pdf": "Exportó pauta PDF",
  "ops.pauta.export_excel": "Exportó pauta Excel",
  // Refuerzos
  "ops.refuerzo.created": "Creó refuerzo",
  "ops.refuerzo.updated": "Actualizó refuerzo",
  "ops.refuerzo.deleted": "Eliminó refuerzo",
  "ops.refuerzo.post_api": "Refuerzo vía API",
  "ops.refuerzos.export_csv": "Exportó refuerzos CSV",
};

const ENTITY_LABELS: Record<string, string> = {
  ops_pauta: "Pauta mensual",
  ops_refuerzo_solicitud: "Refuerzo",
};

export function formatAction(action: string): string {
  return ACTION_LABELS[action] ?? action;
}

export function formatEntity(entity: string): string {
  return ENTITY_LABELS[entity] ?? entity;
}

function formatDetails(details: unknown): string {
  if (!details || typeof details !== "object") return "—";
  const d = details as Record<string, unknown>;
  const parts: string[] = [];

  if (d.installationName) parts.push(`Inst: ${d.installationName}`);
  if (d.month && d.year) parts.push(`${d.month}/${d.year}`);
  if (d.rowCount != null) parts.push(`${d.rowCount} filas`);
  if (d.rowsCreated != null) parts.push(`${d.rowsCreated} creadas`);
  if (d.cellsProjected != null) parts.push(`${d.cellsProjected} celdas`);
  if (d.seriesCount != null) parts.push(`${d.seriesCount} series`);
  if (d.cellCount != null) parts.push(`${d.cellCount} celdas`);
  if (d.filters) {
    const f = d.filters as Record<string, unknown>;
    if (f.status) parts.push(`Estado: ${f.status}`);
    if (f.from || f.to) parts.push(`${f.from ?? ""}→${f.to ?? ""}`);
  }

  return parts.length > 0 ? parts.join(" · ") : "—";
}

/* ------------------------------------------------------------------ */
/*  Forma serializada                                                  */
/* ------------------------------------------------------------------ */

export interface PautasAuditLogRow {
  id: string;
  createdAt: string;
  userEmail: string | null;
  action: string;
  entity: string;
  entityId: string | null;
  details: unknown;
}

interface PautasAuditTableProps {
  logs: PautasAuditLogRow[];
}

const COLUMNS: DataTableColumn<PautasAuditLogRow>[] = [
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
    cell: (row) => {
      if (!row.userEmail) return "—";
      const name = row.userEmail.split("@")[0];
      return name.charAt(0).toUpperCase() + name.slice(1);
    },
  },
  {
    id: "action",
    header: "Acción",
    cell: (row) => formatAction(row.action),
  },
  {
    id: "entity",
    header: "Módulo",
    cell: (row) => formatEntity(row.entity),
  },
  {
    id: "entityId",
    header: "Instalación",
    cell: (row) => (row.entityId ? row.entityId.slice(0, 8) + "…" : "—"),
    hideOnMobile: true,
  },
  {
    id: "details",
    header: "Detalle",
    width: "max-w-[200px]",
    cell: (row) => (
      <span className="block truncate">{formatDetails(row.details)}</span>
    ),
    hideOnMobile: true,
  },
];

export function PautasAuditTable({ logs }: PautasAuditTableProps) {
  return (
    <DataTable
      columns={COLUMNS}
      rows={logs}
      rowKey={(r) => r.id}
      empty={
        <EmptyState
          icon={Inbox}
          title="Sin registros"
          description="No hay registros de auditoría para pautas aún."
          compact
        />
      }
    />
  );
}
