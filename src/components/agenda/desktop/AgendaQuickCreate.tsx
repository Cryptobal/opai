"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { X } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import type { AgendaTeamMember } from "../agenda-calendar.types";
import { useEventComposer } from "../mobile/useEventComposer";
import { QuickCreateEventFields, QuickCreateTaskFields } from "./QuickCreateFields";
import { useQuickCreateTask } from "./useQuickCreateTask";

export type QuickCreateState = {
  mode: "evento" | "tarea";
  /** Punto de apertura (click en celda); null = anclado al botón Crear. */
  origin: { x: number; y: number } | null;
  dateKey?: string | null;
  minute?: number | null;
};

const PANEL_W = 400;

type Props = {
  state: QuickCreateState;
  users: AgendaTeamMember[];
  onClose: () => void;
  onCreated: () => void;
  onOpenTask?: (id: string) => void;
};

/** Quick-create Notion-style: panel flotante ≤400px, contenido contenido al viewport. */
export function AgendaQuickCreate({ state, users, onClose, onCreated, onOpenTask }: Props) {
  const [mode, setMode] = useState(state.mode);
  const [title, setTitle] = useState("");
  const composer = useEventComposer(true, state.dateKey ?? null);
  const task = useQuickCreateTask();
  const panelRef = useRef<HTMLDivElement>(null);
  // Oculto hasta medir el alto real (evita el salto del primer frame).
  const [position, setPosition] = useState<{ left: number; top: number } | null>(null);

  // Prefill fecha/hora del slot clickeado (una vez por apertura).
  useEffect(() => {
    if (state.dateKey) {
      composer.set.setDate(state.dateKey);
      task.set.setDate(state.dateKey);
    }
    if (state.minute != null) {
      const hh = String(Math.floor(state.minute / 60)).padStart(2, "0");
      const mm = String(state.minute % 60).padStart(2, "0");
      composer.set.setTime(`${hh}:${mm}`);
      task.set.setTime(`${hh}:${mm}`);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state]);

  // Reposiciona clampeando por el alto/ancho REAL del panel. ResizeObserver
  // reclampa cuando el contenido crece (participantes, conflictos, etc.).
  useLayoutEffect(() => {
    const el = panelRef.current;
    if (!el) return;
    const clamp = () => {
      const vw = window.innerWidth;
      const vh = window.innerHeight;
      const h = el.offsetHeight;
      const w = el.offsetWidth || PANEL_W;
      const x = state.origin?.x ?? vw - PANEL_W - 24;
      const y = state.origin?.y ?? 96;
      const next = {
        left: Math.max(8, Math.min(x, vw - w - 8)),
        top: Math.max(8, Math.min(y, vh - h - 8)),
      };
      setPosition((prev) =>
        prev && prev.left === next.left && prev.top === next.top ? prev : next,
      );
    };
    clamp();
    window.addEventListener("resize", clamp);
    const ro = new ResizeObserver(clamp);
    ro.observe(el);
    return () => {
      window.removeEventListener("resize", clamp);
      ro.disconnect();
    };
  }, [state.origin, mode]);

  const saving = mode === "evento" ? composer.saving : task.saving;

  const [lastCreatedTaskId, setLastCreatedTaskId] = useState<string | null>(null);

  const save = async () => {
    if (saving) return;
    if (mode === "tarea") {
      const id = await task.submit();
      if (id) {
        setLastCreatedTaskId(id);
        onCreated();
      }
      return;
    }
    if (!title.trim()) {
      toast.error("Ponle un título al evento");
      return;
    }
    if (
      composer.form.type === "tecnica" &&
      (!composer.form.account || !composer.form.installationId)
    ) {
      toast.error("La visita técnica necesita cuenta e instalación");
      return;
    }
    if (await composer.submit()) {
      onCreated();
      onClose();
    }
  };

  const toggleMode = () => setMode((m) => (m === "evento" ? "tarea" : "evento"));

  const handleKeyDown = (event: React.KeyboardEvent) => {
    if (event.key === "Escape") {
      event.stopPropagation();
      onClose();
      return;
    }
    const target = event.target as HTMLElement;
    if (event.key === "Tab" && target.dataset.qcTitle === "1") {
      // ⇥ sobre el título alterna Evento/Tarea (Notion-style).
      event.preventDefault();
      toggleMode();
      return;
    }
    if (event.key === "Enter" && !event.shiftKey && target.tagName === "INPUT") {
      if (target.dataset.qcEnterExempt === "1") return;
      event.preventDefault();
      void save();
    }
  };

  return (
    <>
      <div className="fixed inset-0 z-40" onClick={onClose} aria-hidden />
      <div
        ref={panelRef}
        role="dialog"
        aria-label="Crear evento o tarea"
        onKeyDown={handleKeyDown}
        className="fixed z-50 flex w-[min(400px,calc(100vw-16px))] max-h-[calc(100dvh-16px)] flex-col overflow-hidden rounded-2xl border border-ds-border-default bg-ds-surface-1 shadow-ds-lg"
        style={{
          left: position?.left ?? 0,
          top: position?.top ?? 0,
          visibility: position ? "visible" : "hidden",
        }}
      >
        <div className="flex h-12 shrink-0 items-center justify-between px-3">
          <div className="flex items-center gap-0.5 rounded-xl bg-ds-surface-2 p-0.5">
            {(["evento", "tarea"] as const).map((m) => (
              <button
                key={m}
                type="button"
                onClick={() => setMode(m)}
                className={cn(
                  "h-7 rounded-[9px] px-3 text-[12px] font-medium capitalize transition-colors ds-tap",
                  mode === m
                    ? "bg-ds-surface-1 text-ds-text-1 shadow-ds-xs"
                    : "text-ds-text-3 hover:text-ds-text-1",
                )}
              >
                {m}
              </button>
            ))}
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Cerrar"
            className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-ds-text-3 hover:bg-ds-surface-2 ds-tap"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="shrink-0 px-4 pb-2">
          <input
            autoFocus
            data-qc-title="1"
            value={title}
            onChange={(e) => {
              setTitle(e.target.value);
              composer.set.setTitle(e.target.value);
              task.set.setTitle(e.target.value);
            }}
            placeholder={mode === "evento" ? "Título del evento" : "Título de la tarea"}
            aria-label="Título"
            className="w-full border-0 bg-transparent p-0 font-display text-[17px] font-semibold text-ds-text-1 outline-none placeholder:text-ds-text-4 focus:ring-0"
          />
        </div>

        {/* Cuerpo flexible: absorbe alto restante; scroll solo vertical.
            min-h-0 permite ceder espacio al footer dentro del flex-col. */}
        <div className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden px-4 pb-3">
          {mode === "evento" ? (
            <QuickCreateEventFields composer={composer} users={users} />
          ) : (
            <QuickCreateTaskFields task={task} users={users} />
          )}
        </div>

        <div className="flex h-12 shrink-0 items-center justify-between gap-2 border-t border-ds-border-subtle px-4">
          {lastCreatedTaskId ? (
            <button
              type="button"
              onClick={() => {
                if (onOpenTask) onOpenTask(lastCreatedTaskId);
                else onClose();
              }}
              className="text-[13px] font-medium text-primary underline-offset-2 hover:underline ds-tap"
            >
              Abrir detalle
            </button>
          ) : (
            <p className="font-mono text-[12px] text-ds-text-4">⇥ cambia · ↵ guarda</p>
          )}
          <button
            type="button"
            disabled={saving}
            onClick={() => {
              if (lastCreatedTaskId) {
                onClose();
                return;
              }
              void save();
            }}
            className="inline-flex h-8 items-center rounded-xl bg-primary px-3.5 text-[13px] font-semibold text-primary-foreground ds-tap disabled:opacity-60"
          >
            {saving ? "Guardando…" : lastCreatedTaskId ? "Cerrar" : "Guardar"}
          </button>
        </div>
      </div>
    </>
  );
}
