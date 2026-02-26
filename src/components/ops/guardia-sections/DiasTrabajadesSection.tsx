"use client";

import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { DataTable, type DataTableColumn } from "@/components/opai/DataTable";

/** Format a date-only value using UTC to avoid timezone shift */
function formatDateUTC(value: string | Date): string {
  const d = typeof value === "string" ? new Date(value) : value;
  const day = String(d.getUTCDate()).padStart(2, "0");
  const month = String(d.getUTCMonth() + 1).padStart(2, "0");
  const year = d.getUTCFullYear();
  return `${day}-${month}-${year}`;
}

type DiaTrabajadoRow = {
  id: string;
  date: string;
  puestoId: string;
  slotNumber: number;
  attendanceStatus: string;
  installationName: string;
  puestoName: string;
  shiftStart: string;
  shiftEnd: string;
};

interface DiasTrabajadesSectionProps {
  guardiaId: string;
}

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
    key: "slotNumber",
    label: "Slot",
    className: "text-center",
    render: (value: number) => `S${value}`,
  },
  {
    key: "attendanceStatus",
    label: "Tipo",
    render: (value: string) =>
      value === "asistio" ? "Asistió" : value === "reemplazo" ? "Reemplazo" : value,
  },
];

export default function DiasTrabajadesSection({ guardiaId }: DiasTrabajadesSectionProps) {
  const [diasTrabajados, setDiasTrabajados] = useState<DiaTrabajadoRow[]>([]);
  const [diasTrabajadosSummary, setDiasTrabajadosSummary] = useState<Record<string, number>>({});
  const [diasTrabajadosLoading, setDiasTrabajadosLoading] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setDiasTrabajadosLoading(true);
    const to = new Date();
    const from = new Date(to);
    from.setFullYear(from.getFullYear() - 1);
    const fromStr = from.toISOString().slice(0, 10);
    const toStr = to.toISOString().slice(0, 10);
    fetch(`/api/personas/guardias/${guardiaId}/dias-trabajados?from=${fromStr}&to=${toStr}`)
      .then((res) => res.json())
      .then((payload: { success?: boolean; data?: { items: DiaTrabajadoRow[]; summaryByMonth: Record<string, number> } }) => {
        if (cancelled || !payload.success || !payload.data) return;
        setDiasTrabajados(payload.data.items ?? []);
        setDiasTrabajadosSummary(payload.data.summaryByMonth ?? {});
      })
      .catch(() => {
        if (!cancelled) {
          setDiasTrabajados([]);
          setDiasTrabajadosSummary({});
        }
      })
      .finally(() => {
        if (!cancelled) setDiasTrabajadosLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [guardiaId]);

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground -mt-1">
        Días en que este guardia asistió o cubrió como reemplazo (últimos 12 meses). Base para liquidación y portal del guardia.
      </p>
      {diasTrabajadosLoading ? (
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" />
          Cargando días trabajados…
        </div>
      ) : (
        <>
          {Object.keys(diasTrabajadosSummary).length > 0 && (
            <div>
              <p className="text-xs font-medium text-muted-foreground mb-2">Resumen por mes</p>
              <div className="flex flex-wrap gap-2">
                {Object.entries(diasTrabajadosSummary)
                  .sort(([a], [b]) => b.localeCompare(a))
                  .slice(0, 12)
                  .map(([monthKey, count]) => {
                    const [y, m] = monthKey.split("-");
                    const monthNames = ["Ene", "Feb", "Mar", "Abr", "May", "Jun", "Jul", "Ago", "Sep", "Oct", "Nov", "Dic"];
                    const label = `${monthNames[parseInt(m, 10) - 1]} ${y}`;
                    return (
                      <div
                        key={monthKey}
                        className="inline-flex items-center gap-1.5 rounded-md border border-border bg-muted/30 px-2.5 py-1.5 text-sm"
                      >
                        <span className="text-muted-foreground">{label}</span>
                        <span className="font-semibold text-foreground">{count}</span>
                        <span className="text-muted-foreground text-xs">días</span>
                      </div>
                    );
                  })}
              </div>
            </div>
          )}
          <DataTable
            columns={columns}
            data={diasTrabajados}
            compact
            emptyMessage="Sin días trabajados registrados en el período."
          />
        </>
      )}
    </div>
  );
}
