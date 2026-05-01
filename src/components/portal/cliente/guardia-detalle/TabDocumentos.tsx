"use client";

import { Eye, FileText } from "lucide-react";
import type { Documento } from "./types";

interface Props {
  documentos: Documento[];
}

const LABELS: Record<Documento["estado"], string> = {
  vigente: "Vigente",
  por_vencer: "Por vencer",
  vencido: "Vencido",
  pendiente: "Pendiente",
  no_aplica: "—",
};

const TONES: Record<Documento["estado"], string> = {
  vigente: "text-status-ok-fg bg-emerald-400/10 border-emerald-400/20",
  por_vencer: "text-status-warn-fg bg-amber-400/10 border-amber-400/20",
  vencido: "text-status-danger-fg bg-red-400/10 border-red-400/20",
  pendiente: "text-zinc-400 bg-white/[0.03] border-white/[0.06]",
  no_aplica: "text-zinc-500 bg-white/[0.03] border-white/[0.06]",
};

export function TabDocumentos({ documentos }: Props) {
  if (documentos.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-12 gap-2 text-zinc-500">
        <FileText className="h-8 w-8" />
        <p className="text-sm">Sin documentos registrados.</p>
      </div>
    );
  }
  return (
    <div className="space-y-1.5">
      {documentos.map((d, i) => (
        <div
          key={i}
          className="flex items-center gap-3 rounded-lg bg-white/[0.02] px-3 py-2.5"
        >
          <FileText className="h-4 w-4 text-zinc-500 flex-shrink-0" />
          <div className="flex-1 min-w-0">
            <p className="text-sm truncate">{d.tipo}</p>
            {d.expiresAt && (
              <p className="text-[11px] text-zinc-500">
                Vence {new Date(d.expiresAt).toLocaleDateString("es-CL")}
              </p>
            )}
          </div>
          <span
            className={`text-[10px] font-medium rounded-full px-2 py-0.5 border ${TONES[d.estado]}`}
          >
            {LABELS[d.estado]}
          </span>
          {d.fileUrl && (
            <a
              href={d.fileUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="p-1 rounded hover:bg-white/10 transition-colors"
            >
              <Eye className="h-3.5 w-3.5 text-zinc-400" />
            </a>
          )}
        </div>
      ))}
    </div>
  );
}
