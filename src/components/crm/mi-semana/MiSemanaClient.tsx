"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { CalendarDays, ChevronRight, Square } from "lucide-react";
import { EmptyState, Spinner } from "@/components/opai-ds";

type AgendaItem = {
  id: string;
  source: "task";
  title: string;
  dueAt: string | null;
  allDay: boolean;
  context: string | null;
  href: string | null;
};

const ORDER = ["Atrasadas", "Hoy", "Mañana", "Esta semana", "Más adelante", "Sin fecha"] as const;

/** Bucket por día en zona local del navegador (la del usuario). */
function bucketOf(dueAt: string | null): (typeof ORDER)[number] {
  if (!dueAt) return "Sin fecha";
  const d = new Date(dueAt);
  const now = new Date();
  const startToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const dueDay = new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  const diff = Math.round((dueDay - startToday) / 86400000);
  if (diff < 0) return "Atrasadas";
  if (diff === 0) return "Hoy";
  if (diff === 1) return "Mañana";
  if (diff <= 7) return "Esta semana";
  return "Más adelante";
}

function fmtDue(iso: string | null, allDay: boolean): string {
  if (!iso) return "";
  const d = new Date(iso);
  const day = d.toLocaleDateString("es-CL", { weekday: "short", day: "2-digit", month: "short" });
  return allDay ? day : `${day} ${d.toLocaleTimeString("es-CL", { hour: "2-digit", minute: "2-digit" })}`;
}

export function MiSemanaClient() {
  const [items, setItems] = useState<AgendaItem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/crm/mi-semana")
      .then((r) => r.json())
      .then((d) => setItems(d.items ?? []))
      .catch(() => setItems([]))
      .finally(() => setLoading(false));
  }, []);

  async function complete(it: AgendaItem) {
    setItems((p) => p.filter((x) => x.id !== it.id));
    await fetch(`/api/crm/tasks/${it.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: "done" }),
    }).catch(() => undefined);
  }

  const groups = ORDER.map((b) => ({ bucket: b, list: items.filter((i) => bucketOf(i.dueAt) === b) })).filter(
    (g) => g.list.length > 0,
  );

  return (
    <div className="ds-page-enter space-y-5">
      {loading ? (
        <Spinner className="mx-auto" />
      ) : groups.length === 0 ? (
        <EmptyState icon={CalendarDays} title="Nada pendiente" description="Agendá tareas desde un correo o negocio." />
      ) : (
        <div className="space-y-5">
          {groups.map((g) => (
            <section key={g.bucket} className="space-y-1.5">
              <h2
                className={`text-[12px] font-semibold uppercase tracking-wide ${
                  g.bucket === "Atrasadas" ? "text-status-danger-fg" : "text-ds-text-3"
                }`}
              >
                {g.bucket} · {g.list.length}
              </h2>
              <ul className="space-y-1">
                {g.list.map((it) => (
                  <li
                    key={`${it.source}-${it.id}`}
                    className="flex items-center gap-2.5 rounded-xl border border-ds-border-subtle bg-ds-surface-1 px-3 py-2.5"
                  >
                    <button
                      type="button"
                      onClick={() => void complete(it)}
                      aria-label="Completar"
                      className="shrink-0 text-ds-text-3 ds-tap hover:text-status-ok-fg"
                    >
                      <Square className="h-5 w-5" />
                    </button>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-[13px] font-medium text-ds-text-1">{it.title}</p>
                      <div className="flex items-center gap-1.5 text-[12px] text-ds-text-4">
                        {it.context && <span className="truncate">{it.context}</span>}
                        {it.dueAt && <span className="shrink-0">· {fmtDue(it.dueAt, it.allDay)}</span>}
                      </div>
                    </div>
                    {it.href && (
                      <Link href={it.href} aria-label="Abrir" className="shrink-0 text-ds-text-4 ds-tap hover:text-ds-text-2">
                        <ChevronRight className="h-5 w-5" />
                      </Link>
                    )}
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>
      )}
    </div>
  );
}
