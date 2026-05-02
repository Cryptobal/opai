"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowUpRight, Loader2, CalendarCheck } from "lucide-react";
import { DataTable, EmptyState, type DataTableColumn } from "@/components/opai-ds";

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

const buildColumns = (guardiaId: string): DataTableColumn<DiaTrabajadoRow>[] => [
  {
    id: "_link",
    header: "",
    width: "w-8",
    cell: (row) => (
      <Link
        href={`/ops/pauta-diaria?date=${row.date}&guardiaId=${guardiaId}`}
        className="inline-flex h-6 w-6 items-center justify-center rounded text-muted-foreground hover:text-primary hover:bg-muted/50 transition-colors"
        title="Ver en pauta diaria"
      >
        <ArrowUpRight className="h-3 w-3" />
      </Link>
    ),
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
    id: "slotNumber",
    header: "Slot",
    align: "center",
    cell: (row) => `S${row.slotNumber}`,
  },
  {
    id: "attendanceStatus",
    header: "Tipo",
    cell: (row) =>
      row.attendanceStatus === "asistio"
        ? "Asistió"
        : row.attendanceStatus === "reemplazo"
          ? "Reemplazo"
          : row.attendanceStatus,
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
      <p className="text-sm text-muted-foreground">
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
              <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-[0.08em] mb-2.5">Resumen por mes</p>
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
                        className="inline-flex items-center gap-1.5 rounded-xl border border-border/60 bg-card/40 px-3 py-1.5 text-sm transition-colors hover:bg-card/60 hover:border-border"
                      >
                        <span className="text-muted-foreground">{label}</span>
                        <span className="font-semibold text-foreground tabular-nums">{count}</span>
                        <span className="text-muted-foreground text-xs">días</span>
                      </div>
                    );
                  })}
              </div>
            </div>
          )}
          <DataTable
            columns={buildColumns(guardiaId)}
            rows={diasTrabajados}
            rowKey={(row) => row.id}
            empty={<EmptyState icon={CalendarCheck} title="Sin días trabajados registrados en el período." compact />}
          />
        </>
      )}
    </div>
  );
}
