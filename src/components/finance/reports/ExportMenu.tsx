"use client";

import { useState } from "react";
import { Download, FileSpreadsheet, FileText, Loader2 } from "lucide-react";
import { toast } from "sonner";

interface Props {
  endpoint: string;
  payload: unknown;
  filenameBase: string;
}

export function ExportMenu({ endpoint, payload, filenameBase }: Props) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState<"xlsx" | "pdf" | null>(null);

  const handle = async (format: "xlsx" | "pdf") => {
    setBusy(format);
    try {
      const res = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ format, request: payload }),
      });
      if (!res.ok) {
        const text = await res.text().catch(() => "");
        throw new Error(text || `Error ${res.status}`);
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${filenameBase}.${format}`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      toast.success(`${format.toUpperCase()} descargado`);
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Error al exportar";
      toast.error(msg);
    } finally {
      setBusy(null);
      setOpen(false);
    }
  };

  return (
    <div className="relative">
      <button
        onClick={() => setOpen(!open)}
        className="inline-flex items-center gap-1.5 px-3 h-9 rounded-lg text-[12.5px] font-medium border bg-ds-surface text-ds-text-2"
        style={{ borderColor: "var(--ds-border)" }}
      >
        <Download className="w-3.5 h-3.5" /> Exportar
      </button>
      {open && (
        <div
          className="absolute right-0 top-full mt-1 z-20 w-44 rounded-lg border overflow-hidden shadow-2xl"
          style={{ background: "var(--ds-surface-2)", borderColor: "var(--ds-border)" }}
        >
          <button
            onClick={() => handle("xlsx")}
            disabled={!!busy}
            className="w-full flex items-center gap-2.5 px-3 py-2.5 text-[12.5px] hover:bg-ds-surface text-ds-text-1 disabled:opacity-50"
          >
            {busy === "xlsx" ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
            ) : (
              <FileSpreadsheet className="w-3.5 h-3.5 text-emerald-500" />
            )}
            Excel (.xlsx)
          </button>
          <button
            onClick={() => handle("pdf")}
            disabled={!!busy}
            className="w-full flex items-center gap-2.5 px-3 py-2.5 text-[12.5px] hover:bg-ds-surface text-ds-text-1 disabled:opacity-50"
          >
            {busy === "pdf" ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
            ) : (
              <FileText className="w-3.5 h-3.5 text-rose-500" />
            )}
            PDF
          </button>
        </div>
      )}
    </div>
  );
}
