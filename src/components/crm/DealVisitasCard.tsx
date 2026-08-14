"use client";

import { useEffect, useState } from "react";
import { Surface, Spinner, StatusDot } from "@/components/opai-ds";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { ExternalLink, Pencil, RefreshCw, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { NuevaVisitaModal } from "@/components/agenda/NuevaVisitaModal";
import { syncStatusMeta } from "@/components/agenda/agenda-sync-status";

type VisitRow = {
  id: string;
  source: string;
  type: string;
  title?: string;
  label?: string | null;
  start: string;
  end?: string;
  allDay?: boolean;
  assignedName: string | null;
  status: string;
  syncStatus: string | null;
  syncReason?: string | null;
  htmlLink?: string | null;
};

type Props = {
  dealId: string;
  accountId?: string | null;
  installationId?: string | null;
};

function formatWhen(r: VisitRow): string {
  const start = new Date(r.start);
  const dateOpts: Intl.DateTimeFormatOptions = {
    day: "2-digit",
    month: "short",
    year: "numeric",
  };
  const startDate = start.toLocaleDateString("es-CL", dateOpts);
  if (r.allDay) {
    if (r.end) {
      const end = new Date(r.end);
      // endAt all-day suele ser 23:59 del último día inclusivo.
      const endDate = end.toLocaleDateString("es-CL", dateOpts);
      if (endDate !== startDate) {
        return `${startDate} → ${endDate} · Todo el día`;
      }
    }
    return `${startDate} · Todo el día`;
  }
  const time = start.toLocaleTimeString("es-CL", {
    hour: "2-digit",
    minute: "2-digit",
  });
  return `${startDate} · ${time}`;
}

export function DealVisitasCard({ dealId, accountId, installationId }: Props) {
  const [rows, setRows] = useState<VisitRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [resyncingId, setResyncingId] = useState<string | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);

  useEffect(() => {
    let cancelled = false;
    const from = new Date();
    from.setMonth(from.getMonth() - 6);
    const to = new Date();
    to.setMonth(to.getMonth() + 12);
    setLoading(true);
    fetch(
      `/api/agenda?from=${from.toISOString()}&to=${to.toISOString()}&dealId=${encodeURIComponent(dealId)}`,
    )
      .then((r) => r.json())
      .then((j) => {
        if (cancelled) return;
        setRows(j.items ?? []);
      })
      .catch(() => setRows([]))
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [dealId, refreshKey]);

  return (
    <Surface elevation={1} padding="md" className="w-full min-w-0 space-y-3">
      <NuevaVisitaModal
        open={modalOpen}
        onOpenChange={(v) => {
          setModalOpen(v);
          if (!v) setEditId(null);
        }}
        dealId={dealId}
        accountId={accountId}
        installationId={installationId}
        editEventId={editId}
        onCreated={() => setRefreshKey((k) => k + 1)}
      />
      <ConfirmDialog
        open={Boolean(deleteId)}
        onOpenChange={(open) => {
          if (!open && !deleting) setDeleteId(null);
        }}
        title="¿Eliminar este evento?"
        description="Se cancela en la agenda OPAI y se elimina también de Google Calendar si estaba sincronizado."
        confirmLabel="Eliminar"
        variant="destructive"
        loading={deleting}
        loadingLabel="Eliminando…"
        onConfirm={async () => {
          if (!deleteId || deleting) return;
          setDeleting(true);
          try {
            const res = await fetch(`/api/calendar/events/${deleteId}`, {
              method: "DELETE",
            });
            const json = await res.json().catch(() => ({}));
            if (!res.ok) {
              toast.error(json.error || "No se pudo eliminar el evento");
              return;
            }
            toast.success(
              json.syncStatus === "SYNCED" || json.syncStatus === "CANCELLED"
                ? "Evento eliminado · Google Calendar actualizado"
                : "Evento eliminado de la agenda",
            );
            setDeleteId(null);
            setRefreshKey((k) => k + 1);
          } finally {
            setDeleting(false);
          }
        }}
      />
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs font-medium uppercase tracking-wide text-ds-text-3">
          Agenda del negocio
        </p>
        <Button
          variant="outline"
          size="sm"
          className="h-10 sm:h-9"
          onClick={() => {
            setEditId(null);
            setModalOpen(true);
          }}
        >
          Agendar
        </Button>
      </div>
      {loading ? (
        <Spinner className="mx-auto" />
      ) : rows.length === 0 ? (
        <p className="text-[13px] text-ds-text-3">
          Sin eventos vinculados a este negocio.
        </p>
      ) : (
        <ul className="divide-y divide-ds-border-subtle rounded-xl border border-ds-border-subtle">
          {rows.map((r) => {
            const sync = syncStatusMeta(r.syncStatus, r.syncReason);
            const canResync =
              r.source === "agenda_visita" &&
              (r.syncStatus === "ERROR" || r.syncStatus === "PENDING");
            return (
              <li
                key={`${r.source}-${r.id}`}
                className="flex items-center gap-2 px-3 py-2.5 lg:flex-col lg:items-stretch lg:gap-2 lg:py-3"
              >
                <div className="flex min-w-0 flex-1 items-center gap-2">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[13px] font-medium text-ds-text-1">
                      {r.label ? (
                        <span className="text-ds-text-3">{r.label} · </span>
                      ) : null}
                      <span>{r.title || r.type}</span>
                      <span className="font-normal text-ds-text-3">
                        {" · "}
                        {formatWhen(r)}
                        {r.assignedName ? ` · ${r.assignedName}` : ""}
                      </span>
                    </p>
                    {r.syncStatus === "ERROR" && sync.label ? (
                      <p className="truncate text-[12px] text-status-danger-fg">{sync.label}</p>
                    ) : null}
                  </div>
                  {r.syncStatus ? (
                    <span
                      className="shrink-0"
                      title={sync.label}
                      aria-label={sync.ariaLabel}
                    >
                      <StatusDot
                        kind={
                          sync.tone === "ok"
                            ? "ok"
                            : sync.tone === "danger"
                              ? "danger"
                              : sync.tone === "warn"
                                ? "warn"
                                : "neutral"
                        }
                      />
                    </span>
                  ) : null}
                </div>
                <div className="flex shrink-0 flex-wrap gap-0.5 lg:gap-1">
                  {r.htmlLink && (
                    <a
                      href={r.htmlLink}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex h-11 min-w-11 items-center justify-center gap-1.5 rounded-lg px-2 text-[12px] text-ds-text-3 hover:bg-ds-surface-2 hover:text-ds-text-1 sm:h-10"
                      title="Abrir en Google"
                    >
                      <ExternalLink className="h-4 w-4" />
                      <span className="sm:hidden">Google</span>
                    </a>
                  )}
                  {canResync && (
                    <button
                      type="button"
                      disabled={resyncingId === r.id}
                      className="inline-flex h-11 min-w-11 items-center justify-center gap-1.5 rounded-lg px-2 text-[12px] text-ds-text-3 hover:bg-ds-surface-2 hover:text-ds-text-1 disabled:opacity-50 sm:h-10"
                      title="Reenviar a Google Calendar"
                      aria-label="Reenviar a Google Calendar"
                      onClick={async () => {
                        if (resyncingId) return;
                        setResyncingId(r.id);
                        try {
                          const res = await fetch(
                            `/api/calendar/events/${r.id}/resync`,
                            { method: "POST" },
                          );
                          const json = await res.json().catch(() => ({}));
                          if (!res.ok) {
                            toast.error(json.error || "No se pudo reenviar a Google");
                            return;
                          }
                          if (json.syncStatus === "SYNCED") {
                            toast.success("Evento sincronizado con Google Calendar");
                          } else {
                            toast.error(
                              json.syncReason ||
                                "Google no aceptó el evento; revisá la conexión de Calendar",
                            );
                          }
                          setRefreshKey((k) => k + 1);
                        } finally {
                          setResyncingId(null);
                        }
                      }}
                    >
                      <RefreshCw
                        className={`h-4 w-4 ${resyncingId === r.id ? "animate-spin" : ""}`}
                      />
                      <span className="sm:hidden">Reenviar</span>
                    </button>
                  )}
                  {r.source === "agenda_visita" && (
                    <>
                      <button
                        type="button"
                        className="inline-flex h-11 min-w-11 items-center justify-center gap-1.5 rounded-lg px-2 text-[12px] text-ds-text-3 hover:bg-ds-surface-2 hover:text-ds-text-1 sm:h-10"
                        title="Editar"
                        aria-label="Editar evento"
                        onClick={() => {
                          setEditId(r.id);
                          setModalOpen(true);
                        }}
                      >
                        <Pencil className="h-4 w-4" />
                        <span className="sm:hidden">Editar</span>
                      </button>
                      <button
                        type="button"
                        className="inline-flex h-11 min-w-11 items-center justify-center gap-1.5 rounded-lg px-2 text-[12px] text-status-danger-fg hover:bg-status-danger-soft sm:h-10"
                        title="Eliminar"
                        aria-label="Eliminar evento"
                        onClick={() => setDeleteId(r.id)}
                      >
                        <Trash2 className="h-4 w-4" />
                        <span className="sm:hidden">Eliminar</span>
                      </button>
                    </>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </Surface>
  );
}
