"use client";

import { useEffect, useMemo, useState } from "react";
import { BookOpen, Loader2 } from "lucide-react";
import { BitacoraFiltros, type BitacoraFiltro } from "./bitacora/BitacoraFiltros";
import { BitacoraTimeline } from "./bitacora/BitacoraTimeline";
import type { TimelineEvent } from "./bitacora/BitacoraEvento";
import { ExportButton } from "./shared/ExportButton";

const TYPE_MAP: Record<BitacoraFiltro, string[] | null> = {
  todos: null,
  rondas: ["ronda_completada", "ronda_incompleta"],
  marcaciones: ["marcacion_entrada", "marcacion_salida"],
  tickets: ["ticket_creado", "ticket_resuelto"],
  supervision: ["supervision_realizada"],
  incidentes: ["incidente_reportado"],
};

interface Props {
  selectedInstallation?: string;
}

export function PortalBitacora({ selectedInstallation }: Props) {
  const [events, setEvents] = useState<TimelineEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [filtro, setFiltro] = useState<BitacoraFiltro>("todos");
  const [days, setDays] = useState(30);

  useEffect(() => {
    let active = true;
    setLoading(true);
    const desde = new Date(Date.now() - days * 86400_000).toISOString();
    const hasta = new Date().toISOString();
    const params = new URLSearchParams({ desde, hasta, limit: "150" });
    if (selectedInstallation) {
      params.set("installationId", selectedInstallation);
    }
    const types = TYPE_MAP[filtro];
    if (types) params.set("types", types.join(","));
    fetch(`/api/portal/cliente/bitacora?${params.toString()}`)
      .then((r) => r.json())
      .then((res) => {
        if (!active) return;
        if (res.success) setEvents(res.data.events);
        setLoading(false);
      })
      .catch((err) => {
        console.error("[PortalBitacora] fetch error:", err);
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [selectedInstallation, days, filtro]);

  const exportRows = useMemo(
    () =>
      events.map((e) => ({
        fecha: new Date(e.timestamp).toLocaleString("es-CL"),
        tipo: e.type,
        titulo: e.title,
        detalle: e.detail ?? "",
        instalacion: e.installationName ?? "",
        guardia: e.guardiaName ?? "",
        severidad: e.severity,
      })),
    [events],
  );

  return (
    <div className="max-w-2xl mx-auto w-full px-4 py-4 pb-24">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <BookOpen className="h-5 w-5 text-teal-400" />
          <h2 className="text-lg font-semibold">Bitácora ejecutiva</h2>
        </div>
        <ExportButton
          baseName={`bitacora_${days}d`}
          sheetName="Bitácora"
          rows={exportRows}
          columns={[
            { key: "fecha", label: "Fecha y hora", width: 22 },
            { key: "tipo", label: "Tipo", width: 22 },
            { key: "titulo", label: "Evento", width: 32 },
            { key: "detalle", label: "Detalle", width: 40 },
            { key: "instalacion", label: "Instalación", width: 22 },
            { key: "guardia", label: "Guardia", width: 22 },
            { key: "severidad", label: "Severidad", width: 12 },
          ]}
        />
      </div>

      <BitacoraFiltros
        filtro={filtro}
        onFiltro={setFiltro}
        days={days}
        onDays={setDays}
      />

      {loading ? (
        <div className="flex items-center justify-center py-12 gap-2 text-zinc-400">
          <Loader2 className="h-5 w-5 animate-spin" />
          <span className="text-sm">Cargando eventos...</span>
        </div>
      ) : events.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 gap-2 text-zinc-500">
          <BookOpen className="h-8 w-8" />
          <p className="text-sm">Sin eventos en el rango seleccionado.</p>
        </div>
      ) : (
        <BitacoraTimeline events={events} />
      )}
    </div>
  );
}
