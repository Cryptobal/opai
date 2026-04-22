"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  calcCellStatus,
  calcCompliancePercent,
  type CellStatus,
} from "@/lib/doc-verificacion-helpers";
import { GrillaCelda } from "./GrillaCelda";
import { DocVerificacionDrawer } from "./DocVerificacionDrawer";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

// ---------------------------------------------------------------------------
// API response types
// ---------------------------------------------------------------------------

type TipoDoc = {
  id: string;
  codigo: string;
  nombre: string;
  capa: string;
  tieneVencimiento: boolean;
  diasAlerta: number;
  obligatorioEnVisita: boolean;
  obligatorio: boolean;
};

type ApiHallazgo = {
  id: string;
  severity: string;
  status: string;
  ticketCode: string | null;
  ticketId: string | null;
  description?: string;
};

type ApiCell = {
  tipoDocId: string;
  digitalStatus: string | null;
  docId: string | null;
  fileName: string | null;
  fisicaPresente: boolean | null;
  ultimaVerificacion: string | null;
  supervisorName: string | null;
  hallazgosAbiertos?: number;
  hallazgos?: ApiHallazgo[];
};

type ApiRow = {
  installationId: string;
  installationName: string;
  lastVisit: string | null;
  cells: ApiCell[];
};

type GrillaData = {
  tipos: TipoDoc[];
  rows: ApiRow[];
};

// ---------------------------------------------------------------------------
// Computed row type (includes compliance %)
// ---------------------------------------------------------------------------

