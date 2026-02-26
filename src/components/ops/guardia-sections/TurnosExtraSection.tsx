"use client";

import { useEffect, useState } from "react";
import { DataTable, type DataTableColumn } from "@/components/opai/DataTable";

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

const columns: DataTableColumn[] = [
  {
    key: "date",
    label: "Fecha",
    render: (value: string) => formatDateUTC(value),
  },
  {
    key: "installationName",
    label: "Instalación",
    render: (value: string) => value || "—",
  },
  {
    key: "puestoName",
    label: "Puesto",
    render: (value: string) => value || "—",
  },
  {
    key: "amountClp",
    label: "Monto",
    className: "text-right",
    render: (value: number) => `$${value.toLocaleString("es-CL")}`,
  },
  {
    key: "status",
    label: "Estado",
    render: (value: string) => STATUS_LABELS[value] || value,
  },
  {
    key: "paidAt",
    label: "Fecha de pago",
    render: (value: string | null) => (value ? formatDateUTC(value) : "—"),
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
        columns={columns}
        data={turnosExtra}
        loading={turnosExtraLoading}
        compact
        emptyMessage="Sin turnos extra registrados."
      />
    </div>
  );
}
