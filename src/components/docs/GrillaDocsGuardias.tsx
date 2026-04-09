"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { ChevronRight, ChevronDown, Loader2, Search } from "lucide-react";
import { cn } from "@/lib/utils";
import { GrillaCelda } from "./GrillaCelda";
import { DocVerificacionDrawer } from "./DocVerificacionDrawer";
import { calcCellStatus, calcCompliancePercent } from "@/lib/doc-verificacion-helpers";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type DocType = {
  code: string;
  hasExpiration: boolean;
  alertDaysBefore?: number;
  obligatorioEnVisita?: boolean;
};

type GuardiaCell = {
  code: string;
  digitalStatus: string | null;
  docId: string | null;
  fileName: string | null;
  fisicaPresente: boolean | null;
  ultimaVerificacion: string | null;
  supervisorName: string | null;
};

type Guardia = {
  guardiaId: string;
  guardiaName: string;
  guardiaRut: string | null;
  cells: GuardiaCell[];
};

type InstallationRow = {
  installationId: string;
  installationName: string;
  lastVisit: string | null;
  guardiasCount: number;
  guardias: Guardia[];
};

type GrillaData = {
  docTypes: DocType[];
  rows: InstallationRow[];
};

type DrawerState = {
  open: boolean;
  docName: string;
  installationId: string;
  installationName: string;
  guardiaId: string;
  guardiaName: string;
  guardiaRut: string | null;
  guardiaDocType: string;
  digitalStatus: string;
  obligatorioEnVisita: boolean;
};

type Filtro = "obligatorio_visita" | "obligatorio" | "todos";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const DOC_LABELS: Record<string, string> = {
  certificado_os10: "Cert. OS10",
  credencial_os10: "Credencial OS10",
  contrato: "Contrato",
  contrato_firmado: "Contrato Firmado",
  certificado_antecedentes: "Cert. Antec.",
  examen_psicologico: "Examen Psic.",
  examen_medico: "Examen Médico",
  licencia_conducir: "Licencia",
  seguro_cesantia: "Seg. Cesantía",
  afiliacion_salud: "Afil. Salud",
  afiliacion_afp: "Afil. AFP",
  certificado_curso: "Cert. Curso",
  ficha_inscripcion: "Ficha Insc.",
  hoja_vida: "Hoja de Vida",
};

const FILTRO_LABELS: Record<Filtro, string> = {
  obligatorio_visita: "Oblig. en visita",
  obligatorio: "Solo obligatorios",
  todos: "Todos",
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function getInitials(name: string): string {
  return name
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? "")
    .join("");
}

