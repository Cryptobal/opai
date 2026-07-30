"use client";

import { useCallback, useEffect, useState } from "react";
import { MessageSquare } from "lucide-react";
import { EmptyState, Spinner } from "@/components/opai-ds";
import { cn } from "@/lib/utils";
import {
  activityKindLabel,
  formatActivityChile,
  type TareaActivityRow,
} from "./tarea-activity-labels";
import type { TareaItem } from "./types";

export type { TareaActivityRow };

/** Timeline de actividad + input de comentario. */
export function TareaActivityTimeline({
  task, nameById, canEdit, compact,
}: {
  task: TareaItem;
  nameById: Map<string, string>;
  canEdit: boolean;
  compact?: boolean;
}) {
  const [rows, setRows] = useState<TareaActivityRow[] | null>(null);
  const [expanded, setExpanded] = useState(false);
  const [comment, setComment] = useState("");
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    const res = await fetch(`/api/crm/tasks/${task.id}/activity`).catch(() => null);
    const json = res?.ok ? await res.json() : null;
    setRows(Array.isArray(json?.data) ? json.data : []);
  }, [task.id]);

  useEffect(() => {
    setRows(null);
    setExpanded(false);
    void load();
  }, [load]);

  const inferred: TareaActivityRow[] =
    rows && rows.length === 0
      ? [{
          id: "inferred-created", kind: "created", payload: null, message: null,
          actorId: task.createdBy, createdAt: task.createdAt,
        }]
      : rows ?? [];

  const visible = compact && !expanded ? inferred.slice(-3) : inferred;
  const canExpand = Boolean(compact && inferred.length > 3 && !expanded);

  const submit = async () => {
    const msg = comment.trim();
    if (!msg || saving) return;
    setSaving(true);
    const res = await fetch(`/api/crm/tasks/${task.id}/activity`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message: msg }),
    }).catch(() => null);
    setSaving(false);
    if (!res?.ok) return;
    setComment("");
    void load();
  };

  return (
    <div className="space-y-2">
      <span className="px-1 text-[12px] font-medium text-ds-text-4">Actividad</span>
      {rows === null ? (
        <div className="flex justify-center py-4"><Spinner size="sm" /></div>
      ) : visible.length === 0 ? (
        <EmptyState icon={MessageSquare} title="Sin actividad" description="Aún no hay eventos." />
      ) : (
        <ul className="space-y-2">
          {visible.map((row) => (
            <li key={row.id} className="opai-glass-soft rounded-xl px-3 py-2">
              <p className={cn("text-[13px] text-ds-text-1", row.kind === "comment" && "whitespace-pre-wrap")}>
                {activityKindLabel(row, nameById)}
              </p>
              <p className="mt-0.5 text-[12px] text-ds-text-4">{formatActivityChile(row.createdAt)}</p>
            </li>
          ))}
        </ul>
      )}
      {canExpand && (
        <button type="button" onClick={() => setExpanded(true)} className="text-[13px] text-primary hover:underline">
          Ver toda la actividad
        </button>
      )}
      {canEdit && (
        <div className="flex gap-2 pt-1">
          <input
            value={comment}
            onChange={(e) => setComment(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") void submit(); }}
            maxLength={2000}
            placeholder="Agregar comentario…"
            aria-label="Comentario"
            className="h-10 min-h-[44px] flex-1 rounded-xl border border-ds-border-default bg-ds-surface-1 px-3 text-[13px] text-ds-text-1 opai-glass-soft sm:min-h-0"
          />
          <button
            type="button"
            disabled={!comment.trim() || saving}
            onClick={() => void submit()}
            className="h-10 min-h-[44px] rounded-xl bg-primary px-3 text-[13px] font-medium text-primary-foreground disabled:opacity-50 sm:min-h-0"
          >
            Enviar
          </button>
        </div>
      )}
    </div>
  );
}
