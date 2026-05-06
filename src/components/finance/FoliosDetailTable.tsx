"use client";

/**
 * FoliosDetailTable
 *
 * Tabla detallada (desktop) + cards (mobile) del estado por tipo DTE:
 * rango CAF, consumidos, disponibles, % usado y vencimiento. Incluye
 * badges semánticos por nivel de uso (verde/amarillo/rojo) y por
 * proximidad de vencimiento.
 */

import Link from "next/link";
import { format } from "date-fns";
import { es } from "date-fns/locale";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  DataTable,
  EmptyState,
  type DataTableColumn,
} from "@/components/opai-ds";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  AlertTriangle,
  CalendarClock,
  ExternalLink,
  Hash,
  History,
  MoreHorizontal,
  Upload,
} from "lucide-react";
import { cn } from "@/lib/utils";

export interface FolioStatusRow {
  dteType: number;
  cafId: string | null;
  folioDesde: number | null;
  folioHasta: number | null;
  nextFolio: number;
  consumidos: number;
  disponibles: number;
  totalCAF: number;
  porcentajeUsado: number;
  lowStock: boolean;
  cafExpiraEn: string | null;
  ultimoFolio: number;
  totalEmitidos: number;
}

const DTE_TYPE_LABELS: Record<number, string> = {
  33: "Factura Electrónica",
  34: "Factura Exenta",
  39: "Boleta Electrónica",
  41: "Boleta Exenta",
  43: "Liquidación Factura",
  46: "Factura Compra",
  52: "Guía de Despacho",
  56: "Nota de Débito",
  61: "Nota de Crédito",
};

const SII_FOLIOS_URL = "https://palena.sii.cl/cvc_cgi/dte/of_solicita_folios";

function usageTone(pct: number): { className: string; tone: "ok" | "warn" | "danger" } {
  if (pct < 70) return {
    className: "bg-status-ok-soft text-status-ok-fg border-status-ok-border",
    tone: "ok",
  };
  if (pct < 90) return {
    className: "bg-status-warn-soft text-status-warn-fg border-status-warn-border",
    tone: "warn",
  };
  return {
    className: "bg-status-danger-soft text-status-danger-fg border-status-danger-border",
    tone: "danger",
  };
}

function diasRestantes(expiraEn: string | null): number | null {
  if (!expiraEn) return null;
  const now = new Date();
  const exp = new Date(expiraEn);
  const ms = exp.getTime() - now.getTime();
  return Math.ceil(ms / (1000 * 60 * 60 * 24));
}

function ExpiraBadge({ expiraEn }: { expiraEn: string | null }) {
  const dias = diasRestantes(expiraEn);
  if (dias === null) {
    return <span className="text-xs text-muted-foreground">—</span>;
  }
  if (dias <= 0) {
    return (
      <Badge
        variant="outline"
        className="text-[12px] bg-status-danger-soft text-status-danger-fg border-status-danger-border"
      >
        Vencido
      </Badge>
    );
  }
  if (dias <= 90) {
    const cls =
      dias <= 30
        ? "bg-status-danger-soft text-status-danger-fg border-status-danger-border"
        : "bg-status-warn-soft text-status-warn-fg border-status-warn-border";
    return (
      <Badge variant="outline" className={cn("text-[12px]", cls)}>
        Vence en {dias}d
      </Badge>
    );
  }
  return (
    <span className="text-xs text-muted-foreground">
      {expiraEn ? format(new Date(expiraEn), "dd MMM yyyy", { locale: es }) : "—"}
    </span>
  );
}

interface ActionsProps {
  row: FolioStatusRow;
  canManage: boolean;
  onUploadCaf?: (dteType: number) => void;
  onShowHistory?: (dteType: number) => void;
}

