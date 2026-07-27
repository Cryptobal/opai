"use client";

/**
 * Tarjeta de tareas del home de Productividad.
 * GET /api/crm/tasks (abiertas del usuario) + PATCH para completar.
 * Agrupa con groupTasksByDue (TZ Chile): Vencidas → Hoy → Mañana → Esta semana.
 */

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { ChevronRight, ClipboardList } from "lucide-react";
import { toast } from "sonner";
import { EmptyState, Surface, Spinner, Tag } from "@/components/opai-ds";
import { cn } from "@/lib/utils";
import {
  groupTasksByDue,
  type TareaBucket,
} from "@/modules/tareas/tareas.service";
import type { TareaItem } from "./types";
import { TareaHubRow } from "./TareaHubRow";

const HOME_BUCKETS: TareaBucket[] = ["vencidas", "hoy", "manana", "semana"];
const MOBILE_VISIBLE = 4;
const DESKTOP_VISIBLE = 8;

function HeaderRow({ total, overdue }: { total: number; overdue: number }) {
  const badge =
    total > 0 ? (
      <Tag variant={overdue > 0 ? "danger" : "neutral"} size="sm" className="shrink-0">
        {total}
      </Tag>
    ) : null;

  return (
    <>
      <Link
        href="/opai/tareas"
        aria-label="Ver todas las tareas"
        className="flex min-h-11 min-w-0 items-center gap-2 lg:hidden"
      >
        <ClipboardList className="h-4 w-4 shrink-0 text-primary" />
        <p className="min-w-0 truncate font-display text-sm font-semibold text-ds-text-1">
          Tareas
        </p>
        {badge}
        <span className="ml-auto flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-ds-border-subtle bg-ds-surface-2 text-ds-text-3">
          <ChevronRight className="h-4 w-4" />
        </span>
      </Link>
      <div className="hidden min-w-0 items-center gap-2 lg:flex">
        <ClipboardList className="h-4 w-4 shrink-0 text-primary" />
        <p className="truncate font-display text-sm font-semibold text-ds-text-1">Tareas</p>
        {badge}
      </div>
    </>
  );
}

export function TareasHubCard({
  currentUserId,
  canEdit,
  className,
}: {
  currentUserId: string;
  canEdit: boolean;
  className?: string;
}) {
  const [tasks, setTasks] = useState<TareaItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [pendingId, setPendingId] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    fetch(
      `/api/crm/tasks?status=open&assigneeId=${encodeURIComponent(currentUserId)}&limit=50`,
    )
      .then((r) => r.json())
      .then((j) => {
        if (!cancelled) setTasks(Array.isArray(j.data) ? j.data : []);
      })
      .catch(() => {
        if (!cancelled) setTasks([]);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [currentUserId]);

  const complete = useCallback(
    async (task: TareaItem) => {
      if (!canEdit || pendingId) return;
      const snapshot = tasks;
      setPendingId(task.id);
      setTasks((prev) => prev.filter((t) => t.id !== task.id));
      const res = await fetch(`/api/crm/tasks/${task.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "done" }),
      }).catch(() => null);
      if (!res?.ok) {
        setTasks(snapshot);
        toast.error("No se pudo completar la tarea");
      }
      setPendingId(null);
    },
    [canEdit, pendingId, tasks],
  );

  const groups = groupTasksByDue(tasks).filter((g) => HOME_BUCKETS.includes(g.bucket));
  const flat = groups.flatMap((g) =>
    g.tasks.map((t) => ({ task: t, bucket: g.bucket, label: g.label })),
  );
  const visible = flat.slice(0, DESKTOP_VISIBLE);
  const overdue = groups.find((g) => g.bucket === "vencidas")?.tasks.length ?? 0;

  return (
    <Surface elevation={1} padding="md" className={cn("min-w-0 space-y-3", className)}>
      <HeaderRow total={flat.length} overdue={overdue} />

      {loading ? (
        <div className="flex min-h-32 items-center justify-center">
          <Spinner />
        </div>
      ) : flat.length === 0 ? (
        <EmptyState
          icon={ClipboardList}
          title="Sin tareas abiertas"
          description="No tienes tareas pendientes con vencimiento próximo."
          compact
        />
      ) : (
        <>
          <ul className="ds-list-cascade space-y-0.5">
            {visible.map(({ task, bucket, label }, idx) => (
              <li
                key={task.id}
                className={cn("min-w-0", idx >= MOBILE_VISIBLE && "hidden lg:block")}
              >
                <TareaHubRow
                  task={task}
                  bucket={bucket}
                  bucketLabel={label}
                  canEdit={canEdit}
                  pending={pendingId === task.id}
                  onComplete={(t) => void complete(t)}
                />
              </li>
            ))}
          </ul>
          {flat.length > MOBILE_VISIBLE && (
            <Link
              href="/opai/tareas"
              className="flex min-h-11 w-full items-center justify-center rounded-ds-md text-[13px] font-medium text-primary transition-colors hover:bg-ds-surface-2 lg:hidden"
            >
              Ver todas las tareas
            </Link>
          )}
          {flat.length > DESKTOP_VISIBLE && (
            <Link
              href="/opai/tareas"
              className="hidden min-h-11 w-full items-center justify-center rounded-ds-md text-[13px] font-medium text-primary transition-colors hover:bg-ds-surface-2 lg:flex"
            >
              Ver todas las tareas
            </Link>
          )}
        </>
      )}
    </Surface>
  );
}