function complianceColor(pct: number): string {
  if (pct >= 80) return "bg-green-500/20 text-green-400 ring-green-500/30";
  if (pct >= 50) return "bg-amber-500/20 text-amber-400 ring-amber-500/30";
  return "bg-red-500/20 text-red-400 ring-red-500/30";
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("es-CL", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function GrillaDocsGuardias() {
  const [data, setData] = useState<GrillaData | null>(null);
  const [loading, setLoading] = useState(true);
  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");
  const [filtro, setFiltro] = useState<Filtro>("obligatorio_visita");
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());
  const [drawer, setDrawer] = useState<DrawerState>({
    open: false,
    docName: "",
    installationId: "",
    installationName: "",
    guardiaId: "",
    guardiaName: "",
    guardiaRut: null,
    guardiaDocType: "",
    digitalStatus: "sin_documento",
    obligatorioEnVisita: false,
  });

  const debounceRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  const fetchData = useCallback(async (f: Filtro, s: string) => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ filtro: f });
      if (s) params.set("search", s);
      const res = await fetch(`/api/operacional/grilla-guardias?${params.toString()}`);
      const json = await res.json();
      if (res.ok && json.success) {
        setData(json.data);
      }
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchData(filtro, search);
  }, [filtro, search, fetchData]);

  function handleSearchChange(e: React.ChangeEvent<HTMLInputElement>) {
    const val = e.target.value;
    setSearchInput(val);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      setSearch(val.trim());
    }, 300);
  }

  function toggleInstallation(id: string) {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }

  function openDrawer(
    row: InstallationRow,
    guardia: Guardia,
    cell: GuardiaCell,
    docType: DocType,
  ) {
    setDrawer({
      open: true,
      docName: DOC_LABELS[cell.code] ?? cell.code,
      installationId: row.installationId,
      installationName: row.installationName,
      guardiaId: guardia.guardiaId,
      guardiaName: guardia.guardiaName,
      guardiaRut: guardia.guardiaRut,
      guardiaDocType: cell.code,
      digitalStatus: cell.digitalStatus ?? "sin_documento",
      obligatorioEnVisita: docType.obligatorioEnVisita ?? false,
    });
  }

  const docTypes = data?.docTypes ?? [];
  const rows = data?.rows ?? [];

  return (
    <div className="space-y-3">
      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-2">
        {/* Search */}
        <div className="relative flex-1 min-w-[200px] max-w-xs">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground pointer-events-none" />
          <input
            type="text"
            placeholder="Buscar instalación o guardia..."
            value={searchInput}
            onChange={handleSearchChange}
            className="w-full h-8 pl-8 pr-3 rounded-md border bg-background text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
          />
        </div>

        {/* Filter pills */}
        <div className="flex items-center gap-1">
          {(["obligatorio_visita", "obligatorio", "todos"] as Filtro[]).map((f) => (
            <button
              key={f}
              type="button"
              onClick={() => setFiltro(f)}
              className={cn(
                "px-3 py-1 rounded-full text-xs font-medium transition-colors whitespace-nowrap",
                filtro === f
                  ? "bg-primary text-primary-foreground"
                  : "bg-muted text-muted-foreground hover:bg-accent"
              )}
            >
              {FILTRO_LABELS[f]}
            </button>
          ))}
        </div>
      </div>

      {/* Grid */}
      {loading && !data ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        </div>
      ) : rows.length === 0 ? (
        <div className="rounded-md border py-10 text-center text-sm text-muted-foreground">
          No hay instalaciones con guardias asignados.
        </div>
      ) : (
        <div className="relative overflow-x-auto rounded-md border">
          {loading && (
            <div className="absolute inset-0 z-10 flex items-center justify-center bg-background/60">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            </div>
          )}

          <table className="w-full border-collapse text-xs">
            <thead>
              <tr className="border-b bg-muted/50">
                {/* Guardia column */}
                <th className="sticky left-0 z-20 min-w-[200px] bg-muted/50 px-3 py-2 text-left font-medium">
                  Instalación / Guardia
                </th>
                <th className="min-w-[60px] px-2 py-2 text-center font-medium text-muted-foreground">
                  Cumpl.
                </th>
                {/* Doc type columns */}
                {docTypes.map((dt) => (
                  <th
                    key={dt.code}
                    className="min-w-[72px] px-1 py-2 text-center font-medium text-muted-foreground"
                    title={dt.code}
                  >
                    <span className="block truncate max-w-[70px] mx-auto">
                      {DOC_LABELS[dt.code] ?? dt.code}
                    </span>
                  </th>
                ))}
              </tr>
            </thead>

            <tbody>
              {rows.map((row) => {
                const isExpanded = expandedIds.has(row.installationId);

                return [
                  /* Installation row */
                  <tr
                    key={`inst-${row.installationId}`}
                    className="border-b bg-muted/20 hover:bg-muted/40 cursor-pointer transition-colors"
                    onClick={() => toggleInstallation(row.installationId)}
                  >
                    <td className="sticky left-0 z-10 bg-muted/20 px-3 py-2">
                      <div className="flex items-center gap-2">
                        {isExpanded ? (
                          <ChevronDown className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                        ) : (
                          <ChevronRight className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                        )}
                        <div className="min-w-0">
                          <span className="font-medium text-foreground line-clamp-1" title={row.installationName}>
                            {row.installationName}
                          </span>
                          <span className="text-[11px] text-muted-foreground ml-1">
                            · {row.guardiasCount} guardia{row.guardiasCount !== 1 ? "s" : ""}
                            {row.lastVisit && (
                              <span className="ml-1">· Última visita: {formatDate(row.lastVisit)}</span>
                            )}
                          </span>
                        </div>
                      </div>
                    </td>
                    {/* Empty cells for installation row */}
                    <td />
                    {docTypes.map((dt) => (
                      <td key={dt.code} />
                    ))}
                  </tr>,

                  /* Guard rows (only when expanded) */
                  ...(isExpanded
                    ? row.guardias.map((guardia) => {
                        const cellStatuses = guardia.cells.map((c) =>
                          calcCellStatus(c.digitalStatus ?? "sin_documento", c.fisicaPresente)
                        );
                        const pct = calcCompliancePercent(cellStatuses);
                        const initials = getInitials(guardia.guardiaName);

                        return (
                          <tr
                            key={`guardia-${guardia.guardiaId}`}
                            className="border-b hover:bg-accent/20 transition-colors"
                          >
                            {/* Guard info cell */}
                            <td className="sticky left-0 z-10 bg-background px-3 py-1.5">
                              <div className="flex items-center gap-2 pl-6">
                                {/* Avatar */}
                                <span
                                  className={cn(
                                    "inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-[10px] font-semibold ring-1",
                                    complianceColor(pct)
                                  )}
                                >
                                  {initials}
                                </span>
                                <div className="min-w-0">
                                  <span className="font-medium text-foreground line-clamp-1" title={guardia.guardiaName}>
                                    {guardia.guardiaName}
                                  </span>
                                  {guardia.guardiaRut && (
                                    <p className="text-[11px] text-muted-foreground">{guardia.guardiaRut}</p>
                                  )}
                                </div>
                              </div>
                            </td>

                            {/* Compliance % */}
                            <td className="px-2 py-1.5 text-center">
                              <span
                                className={cn(
                                  "inline-flex items-center justify-center rounded-full px-1.5 py-0.5 text-[11px] font-semibold ring-1",
                                  complianceColor(pct)
                                )}
                              >
                                {pct}%
                              </span>
                            </td>

                            {/* Document cells */}
                            {guardia.cells.map((cell, idx) => {
                              const cellStatus = cellStatuses[idx];
                              const docType = docTypes[idx];
                              return (
                                <td key={cell.code} className="px-0 py-0.5 text-center">
                                  {cellStatus && docType ? (
                                    <GrillaCelda
                                      status={cellStatus}
                                      compact
                                      onClick={() => openDrawer(row, guardia, cell, docType)}
                                    />
                                  ) : (
                                    <span className="text-muted-foreground/30">—</span>
                                  )}
                                </td>
                              );
                            })}
                          </tr>
                        );
                      })
                    : []),
                ];
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* DocVerificacionDrawer */}
      <DocVerificacionDrawer
        open={drawer.open}
        onClose={() => setDrawer((d) => ({ ...d, open: false }))}
        docName={drawer.docName}
        capa="guardia"
        installationName={drawer.installationName}
        installationId={drawer.installationId}
        guardiaId={drawer.guardiaId}
        guardiaName={drawer.guardiaName}
        guardiaRut={drawer.guardiaRut}
        guardiaDocType={drawer.guardiaDocType}
        digitalStatus={drawer.digitalStatus}
        obligatorioEnVisita={drawer.obligatorioEnVisita}
      />
    </div>
  );
}
