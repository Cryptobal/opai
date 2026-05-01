"use client";

import { GraduationCap, CheckCircle2, XCircle, Clock } from "lucide-react";
import type { ExamenProtocolo } from "./types";

interface Props {
  examenes: ExamenProtocolo[];
}

export function TabExamenes({ examenes }: Props) {
  if (examenes.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-12 gap-2 text-zinc-500">
        <GraduationCap className="h-8 w-8" />
        <p className="text-sm text-center px-6">
          Este guardia aún no ha rendido exámenes de protocolos en esta
          instalación.
        </p>
      </div>
    );
  }
  return (
    <div className="space-y-2">
      {examenes.map((e) => (
        <div
          key={e.id}
          className="rounded-lg bg-white/[0.02] border border-white/[0.04] p-3"
        >
          <div className="flex items-start gap-3">
            <Icono estado={e.estado} />
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium truncate">{e.examenTitulo}</p>
              <div className="flex items-center gap-2 text-[11px] text-zinc-500 mt-1">
                {e.completedAt && (
                  <span>
                    {new Date(e.completedAt).toLocaleDateString("es-CL")}
                  </span>
                )}
                <span>Intento #{e.attemptNumber}</span>
                {e.score != null && (
                  <span className="font-mono">
                    {Math.round(e.score)}/
                    {e.passingScore ?? 100}
                  </span>
                )}
              </div>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

function Icono({ estado }: { estado: ExamenProtocolo["estado"] }) {
  if (estado === "aprobado")
    return <CheckCircle2 className="h-5 w-5 text-status-ok-fg flex-shrink-0" />;
  if (estado === "reprobado")
    return <XCircle className="h-5 w-5 text-status-danger-fg flex-shrink-0" />;
  if (estado === "expirado")
    return <XCircle className="h-5 w-5 text-zinc-500 flex-shrink-0" />;
  return <Clock className="h-5 w-5 text-status-warn-fg flex-shrink-0" />;
}
