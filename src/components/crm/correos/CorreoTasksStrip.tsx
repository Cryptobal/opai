"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { useCorreoWork } from "./CorreoWorkContext";
import { CorreoTasksStripChip } from "./CorreoTasksStripChip";
import { CorreoTasksStripForm } from "./CorreoTasksStripForm";
import type { ThreadTaskSource } from "@/modules/crm/email/correos-tasks";

const OPEN_MAX = 6;

type Props = {
  canModify?: boolean;
  /** Abre la pestaña Trabajo del panel (p. ej. al pulsar "+N más"). */
  onOpenTrabajo?: () => void;
  compact?: boolean;
};

/**
 * Franja de tareas del hilo en el lector: chips abiertas + crear/sugerir.
 * No renderiza si no hay tareas y el usuario no puede modificar.
 */
export function CorreoTasksStrip({ canModify = false, onOpenTrabajo, compact }: Props) {
  const router = useRouter();
  const { threadId, tasks: tasksRes, reload } = useCorreoWork();
  const tasks = tasksRes.data ?? [];
  const open = tasks.filter((t) => t.status !== "done");
  const doneCount = tasks.length - open.length;
  const [form, setForm] = useState<{ source: ThreadTaskSource; title?: string } | null>(null);
  const [sugBusy, setSugBusy] = useState(false);

  if (tasks.length === 0 && !canModify) return null;

  const visible = open.slice(0, OPEN_MAX);
  const more = open.length - visible.length;

  async function suggest() {
    setSugBusy(true);
    try {
      const d = await fetch(`/api/crm/correos/${threadId}/tasks/suggest`, {
        method: "POST",
      }).then((r) => r.json());
      if (d.title) {
        setForm({ source: "copiloto", title: d.title });
      } else {
        toast.error(d.error || "No se pudo sugerir");
      }
    } finally {
      setSugBusy(false);
    }
  }

  return (
    <div className={cn("min-w-0 space-y-1.5", compact && "pt-0.5")}>
      <div className="flex flex-wrap items-center gap-1.5">
        {visible.map((t) => (
          <CorreoTasksStripChip
            key={t.id}
            task={t}
            compact={compact}
            onClick={() => router.push(`/opai/tareas?task=${t.id}`)}
          />
        ))}
        {more > 0 && (
          <button
            type="button"
            onClick={() => onOpenTrabajo?.()}
            className="opai-glass-soft inline-flex min-h-9 items-center rounded-2xl px-2.5 text-[12px] text-ds-text-3 ds-tap"
          >
            +{more} más
          </button>
        )}
        {doneCount > 0 && (
          <span className="text-[12px] text-ds-text-4">+{doneCount} completadas</span>
        )}
        {canModify && !form && (
          <>
            <button
              type="button"
              onClick={() => setForm({ source: "correo" })}
              className="inline-flex min-h-9 items-center gap-1 rounded-2xl border border-ds-border-subtle px-2.5 text-[12px] font-medium text-ds-text-2 ds-tap"
            >
              + Tarea
            </button>
            <button
              type="button"
              disabled={sugBusy}
              onClick={() => void suggest()}
              className="inline-flex min-h-9 items-center gap-1 rounded-2xl border border-tint-violet/30 bg-tint-violet/10 px-2.5 text-[12px] font-medium text-tint-violet-fg ds-tap disabled:opacity-50"
            >
              {sugBusy ? "…" : "✦ Sugerir"}
            </button>
          </>
        )}
      </div>
      {form && (
        <CorreoTasksStripForm
          threadId={threadId}
          source={form.source}
          initialTitle={form.title}
          onCancel={() => setForm(null)}
          onDone={() => {
            setForm(null);
            void reload("tasks");
          }}
        />
      )}
    </div>
  );
}