function FolioRowActions({ row, canManage, onUploadCaf, onShowHistory }: ActionsProps) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="sm" title="Acciones">
          <MoreHorizontal className="h-3.5 w-3.5" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        {onShowHistory && (
          <DropdownMenuItem onClick={() => onShowHistory(row.dteType)}>
            <History className="h-4 w-4 mr-2" />
            Ver historial
          </DropdownMenuItem>
        )}
        {canManage && onUploadCaf && (
          <DropdownMenuItem onClick={() => onUploadCaf(row.dteType)}>
            <Upload className="h-4 w-4 mr-2" />
            Subir nuevo CAF
          </DropdownMenuItem>
        )}
        <DropdownMenuItem asChild>
          <a href={SII_FOLIOS_URL} target="_blank" rel="noopener noreferrer">
            <ExternalLink className="h-4 w-4 mr-2" />
            Solicitar CAF al SII
          </a>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export function FoliosDetailTable({
  rows,
  canManage,
  onUploadCaf,
  onShowHistory,
}: {
  rows: FolioStatusRow[];
  canManage: boolean;
  onUploadCaf?: (dteType: number) => void;
  onShowHistory?: (dteType: number) => void;
}) {
  if (rows.length === 0) {
    return (
      <EmptyState
        icon={Hash}
        title="Sin datos de folios"
        description="No hay CAFs cargados ni emisiones registradas."
        action={
          <Link href={SII_FOLIOS_URL} target="_blank" rel="noopener noreferrer">
            <Button size="sm" variant="outline">
              <ExternalLink className="h-4 w-4 mr-1.5" />
              Solicitar CAF al SII
            </Button>
          </Link>
        }
      />
    );
  }

  return (
    <>
      {/* Desktop table */}
      <div className="hidden md:block">
        <DataTable<FolioStatusRow>
          columns={[
            {
              id: "dteType",
              header: "Tipo DTE",
              cell: (row) => (
                <div className="flex flex-col">
                  <span className="font-medium text-sm">
                    {DTE_TYPE_LABELS[row.dteType] ?? `Tipo ${row.dteType}`}
                  </span>
                  <span className="text-[12px] text-muted-foreground font-mono">
                    Tipo {row.dteType}
                  </span>
                </div>
              ),
            },
            {
              id: "rangoCAF",
              header: "Rango CAF",
              cell: (row) =>
                row.folioDesde !== null && row.folioHasta !== null ? (
                  <span className="font-mono text-xs">
                    {row.folioDesde.toLocaleString("es-CL")}
                    {" — "}
                    {row.folioHasta.toLocaleString("es-CL")}
                  </span>
                ) : (
                  <span className="text-xs text-muted-foreground italic">Sin CAF</span>
                ),
            },
            {
              id: "consumidos",
              header: "Consumidos",
              align: "right",
              cell: (row) => (
                <span className="font-mono text-xs">
                  {row.consumidos.toLocaleString("es-CL")}
                </span>
              ),
            },
            {
              id: "disponibles",
              header: "Disponibles",
              align: "right",
              cell: (row) => (
                <div className="flex items-center justify-end gap-1.5">
                  <span className="font-mono text-xs">
                    {row.disponibles.toLocaleString("es-CL")}
                  </span>
                  {row.lowStock && (
                    <AlertTriangle className="h-3.5 w-3.5 text-status-danger-fg" />
                  )}
                </div>
              ),
            },
            {
              id: "porcentaje",
              header: "% usado",
              align: "center",
              cell: (row) => {
                if (row.totalCAF === 0) {
                  return <span className="text-xs text-muted-foreground">—</span>;
                }
                const { className } = usageTone(row.porcentajeUsado);
                return (
                  <Badge variant="outline" className={cn("text-[12px]", className)}>
                    {row.porcentajeUsado}%
                  </Badge>
                );
              },
            },
            {
              id: "vence",
              header: "Vencimiento",
              cell: (row) => <ExpiraBadge expiraEn={row.cafExpiraEn} />,
            },
            {
              id: "_actions",
              header: "",
              cell: (row) => (
                <FolioRowActions
                  row={row}
                  canManage={canManage}
                  onUploadCaf={onUploadCaf}
                  onShowHistory={onShowHistory}
                />
              ),
            },
          ] satisfies DataTableColumn<FolioStatusRow>[]}
          rows={rows}
          rowKey={(row) => String(row.dteType)}
          empty={<EmptyState icon={Hash} title="Sin datos de folios" compact />}
        />
      </div>

      {/* Mobile cards */}
      <div className="md:hidden space-y-2">
        {rows.map((row) => {
          const { className: pctCls } = usageTone(row.porcentajeUsado);
          return (
            <Card key={row.dteType}>
              <CardContent className="p-4">
                <div className="flex items-start justify-between gap-2 mb-3">
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium">
                      {DTE_TYPE_LABELS[row.dteType] ?? `Tipo ${row.dteType}`}
                    </p>
                    <p className="text-[12px] text-muted-foreground font-mono">
                      Tipo {row.dteType}
                    </p>
                  </div>
                  <div className="flex items-center gap-1.5">
                    {row.lowStock && (
                      <Badge
                        variant="outline"
                        className="text-[12px] bg-status-danger-soft text-status-danger-fg border-status-danger-border"
                      >
                        Stock crítico
                      </Badge>
                    )}
                    <FolioRowActions
                      row={row}
                      canManage={canManage}
                      onUploadCaf={onUploadCaf}
                      onShowHistory={onShowHistory}
                    />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-2 text-xs">
                  <div>
                    <span className="text-muted-foreground">Disponibles</span>
                    <p className="font-mono text-sm">
                      {row.disponibles.toLocaleString("es-CL")}
                    </p>
                  </div>
                  <div>
                    <span className="text-muted-foreground">% usado</span>
                    <p>
                      {row.totalCAF > 0 ? (
                        <Badge
                          variant="outline"
                          className={cn("text-[12px]", pctCls)}
                        >
                          {row.porcentajeUsado}%
                        </Badge>
                      ) : (
                        <span className="text-xs text-muted-foreground">—</span>
                      )}
                    </p>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Rango CAF</span>
                    <p className="font-mono text-[12px]">
                      {row.folioDesde !== null && row.folioHasta !== null
                        ? `${row.folioDesde.toLocaleString("es-CL")}–${row.folioHasta.toLocaleString("es-CL")}`
                        : "Sin CAF"}
                    </p>
                  </div>
                  <div>
                    <span className="text-muted-foreground flex items-center gap-1">
                      <CalendarClock className="h-3 w-3" />
                      Vencimiento
                    </span>
                    <ExpiraBadge expiraEn={row.cafExpiraEn} />
                  </div>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>
    </>
  );
}
