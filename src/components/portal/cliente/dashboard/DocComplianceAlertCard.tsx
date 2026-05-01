"use client";

import { useEffect, useState } from "react";
import { AlertTriangle, ChevronRight } from "lucide-react";

interface EquipoResumen {
  totalGuardias: number;
  os10Vigente: number;
  os10PorVencer: number;
  os10Vencido: number;
  docsPendientes: number;
  docsVencidos: number;
}

interface Props {
  onNavigate: (section: string) => void;
}

export function DocComplianceAlertCard({ onNavigate }: Props) {
  const [resumen, setResumen] = useState<EquipoResumen | null>(null);

  useEffect(() => {
    let active = true;
    fetch("/api/portal/cliente/equipo")
      .then((r) => r.json())
      .then((res) => {
        if (!active) return;
        if (res.success) setResumen(res.data.resumen);
      })
      .catch((err) =>
        console.error("[DocComplianceAlertCard] fetch error:", err),
      );
    return () => {
      active = false;
    };
  }, []);

  if (!resumen) return null;
  const { os10Vencido, os10PorVencer, docsVencidos, docsPendientes } = resumen;
  const hasAny =
    os10Vencido > 0 || os10PorVencer > 0 || docsVencidos > 0 || docsPendientes > 0;
  if (!hasAny) return null;

  const isCritical = os10Vencido > 0 || docsVencidos > 0;
  const toneClasses = isCritical
    ? "border-status-danger-border bg-status-danger-soft/30"
    : "border-status-warn-border bg-status-warn-soft/30";
  const iconTone = isCritical ? "text-status-danger-fg" : "text-status-warn-fg";
  const titleTone = isCritical ? "text-status-danger-fg" : "text-status-warn-fg";

  const items: string[] = [];
  if (os10Vencido > 0)
    items.push(
      `${os10Vencido} guardia${os10Vencido > 1 ? "s" : ""} con OS-10 vencido`,
    );
  if (os10PorVencer > 0)
    items.push(
      `${os10PorVencer} guardia${os10PorVencer > 1 ? "s" : ""} con OS-10 por vencer`,
    );
  if (docsVencidos > 0)
    items.push(
      `${docsVencidos} documento${docsVencidos > 1 ? "s" : ""} vencido${docsVencidos > 1 ? "s" : ""}`,
    );
  if (docsPendientes > 0)
    items.push(
      `${docsPendientes} documento${docsPendientes > 1 ? "s" : ""} pendiente${docsPendientes > 1 ? "s" : ""}`,
    );

  return (
    <button
      onClick={() => onNavigate("personal")}
      className={`w-full text-left rounded-xl border p-4 transition-colors hover:opacity-90 ${toneClasses}`}
    >
      <div className="flex items-start gap-3">
        <AlertTriangle className={`h-5 w-5 flex-shrink-0 ${iconTone}`} />
        <div className="flex-1 min-w-0">
          <p className={`text-sm font-semibold ${titleTone}`}>
            Atención en documentación
          </p>
          <ul className="mt-1.5 space-y-0.5">
            {items.slice(0, 3).map((txt, i) => (
              <li key={i} className="text-xs text-zinc-300">
                • {txt}
              </li>
            ))}
          </ul>
        </div>
        <ChevronRight className={`h-4 w-4 flex-shrink-0 ${iconTone}`} />
      </div>
    </button>
  );
}
