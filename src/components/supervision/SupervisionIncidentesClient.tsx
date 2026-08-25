"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { IncidenteStatusBadge } from "@/components/incidentes/IncidenteStatusBadge";
import { IncidentePhotoLightbox } from "@/components/incidentes/IncidentePhotoLightbox";
import {
  IncidenteResolverSheet,
  postSupervisionIncidenteAction,
} from "@/components/incidentes/IncidenteResolverSheet";
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
  const router = useRouter();
  const [filter, setFilter] = useState<Filter>("por_validar");
  const [items, setItems] = useState<Item[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [done, setDone] = useState<Record<string, string>>({});
  const [preview, setPreview] = useState<string | null>(null);
  const [resolveId, setResolveId] = useState<string | null>(null);

  const apiFilter = filter === "por_validar" ? "pendientes" : filter;

  const load = useCallback(() => {
    setLoading(true);
    fetch(`/api/ops/supervision/incidentes?filter=${apiFilter}`)
      .then((r) => r.json())
      .then((j) => {
        if (j.success) setItems(j.data.items ?? []);
      })
      .finally(() => setLoading(false));
  }, [apiFilter]);

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
      await postSupervisionIncidenteAction({ ticketId: id, action, reason });
      setDone((d) => ({
        ...d,
        [id]: action === "validar" ? "Validado por ti" : "Devuelto al guardia",
      }));
      load();
    } catch (err) {
      window.alert(err instanceof Error ? err.message : "No se pudo completar");
    } finally {
      setBusyId(null);
    }
  }

  const resolving = items.find((i) => i.id === resolveId) ?? null;

  return (
    <div className="ds-page-enter space-y-4 min-w-0">
      <PageHero
        icon={<Siren />}
        iconTone="emerald"
        title="Incidentes en terreno"
        subtitle="cola de supervisión"
        description="Nuevos, en atención y cierres pendientes. Cualquier supervisor de la instalación puede resolver o validar."
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
          {items.map((item) => {
            const canResolve = item.status === "open" || item.status === "in_progress" || item.status === "waiting";
            const canValidate = item.status === "resolved";
            return (
              <li key={item.id}>
                <Surface
                  padding="md"
                  tappable
                  className="space-y-3 cursor-pointer"
                  onClick={() => router.push(`/ops/tickets/${item.id}`)}
                >
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
                  <div className={item.closurePhotoUrl ? "grid grid-cols-2 gap-2" : ""}>
                    <figure>
                      {item.reportPhotoUrl ? (
                        <button
                          type="button"
                          className="block w-full"
                          onClick={(e) => {
                            e.stopPropagation();
                            setPreview(item.reportPhotoUrl);
                          }}
                        >
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img
                            src={item.reportPhotoUrl}
                            alt="Foto del reporte"
                            className="h-44 w-full rounded-lg bg-ds-surface-2 object-contain"
                          />
                        </button>
                      ) : (
                        <div className="h-44 rounded-lg bg-ds-surface-2" />
                      )}
                      <figcaption className="mt-1 text-[12px] text-ds-text-3">Reporte</figcaption>
                    </figure>
                    {item.closurePhotoUrl ? (
                      <figure>
                        <button
                          type="button"
                          className="block w-full"
                          onClick={(e) => {
                            e.stopPropagation();
                            setPreview(item.closurePhotoUrl);
                          }}
                        >
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img
                            src={item.closurePhotoUrl}
                            alt="Foto de cierre"
                            className="h-44 w-full rounded-lg bg-ds-surface-2 object-contain"
                          />
                        </button>
                        <figcaption className="mt-1 text-[12px] text-ds-text-3">Cierre</figcaption>
                      </figure>
                    ) : null}
                  </div>
                  {item.resolutionNotes ? (
                    <blockquote className="rounded-lg bg-ds-surface-2 px-3 py-2 text-[14px]">
                      {item.resolutionNotes}
                      {item.guardiaName ? ` — ${item.guardiaName}` : ""}
                    </blockquote>
                  ) : null}
                  {done[item.id] ? (
                    <p className="text-[13px] font-medium text-status-ok-fg">{done[item.id]}</p>
                  ) : canResolve ? (
                    <button
                      type="button"
                      className="min-h-11 w-full rounded-xl bg-primary text-primary-foreground font-semibold"
                      onClick={(e) => {
                        e.stopPropagation();
                        setResolveId(item.id);
                      }}
                    >
                      Resolver
                    </button>
                  ) : canValidate ? (
                    <div className="flex gap-2" onClick={(e) => e.stopPropagation()}>
                      <button
                        type="button"
                        className="min-h-11 flex-1 rounded-xl border border-ds-border-default"
                        disabled={busyId === item.id}
                        onClick={() => act(item.id, "rechazar")}
                      >
                        Devolver
                      </button>
                      <button
                        type="button"
                        className="min-h-11 flex-1 rounded-xl bg-primary text-primary-foreground font-semibold"
                        disabled={busyId === item.id}
                        onClick={() => act(item.id, "validar")}
                      >
                        Validar cierre
                      </button>
                    </div>
                  ) : null}
                </Surface>
              </li>
            );
          })}
        </ul>
      )}
      <IncidenteResolverSheet
        open={Boolean(resolveId)}
        onOpenChange={(open) => {
          if (!open) setResolveId(null);
        }}
        ticketId={resolving?.id ?? resolveId ?? ""}
        ticketCode={resolving?.code}
        onDone={() => {
          if (resolveId) {
            setDone((d) => ({ ...d, [resolveId]: "Resuelto y validado" }));
          }
          setResolveId(null);
          load();
        }}
      />
      <IncidentePhotoLightbox
        src={preview}
        open={Boolean(preview)}
        onClose={() => setPreview(null)}
      />
    </div>
  );
}
