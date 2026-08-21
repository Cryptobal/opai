"use client";

import { useCallback, useEffect, useState } from "react";
import { IncidenteStatusBadge } from "@/components/incidentes/IncidenteStatusBadge";
import { EmptyState, PageHero, SegmentedControl, Spinner, Surface } from "@/components/opai-ds";
import { Siren } from "lucide-react";

type Filter = "por_validar" | "activos" | "validados";
type Item = {
  id: string;
  code: string;
  title: string;
  status: string;
  installationName: string | null;
  respondedIn: string | null;
  resolutionNotes: string | null;
  guardiaName: string | null;
  reportPhotoUrl: string | null;
  closurePhotoUrl: string | null;
  validation: { auto: boolean; validatedByName: string | null } | null;
};

export function SupervisionIncidentesClient() {
  const [filter, setFilter] = useState<Filter>("por_validar");
  const [items, setItems] = useState<Item[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [done, setDone] = useState<Record<string, string>>({});

  const load = useCallback(() => {
    setLoading(true);
    fetch(`/api/ops/supervision/incidentes?filter=${filter}`)
      .then((r) => r.json())
      .then((j) => {
        if (j.success) setItems(j.data.items ?? []);
      })
      .finally(() => setLoading(false));
  }, [filter]);

  useEffect(() => {
    load();
  }, [load]);

  async function act(id: string, action: "validar" | "rechazar") {
    let reason = "";
    if (action === "rechazar") {
      reason = window.prompt("Motivo para devolver al guardia")?.trim() ?? "";
      if (reason.length < 4) return;
    }
    setBusyId(id);
    try {
      const res = await fetch("/api/ops/supervision/incidentes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ticketId: id, action, reason }),
      });
      const json = await res.json();
      if (!res.ok) {
        window.alert(json.error ?? "No se pudo completar");
        return;
      }
      setDone((d) => ({ ...d, [id]: action === "validar" ? "Validado por ti" : "Devuelto al guardia" }));
      load();
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div className="ds-page-enter space-y-4 min-w-0">
      <PageHero
        icon={<Siren />}
        iconTone="emerald"
        title="Incidentes en terreno"
        subtitle="validación de cierres"
        description="Cualquier supervisor de la instalación puede validar. Gana el primero."
      />
      <SegmentedControl
        ariaLabel="Cola de incidentes"
        value={filter}
        onChange={setFilter}
        items={[
          { id: "por_validar", label: "Por validar" },
          { id: "activos", label: "Activos" },
          { id: "validados", label: "Validados" },
        ]}
      />
      {loading ? (
        <div className="flex justify-center py-12"><Spinner /></div>
      ) : items.length === 0 ? (
        <EmptyState icon={Siren} title="Nada en esta cola" description="Los reportes QR de tus instalaciones aparecen aquí." />
      ) : (
        <ul className="space-y-3">
          {items.map((item) => (
            <li key={item.id}>
              <Surface padding="md" className="space-y-3">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <p className="font-mono text-[12px] text-ds-text-3">{item.code}</p>
                    <p className="font-medium">{item.title}</p>
                    <p className="text-[13px] text-ds-text-3">
                      {item.installationName ?? "Instalación"}
                      {item.respondedIn ? ` · atendido en ${item.respondedIn}` : ""}
                    </p>
                  </div>
                  <IncidenteStatusBadge status={item.status} />
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <figure>
                    {item.reportPhotoUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={item.reportPhotoUrl} alt="Foto del reporte" className="h-28 w-full rounded-lg object-cover" />
                    ) : (
                      <div className="h-28 rounded-lg bg-ds-surface-2" />
                    )}
                    <figcaption className="mt-1 text-[12px] text-ds-text-3">Reporte</figcaption>
                  </figure>
                  <figure>
                    {item.closurePhotoUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={item.closurePhotoUrl} alt="Foto de cierre" className="h-28 w-full rounded-lg object-cover" />
                    ) : (
                      <div className="h-28 rounded-lg bg-ds-surface-2" />
                    )}
                    <figcaption className="mt-1 text-[12px] text-ds-text-3">Cierre</figcaption>
                  </figure>
                </div>
                {item.resolutionNotes ? (
                  <blockquote className="rounded-lg bg-ds-surface-2 px-3 py-2 text-[14px]">
                    {item.resolutionNotes}
                    {item.guardiaName ? ` — ${item.guardiaName}` : ""}
                  </blockquote>
                ) : null}
                <p className="text-[12px] text-ds-text-3">
                  Notificados: guardia en turno y supervisión · valida el primero que lo tome
                </p>
                {done[item.id] ? (
                  <p className="text-[13px] font-medium text-status-ok-fg">{done[item.id]}</p>
                ) : item.status === "resolved" ? (
                  <div className="flex gap-2">
                    <button
                      type="button"
                      className="min-h-11 flex-1 rounded-xl border border-ds-border-default"
                      disabled={busyId === item.id}
                      onClick={() => act(item.id, "rechazar")}
                    >
                      Rechazar
                    </button>
                    <button
                      type="button"
                      className="min-h-11 flex-1 rounded-xl bg-primary text-primary-foreground font-semibold"
                      disabled={busyId === item.id}
                      onClick={() => act(item.id, "validar")}
                    >
                      Validar
                    </button>
                  </div>
                ) : null}
              </Surface>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
