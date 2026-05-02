"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowUpRight, Clock } from "lucide-react";
import { DataTable, EmptyState, type DataTableColumn } from "@/components/opai-ds";

/** Format a date-only value using UTC to avoid timezone shift */
function formatDateUTC(value: string | Date): string {
  const d = typeof value === "string" ? new Date(value) : value;
  const day = String(d.getUTCDate()).padStart(2, "0");
  const month = String(d.getUTCMonth() + 1).padStart(2, "0");
  const year = d.getUTCFullYear();
  return `${day}-${month}-${year}`;
}

type TeRow = {
  id: string;
  date: string;
  installationName: string;
  puestoName: string;
  amountClp: number;
  status: string;
  paidAt: string | null;
};

interface TurnosExtraSectionProps {
  guardiaId: string;
}

const STATUS_LABELS: Record<string, string> = {
  pending: "Pendiente",
  approved: "Aprobado",
  paid: "Pagado",
  rejected: "Rechazado",
};

const buildColumns = (guardiaId: string): DataTableColumn<TeRow>[] => [
  {
    id: "_link",
    header: "",
    width: "w-8",
    cell: (row) => {
      const dateStr = typeof row.date === "string" ? row.date.slice(0, 10) : new Date(row.date).toISOString().slice(0, 10);
      return (
        <Link
          href={`/ops/pauta-diaria?date=${dateStr}&guardiaId=${guardiaId}`}
          className="inline-flex h-6 w-6 items-center justify-center rounded text-muted-foreground hover:text-primary hover:bg-muted/50 transition-colors"
          title="Ver en pauta diaria"
        >
          <ArrowUpRight className="h-3 w-3" />
        </Link>
      );
    },
  },
  {
    id: "date",
    header: "Fecha",
    cell: (row) => formatDateUTC(row.date),
  },
  {
    id: "installationName",
    header: "Instalación",
    cell: (row) => row.installationName || "—",
  },
  {
    id: "puestoName",
    header: "Puesto",
    cell: (row) => row.puestoName || "—",
  },
  {
    id: "amountClp",
    header: "Monto",
    align: "right",
    cell: (row) => `$${row.amountClp.toLocaleString("es-CL")}`,
  },
  {
    id: "status",
    header: "Estado",
    cell: (row) => STATUS_LABELS[row.status] || row.status,
  },
  {
    id: "paidAt",
    header: "Fecha de pago",
    cell: (row) => (row.paidAt ? formatDateUTC(row.paidAt) : "—"),
  },
];

export default function TurnosExtraSection({ guardiaId }: TurnosExtraSectionProps) {
  const [turnosExtra, setTurnosExtra] = useState<TeRow[]>([]);
  const [turnosExtraLoading, setTurnosExtraLoading] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setTurnosExtraLoading(true);
    fetch(`/api/te?guardiaId=${encodeURIComponent(guardiaId)}`)
      .then((res) => res.json())
      .then((payload: { success?: boolean; data?: Array<{
        id: string;
        date: string;
        status: string;
        amountClp: number | string;
        paidAt?: string | null;
        installation?: { name: string };
        puesto?: { name: string };
      }> }) => {
        if (cancelled || !payload.success || !Array.isArray(payload.data)) return;
        setTurnosExtra(
          payload.data.map((t) => ({
            id: t.id,
            date: t.date,
            installationName: t.installation?.name ?? "",
            puestoName: t.puesto?.name ?? "",
            amountClp: Number(t.amountClp),
            status: t.status,
            paidAt: t.paidAt ?? null,
          }))
        );
      })
      .catch(() => {
        if (!cancelled) setTurnosExtra([]);
      })
      .finally(() => {
        if (!cancelled) setTurnosExtraLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [guardiaId]);

  return (
    <div>
      <p className="text-sm text-muted-foreground mb-3">
        Historial de turnos extra (reemplazos y cubrimientos) de este guardia.
      </p>
      <DataTable
        columns={buildColumns(guardiaId)}
        rows={turnosExtra}
        rowKey={(row) => row.id}
        loading={turnosExtraLoading}
        empty={<EmptyState icon={Clock} title="Sin turnos extra registrados." compact />}
      />
    </div>
  );
}
