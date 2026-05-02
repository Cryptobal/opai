"use client";

import { useEffect, useRef, useState } from "react";
import { Download, FileSpreadsheet, FileText } from "lucide-react";
import {
  exportToCsv,
  exportToXlsx,
  toFilenameSlug,
} from "@/lib/portal/export";

export interface ExportColumn {
  key: string;
  label: string;
  width?: number;
}

interface Props {
  /** Nombre visible del dataset (ej. "Marcaciones · Central"). Usado en el archivo. */
  baseName: string;
  /** Filas ya filtradas tal como están en pantalla. */
  rows: Record<string, unknown>[];
  columns: ExportColumn[];
  /** Hoja única para XLSX. */
  sheetName?: string;
  disabled?: boolean;
}

export function ExportButton({
  baseName,
  rows,
  columns,
  sheetName,
  disabled,
}: Props) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, [open]);

  const safe = toFilenameSlug(baseName);
  const noRows = rows.length === 0;

  async function handle(format: "csv" | "xlsx") {
    if (noRows) return;
    setBusy(true);
    try {
      if (format === "csv") {
        await exportToCsv(safe, rows, columns);
      } else {
        await exportToXlsx(safe, [
          { name: sheetName ?? "Datos", columns, rows },
        ]);
      }
      setOpen(false);
    } catch (err) {
      console.error("[ExportButton] export error:", err);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        disabled={disabled || busy || noRows}
        onClick={() => setOpen((v) => !v)}
        className="inline-flex items-center gap-1.5 rounded-lg border border-white/10 bg-white/[0.03] px-3 py-1.5 text-xs font-medium hover:bg-white/[0.06] disabled:opacity-50 disabled:cursor-not-allowed"
      >
        <Download className="h-3.5 w-3.5" />
        Exportar
      </button>
      {open && (
        <div className="absolute right-0 mt-1 min-w-[160px] rounded-lg border border-zinc-700 bg-zinc-900 shadow-xl z-20">
          <button
            type="button"
            onClick={() => handle("csv")}
            className="w-full flex items-center gap-2 px-3 py-2 text-xs hover:bg-white/[0.05] text-left"
          >
            <FileText className="h-3.5 w-3.5 text-zinc-400" />
            CSV
          </button>
          <button
            type="button"
            onClick={() => handle("xlsx")}
            className="w-full flex items-center gap-2 px-3 py-2 text-xs hover:bg-white/[0.05] text-left"
          >
            <FileSpreadsheet className="h-3.5 w-3.5 text-status-ok-fg" />
            Excel
          </button>
        </div>
      )}
    </div>
  );
}