type ComputedRow = ApiRow & {
  cellStatuses: CellStatus[];
  compliancePercent: number;
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

type FiltroValue = "obligatorio_visita" | "todos";

const CAPA_LABEL: Record<string, string> = {
  global: "Global",
  instalacion: "Instalación",
};

function formatDate(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("es-CL", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

function complianceColor(pct: number): string {
  if (pct >= 80) return "text-green-500";
  if (pct >= 50) return "text-amber-500";
  return "text-red-500";
}

function complianceBg(pct: number): string {
  if (pct >= 80) return "bg-green-500/10";
  if (pct >= 50) return "bg-amber-500/10";
  return "bg-red-500/10";
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function GrillaDocsInstalacion() {
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [filtro, setFiltro] = useState<FiltroValue>("obligatorio_visita");
  const [data, setData] = useState<GrillaData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Drawer state
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [drawerProps, setDrawerProps] = useState<{
    installationId: string;
    installationName: string;
    tipo: TipoDoc;
    cell: ApiCell;
  } | null>(null);

  // Debounce search 300ms
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const handleSearchChange = (val: string) => {
    setSearch(val);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => setDebouncedSearch(val), 300);
  };

  // Fetch data
  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({ filtro });
      if (debouncedSearch) params.set("search", debouncedSearch);
      const res = await fetch(
        `/api/operacional/grilla-docs?${params.toString()}`
      );
      const json = await res.json();
      if (json.success) {
        setData(json.data as GrillaData);
      } else {
        setError(json.error ?? "Error al cargar la grilla");
      }
    } catch {
      setError("Error de conexión");
    } finally {
      setLoading(false);
    }
  }, [filtro, debouncedSearch]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // Build computed rows (attach cellStatuses + compliancePercent, sort worst first)
  const computedRows: ComputedRow[] = (() => {
    if (!data) return [];
    return data.rows
      .map((row) => {
        const cellStatuses = row.cells.map((c) =>
          calcCellStatus(c.digitalStatus ?? "sin_documento", c.fisicaPresente)
        );
        const compliancePercent = calcCompliancePercent(cellStatuses);
        return { ...row, cellStatuses, compliancePercent };
      })
      .sort((a, b) => a.compliancePercent - b.compliancePercent);
  })();

  const tipos = data?.tipos ?? [];

  // Cell click handler
  const handleCellClick = (row: ApiRow, tipo: TipoDoc, cell: ApiCell) => {
    setDrawerProps({
      installationId: row.installationId,
      installationName: row.installationName,
      tipo,
      cell,
    });
    setDrawerOpen(true);
  };

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------

  return (
    <div className="flex flex-col gap-4">
      {/* ── Toolbar ── */}
      <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-center justify-between">
        {/* Search */}
        <Input
          placeholder="Buscar instalación…"
          value={search}
          onChange={(e) => handleSearchChange(e.target.value)}
          className="w-full sm:w-72"
        />

        {/* Filter pills */}
        <div className="flex gap-2 shrink-0">
          <button
            type="button"
            onClick={() => setFiltro("obligatorio_visita")}
            className={cn(
              "inline-flex items-center rounded-full px-3 py-1.5 text-xs font-medium transition-colors",
              filtro === "obligatorio_visita"
                ? "bg-primary text-primary-foreground"
                : "bg-muted text-muted-foreground hover:bg-muted/80"
            )}
          >
            Obligatorio en visita
          </button>
          <button
            type="button"
            onClick={() => setFiltro("todos")}
            className={cn(
              "inline-flex items-center rounded-full px-3 py-1.5 text-xs font-medium transition-colors",
              filtro === "todos"
                ? "bg-primary text-primary-foreground"
                : "bg-muted text-muted-foreground hover:bg-muted/80"
            )}
          >
            Todos
          </button>
        </div>
      </div>

      {/* ── Legend ── */}
      <div className="flex flex-wrap items-center gap-4 text-xs text-muted-foreground">
        <span className="font-medium">Estado:</span>
        <span className="flex items-center gap-1">
          <span className="inline-block w-3 h-3 rounded-sm bg-green-500/40" />
          OK
        </span>
        <span className="flex items-center gap-1">
          <span className="inline-block w-3 h-3 rounded-sm bg-amber-500/40" />
          Alerta / por vencer
        </span>
        <span className="flex items-center gap-1">
          <span className="inline-block w-3 h-3 rounded-sm bg-red-500/40" />
          Falta / vencido
        </span>
        <span className="ml-auto flex items-center gap-2">
          <span className="inline-flex items-center gap-1">
            <span className="font-medium">📄</span> Digital
          </span>
          <span className="inline-flex items-center gap-1">
            <span className="font-medium">👁</span> Físico
          </span>
        </span>
      </div>

      {/* ── Table ── */}
      {loading && (
        <div className="flex items-center justify-center h-48 text-sm text-muted-foreground">
          Cargando…
        </div>
      )}

      {!loading && error && (
        <div className="flex items-center justify-center h-48 text-sm text-red-500">
          {error}
        </div>
      )}

      {!loading && !error && computedRows.length === 0 && (
        <div className="flex items-center justify-center h-48 text-sm text-muted-foreground">
          No se encontraron instalaciones
        </div>
      )}

      {!loading && !error && computedRows.length > 0 && (
        <div className="overflow-x-auto rounded-lg border border-border">
          <table
            className="text-sm border-collapse"
            style={{
              minWidth: `${Math.max(640, 260 + tipos.length * 100)}px`,
            }}
          >
            {/* ── Column headers ── */}
            <thead>
              <tr className="bg-muted/50">
                {/* Sticky first column header */}
                <th
                  className="sticky left-0 z-10 bg-muted/50 text-left px-3 py-2.5 font-medium text-muted-foreground border-b border-border whitespace-nowrap"
                  style={{ minWidth: 220 }}
                >
                  Instalación
                </th>
                {/* Doc type columns */}
                {tipos.map((tipo) => (
                  <th
                    key={tipo.id}
                    className="px-2 py-2.5 text-center font-medium text-muted-foreground border-b border-border"
                    style={{ minWidth: 110 }}
                    title={tipo.nombre}
                  >
                    <div className="flex flex-col items-center gap-0.5">
                      <span
                        className="text-[11px] leading-snug max-w-[100px] text-center line-clamp-2 break-words"
                        title={tipo.nombre}
                      >
                        {tipo.nombre}
                      </span>
                      <span className="text-[10px] text-muted-foreground/60 font-normal">
                        {CAPA_LABEL[tipo.capa] ?? tipo.capa}
                      </span>
                    </div>
                  </th>
                ))}
                {/* Compliance header */}
                <th
                  className="px-3 py-2.5 text-center font-medium text-muted-foreground border-b border-border whitespace-nowrap"
                  style={{ minWidth: 70 }}
                >
                  %
                </th>
              </tr>
            </thead>

            {/* ── Rows ── */}
            <tbody>
              {computedRows.map((row, rowIdx) => (
                <tr
                  key={row.installationId}
                  className={cn(
                    "border-b border-border/60 last:border-0",
                    rowIdx % 2 === 0 ? "bg-background" : "bg-muted/20"
                  )}
                >
                  {/* Sticky first column: installation name + last visit */}
                  <td
                    className={cn(
                      "sticky left-0 z-10 px-3 py-2 border-r border-border/40",
                      rowIdx % 2 === 0 ? "bg-background" : "bg-muted/20"
                    )}
                  >
                    <div className="flex flex-col gap-0.5">
                      <span className="font-medium text-sm leading-tight">
                        {row.installationName}
                      </span>
                      <span className="text-[11px] text-muted-foreground">
                        Última visita: {formatDate(row.lastVisit)}
                      </span>
                    </div>
                  </td>

                  {/* Cells */}
                  {row.cells.map((cell, colIdx) => {
                    const tipo = tipos[colIdx];
                    const status = row.cellStatuses[colIdx];
                    return (
                      <td
                        key={`${row.installationId}-${cell.tipoDocId}`}
                        className="px-1 py-1 text-center"
                      >
                        {tipo && status && (
                          <GrillaCelda
                            status={status}
                            compact
                            hallazgosAbiertos={cell.hallazgosAbiertos ?? 0}
                            hallazgosSeverity={cell.hallazgos?.[0]?.severity ?? null}
                            hallazgoTicketCode={cell.hallazgos?.[0]?.ticketCode ?? null}
                            onClick={() =>
                              handleCellClick(row, tipo, cell)
                            }
                          />
                        )}
                      </td>
                    );
                  })}

                  {/* Compliance % */}
                  <td className="px-3 py-2 text-center">
                    <span
                      className={cn(
                        "inline-flex items-center justify-center rounded-full px-2 py-0.5 text-xs font-semibold tabular-nums",
                        complianceBg(row.compliancePercent),
                        complianceColor(row.compliancePercent)
                      )}
                    >
                      {row.compliancePercent}%
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* ── Drawer ── */}
      {drawerProps && (
        <DocVerificacionDrawer
          open={drawerOpen}
          onClose={() => setDrawerOpen(false)}
          docName={drawerProps.tipo.nombre}
          capa={drawerProps.tipo.capa}
          installationName={drawerProps.installationName}
          installationId={drawerProps.installationId}
          digitalStatus={drawerProps.cell.digitalStatus ?? "sin_documento"}
          obligatorioEnVisita={drawerProps.tipo.obligatorioEnVisita}
          tipoDocId={drawerProps.tipo.id}
        />
      )}
    </div>
  );
}
