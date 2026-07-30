"use client";

import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Tag } from "@/components/opai-ds";
import { cn } from "@/lib/utils";
import { CHILE_TZ } from "@/lib/dates-cl";
import { dateAtChileSlot } from "../agenda-calendar-utils";
import { hhmmChile, TYPE_LABELS } from "./agenda-mobile-utils";
import { ContextBlock, ParticipantsBlock, type DetailExternal, type DetailParticipant } from "./AgendaDetailBlocks";

type VisitaDetail = {
  visita: {
    id: string;
    type: string;
    title: string;
    startAt: string;
    endAt: string;
    notes: string | null;
    status: string;
    customAddress: string | null;
    account: { id: string; name: string } | null;
    installation: { id: string; name: string; address: string | null } | null;
    deal: { id: string; title: string } | null;
  };
  syncStatus: string;
  htmlLink: string | null;
  v2: { participants: DetailParticipant[]; externals: DetailExternal[] } | null;
};

type Props = {
  visitaId: string | null;
  onClose: () => void;
  onChanged: () => void;
};

/** Detalle móvil (spec §6): bottom sheet glass con snap 50/100 y Dialog DS. */
export function AgendaDetailSheet({ visitaId, onClose, onChanged }: Props) {
  const [detail, setDetail] = useState<VisitaDetail | null>(null);
  const [snap, setSnap] = useState<"half" | "full">("half");
  const [confirmCancel, setConfirmCancel] = useState(false);
  const [reprogramOpen, setReprogramOpen] = useState(false);
  const [newDate, setNewDate] = useState("");
  const [newTime, setNewTime] = useState("");
  const [busy, setBusy] = useState(false);
  const dragStart = useRef<number | null>(null);

  useEffect(() => {
    setDetail(null);
    setSnap("half");
    if (!visitaId) return;
    fetch(`/api/agenda/visitas/${visitaId}`)
      .then((r) => (r.ok ? r.json() : null))
      .then(setDetail)
      .catch(() => setDetail(null));
  }, [visitaId]);

  if (!visitaId) return null;

  const act = async (body: Record<string, unknown>, okMsg: string) => {
    setBusy(true);
    const res = await fetch(`/api/agenda/visitas/${visitaId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }).catch(() => null);
    setBusy(false);
    if (res?.ok) {
      toast.success(okMsg);
      onChanged();
      onClose();
    } else {
      toast.error("No se pudo completar la acción");
    }
  };

  const v = detail?.visita;
  const address = v?.installation?.address ?? v?.customAddress ?? null;
  const fecha = v
    ? new Date(v.startAt).toLocaleDateString("es-CL", {
        weekday: "short",
        day: "numeric",
        month: "short",
        timeZone: "America/Santiago",
      })
    : "";

  return (
    <div className="fixed inset-0 z-50 flex items-end bg-black/45 lg:hidden" onClick={onClose}>
      <div
        role="dialog"
        aria-label={v?.title ?? "Detalle del evento"}
        className={cn(
          "opai-glass-strong flex w-full flex-col rounded-b-none rounded-t-[28px] transition-[height] duration-200",
          snap === "half" ? "h-[52svh]" : "h-[92svh]",
        )}
        onClick={(event) => event.stopPropagation()}
      >
        <div
          className="flex shrink-0 cursor-grab justify-center py-2.5 touch-none"
          onPointerDown={(e) => {
            dragStart.current = e.clientY;
            (e.target as HTMLElement).setPointerCapture(e.pointerId);
          }}
          onPointerUp={(e) => {
            const start = dragStart.current;
            dragStart.current = null;
            if (start == null) return;
            const dy = e.clientY - start;
            if (dy < -40) setSnap("full");
            else if (dy > 40) (snap === "full" ? setSnap("half") : onClose());
          }}
        >
          <div className="h-[5px] w-10 rounded-full bg-ds-border-default" />
        </div>

        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-4 pb-4">
          {!detail || !v ? (
            <div className="space-y-2">
              <div className="opai-glass-soft h-6 w-2/3 animate-pulse rounded-lg" />
              <div className="opai-glass-soft h-4 w-1/2 animate-pulse rounded-lg" />
            </div>
          ) : (
            <>
              <div className="flex flex-wrap items-center gap-1.5">
                <Tag variant="info" className="text-[12px]">{TYPE_LABELS[v.type] ?? "Evento"}</Tag>
                {detail.syncStatus === "SYNCED" ? (
                  <span className="text-[12px] text-status-ok-fg">☁ Sincronizado</span>
                ) : (
                  <span className="text-[12px] text-status-warn-fg">◌ Pendiente de sync</span>
                )}
              </div>
              <div>
                <h2 className="font-display text-[19px] font-semibold leading-snug text-ds-text-1">
                  {v.title}
                </h2>
                <p className="mt-1 font-mono text-ds-body text-ds-text-3">
                  {fecha} · {hhmmChile(v.startAt)}–{hhmmChile(v.endAt)}
                </p>
              </div>

              <ParticipantsBlock
                participants={detail.v2?.participants ?? []}
                externals={detail.v2?.externals ?? []}
                fallbackName={null}
              />

              {address && (
                <section className="space-y-1">
                  <p className="text-[12px] font-medium uppercase tracking-wide text-ds-text-4">Ubicación</p>
                  <p className="text-ds-body text-ds-text-2">{address}</p>
                  <a
                    href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(address)}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex h-9 items-center text-ds-body font-medium text-primary ds-tap"
                  >
                    Cómo llegar ↗
                  </a>
                </section>
              )}

              <ContextBlock account={v.account} installation={v.installation} deal={v.deal} />

              {v.notes && (
                <section className="space-y-1">
                  <p className="text-[12px] font-medium uppercase tracking-wide text-ds-text-4">Notas</p>
                  <p className="whitespace-pre-wrap text-ds-body text-ds-text-2">{v.notes}</p>
                </section>
              )}
            </>
          )}
        </div>

        <div
          className="flex shrink-0 gap-2 border-t border-ds-border-subtle px-4 pt-3"
          style={{ paddingBottom: "calc(env(safe-area-inset-bottom) + 12px)" }}
        >
          {v && (
            <button
              type="button"
              disabled={busy}
              onClick={() => {
                const local = new Date(v.startAt).toLocaleString("sv-SE", { timeZone: CHILE_TZ });
                setNewDate(local.slice(0, 10));
                setNewTime(local.slice(11, 16));
                setReprogramOpen(true);
              }}
              className="h-11 flex-1 rounded-xl border border-ds-border-default text-ds-body font-medium text-ds-text-1 ds-tap"
            >
              Reprogramar
            </button>
          )}
          <button
            type="button"
            disabled={busy}
            onClick={() => void act({ action: "complete" }, "Visita completada")}
            className="h-11 flex-1 rounded-xl bg-status-ok-soft text-ds-body font-semibold text-status-ok-fg ds-tap"
          >
            Completar
          </button>
          <button
            type="button"
            aria-label="Cancelar visita"
            disabled={busy}
            onClick={() => setConfirmCancel(true)}
            className="h-11 w-11 shrink-0 rounded-xl border border-status-danger-border text-[15px] text-status-danger-fg ds-tap"
          >
            ✕
          </button>
        </div>
      </div>

      <Dialog open={reprogramOpen} onOpenChange={setReprogramOpen}>
        <DialogContent className="sm:max-w-sm" onClick={(e) => e.stopPropagation()}>
          <DialogHeader>
            <DialogTitle>Reprogramar</DialogTitle>
          </DialogHeader>
          <div className="flex gap-2">
            <input
              type="date"
              value={newDate}
              onChange={(e) => setNewDate(e.target.value)}
              className="h-11 min-w-0 flex-1 rounded-xl border border-ds-border-default bg-ds-surface-1 px-3 text-ds-body sm:h-9"
            />
            <input
              type="time"
              value={newTime}
              onChange={(e) => setNewTime(e.target.value)}
              className="h-11 w-28 rounded-xl border border-ds-border-default bg-ds-surface-1 px-3 text-ds-body sm:h-9"
            />
          </div>
          <button
            type="button"
            disabled={busy || !newDate || !newTime}
            onClick={() => {
              if (!v) return;
              const [hh, mm] = newTime.split(":").map(Number);
              const startAt = dateAtChileSlot(newDate, hh * 60 + mm);
              const durationMs =
                new Date(v.endAt).getTime() - new Date(v.startAt).getTime();
              setReprogramOpen(false);
              void act(
                {
                  startAt: startAt.toISOString(),
                  endAt: new Date(startAt.getTime() + Math.max(durationMs, 15 * 60_000)).toISOString(),
                },
                "Visita reprogramada",
              );
            }}
            className="h-11 w-full rounded-xl bg-primary text-ds-body font-semibold text-primary-foreground ds-tap sm:h-9"
          >
            Guardar nuevo horario
          </button>
        </DialogContent>
      </Dialog>

      <Dialog open={confirmCancel} onOpenChange={setConfirmCancel}>
        <DialogContent className="sm:max-w-sm" onClick={(e) => e.stopPropagation()}>
          <DialogHeader>
            <DialogTitle>¿Cancelar esta visita?</DialogTitle>
          </DialogHeader>
          <p className="text-ds-body text-ds-text-3">
            Se avisará a los participantes y el evento se quitará de Google Calendar.
          </p>
          <div className="flex gap-2 pt-1">
            <button
              type="button"
              onClick={() => setConfirmCancel(false)}
              className="h-11 flex-1 rounded-xl border border-ds-border-default text-ds-body font-medium ds-tap sm:h-9"
            >
              Volver
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={() => {
                setConfirmCancel(false);
                void act({ action: "cancel" }, "Visita cancelada");
              }}
              className="h-11 flex-1 rounded-xl bg-status-danger-soft text-ds-body font-semibold text-status-danger-fg ds-tap sm:h-9"
            >
              Cancelar visita
            </button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
