import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { resolvePagePerms, canView } from "@/lib/permissions-server";
import { prisma } from "@/lib/prisma";
import { PageHeader, DataTable, type DataTableColumn } from "@/components/opai";
import { PautasSubnav } from "@/components/ops";

/* ------------------------------------------------------------------ */
/*  Human-readable labels for OPS audit actions                        */
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

function formatAction(action: string): string {
  return ACTION_LABELS[action] ?? action;
}

function formatEntity(entity: string): string {
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
/*  Table columns                                                      */
/* ------------------------------------------------------------------ */

const COLUMNS: DataTableColumn[] = [
  {
    key: "createdAt",
    label: "Fecha",
    className: "whitespace-nowrap",
    render: (v) => new Date(v).toLocaleString("es-CL"),
  },
  {
    key: "userEmail",
    label: "Usuario",
    render: (v: string | null) => {
      if (!v) return "—";
      const name = v.split("@")[0];
      return name.charAt(0).toUpperCase() + name.slice(1);
    },
  },
  {
    key: "action",
    label: "Acción",
    render: (v: string) => formatAction(v),
  },
  {
    key: "entity",
    label: "Módulo",
    render: (v: string) => formatEntity(v),
  },
  {
    key: "entityId",
    label: "Instalación",
    render: (v: string | null) => v ? v.slice(0, 8) + "…" : "—",
    hideOnMobile: true,
  },
  {
    key: "details",
    label: "Detalle",
    className: "max-w-[200px] truncate",
    render: (v: unknown) => formatDetails(v),
    hideOnMobile: true,
  },
];

/* ------------------------------------------------------------------ */
/*  Page component                                                     */
/* ------------------------------------------------------------------ */

type AuditPautasPageProps = {
  searchParams?: Promise<{
    q?: string;
    action?: string;
  }>;
};

/** OPS actions that appear in this audit view */
const OPS_ACTION_PREFIX = ["ops.pauta.", "ops.refuerzo.", "ops.refuerzos."];

export default async function AuditPautasPage({ searchParams }: AuditPautasPageProps) {
  const session = await auth();
  if (!session?.user) {
    redirect("/opai/login?callbackUrl=/ops/audit-pautas");
  }

  const perms = await resolvePagePerms(session.user);
  // Any user with access to at least one pauta submodule can see the audit
  const hasAnyPauta =
    canView(perms, "ops", "pauta_mensual") ||
    canView(perms, "ops", "pauta_diaria") ||
    canView(perms, "ops", "turnos_extra") ||
    canView(perms, "ops", "ppc");
  if (!hasAnyPauta) {
    redirect("/hub");
  }

  const tenantId = session.user.tenantId;
  const params = (await searchParams) ?? {};
  const q = (params.q || "").trim();
  const actionFilter = (params.action || "").trim();

  const logs = await prisma.auditLog.findMany({
    where: {
      tenantId,
      AND: [
        // Only ops.pauta.* / ops.refuerzo.* actions
        {
          OR: OPS_ACTION_PREFIX.map((prefix) => ({
            action: { startsWith: prefix },
          })),
        },
        ...(actionFilter ? [{ action: actionFilter }] : []),
        ...(q
          ? [
              {
                OR: [
                  { userEmail: { contains: q, mode: "insensitive" as const } },
                  { entityId: { contains: q, mode: "insensitive" as const } },
                ],
              },
            ]
          : []),
      ],
    },
    orderBy: { createdAt: "desc" },
    take: 200,
    select: {
      id: true,
      createdAt: true,
      userEmail: true,
      action: true,
      entity: true,
      entityId: true,
      details: true,
    },
  });

  // Distinct actions for the filter dropdown (only ops.pauta.* and ops.refuerzo.*)
  const actions = await prisma.auditLog.findMany({
    where: {
      tenantId,
      OR: OPS_ACTION_PREFIX.map((prefix) => ({
        action: { startsWith: prefix },
      })),
    },
    distinct: ["action"],
    select: { action: true },
    orderBy: { action: "asc" },
    take: 50,
  });

  return (
    <div className="space-y-6 min-w-0">
      <PageHeader
        title="Auditoría Pautas"
        description="Historial de acciones en pauta mensual, refuerzos y exportaciones"
      />
      <PautasSubnav />

      {/* Filters */}
      <form method="GET" className="rounded-xl border border-border bg-card p-4">
        <div className="grid gap-3 md:grid-cols-3">
          <input
            name="q"
            defaultValue={q}
            placeholder="Buscar por usuario o instalación…"
            className="h-9 rounded-md border border-input bg-background px-3 text-sm"
          />
          <select
            name="action"
            defaultValue={actionFilter}
            className="h-9 rounded-md border border-input bg-background px-3 text-sm"
          >
            <option value="">Todas las acciones</option>
            {actions.map((item) => (
              <option key={item.action} value={item.action}>
                {formatAction(item.action)}
              </option>
            ))}
          </select>
          <button
            type="submit"
            className="h-9 rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground"
          >
            Filtrar
          </button>
        </div>
      </form>

      <DataTable
        columns={COLUMNS}
        data={logs}
        compact
        emptyMessage="No hay registros de auditoría para pautas aún."
      />
    </div>
  );
}
