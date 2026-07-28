"use client";

/**
 * Tarjeta de tareas del home de Productividad.
 * GET /api/crm/tasks (abiertas del usuario) + PATCH para completar.
 */

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { CheckCircle2, ChevronRight, ClipboardList } from "lucide-react";
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
const DENSE_BUCKETS: TareaBucket[] = ["hoy", "semana"];
const MOBILE_VISIBLE = 4;
const DESKTOP_VISIBLE = 8;

function HeaderRow({
  total,
  overdue,
  dense,
}: {
  total: number;
  overdue: number;
  dense?: boolean;
}) {
  const badge =
    total > 0 ? (
      <Tag variant={overdue > 0 ? "danger" : "neutral"} size="sm" className="shrink-0">
        {total} abiertas
      </Tag>
    ) : (
      dense && (
        <Tag variant="ok" size="sm" className="shrink-0">
          Al día
        </Tag>
      )
    );

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
  variant = "default",
  onCountChange,
}: {
  currentUserId: string;
  canEdit: boolean;
  className?: string;
  variant?: "default" | "dense";
  onCountChange?: (count: number) => void;
}) {
  const [tasks, setTasks] = useState<TareaItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [pendingId, setPendingId] = useState<string | null>(null);
  const dense = variant === "dense";

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

  useEffect(() => {
    onCountChange?.(tasks.length);
  }, [tasks.length, onCountChange]);

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
  const denseGroups = groups.filter((g) => DENSE_BUCKETS.includes(g.bucket) || g.bucket === "manana");

  return (
    <Surface
      elevation={1}
      padding="md"
      className={cn(
        dense ? "flex min-h-0 min-w-0 flex-col gap-3" : "min-w-0 space-y-3",
        className,
      )}
    >
      <HeaderRow total={flat.length} overdue={overdue} dense={dense} />

      {loading ? (
        <div className="flex min-h-32 items-center justify-center">
          <Spinner />
        </div>
      ) : dense ? (
        <>
          <div className="min-h-0 flex-1 space-y-3 overflow-auto">
            {overdue === 0 && (
              <div className="flex items-center gap-2 rounded-lg bg-status-ok-soft px-2.5 py-2 text-[13px] text-status-ok-fg">
                <CheckCircle2 className="h-4 w-4 shrink-0" />
                Sin tareas vencidas
              </div>
            )}
            {overdue > 0 && (
              <div>
                <p className="mb-1 px-1 text-[12px] uppercase tracking-wide text-status-danger-fg">
                  Vencidas
                </p>
                <ul className="space-y-0.5">
                  {groups
                    .find((g) => g.bucket === "vencidas")
                    ?.tasks.map((task) => (
                      <li key={task.id}>
                        <TareaHubRow
                          task={task}
                          bucket="vencidas"
                          bucketLabel="Vencidas"
                          canEdit={canEdit}
                          pending={pendingId === task.id}
                          onComplete={(t) => void complete(t)}
                        />
                      </li>
                    ))}
                </ul>
              </div>
            )}
            {denseGroups.map((g) => (
              <div key={g.bucket}>
                <p className="mb-1 px-1 text-[12px] uppercase tracking-wide text-ds-text-4">
                  {g.bucket === "hoy"
                    ? "Hoy"
                    : g.bucket === "manana"
                      ? "Mañana"
                      : "Esta semana"}
                </p>
                <ul className="space-y-0.5">
                  {g.tasks.map((task) => (
                    <li key={task.id}>
                      <TareaHubRow
                        task={task}
                        bucket={g.bucket}
                        bucketLabel={g.label}
                        canEdit={canEdit}
                        pending={pendingId === task.id}
                        onComplete={(t) => void complete(t)}
                      />
                    </li>
                  ))}
                </ul>
              </div>
            ))}
            {flat.length === 0 && (
              <EmptyState
                icon={ClipboardList}
                title="Sin tareas abiertas"
                description="No tienes pendientes próximos."
                compact
              />
            )}
          </div>
          <Link
            href="/opai/tareas"
            className="flex min-h-11 shrink-0 items-center justify-center rounded-ds-md text-[13px] font-medium text-primary transition-colors hover:bg-ds-surface-2"
          >
            Ver todas
          </Link>
        </>
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
