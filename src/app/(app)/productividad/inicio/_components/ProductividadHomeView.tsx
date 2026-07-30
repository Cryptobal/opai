"use client";

import { useCallback, useMemo, useState } from "react";
import { AgendaHubCard } from "@/components/agenda/AgendaHubCard";
import { agendaItemDayKey } from "@/components/agenda/agenda-calendar-utils";
import { isHubTaskForUser } from "@/components/agenda/agenda-hub-item";
import { HubEmailProvider, useHubEmails } from "@/components/hub/hub-email-context";
import { RecentEmailCard } from "@/components/hub/RecentEmailCard";
import { TareasHubCard } from "@/components/tareas/TareasHubCard";
import { todayInChile } from "@/lib/dates-cl";
import { cn } from "@/lib/utils";
import { NextActionBar } from "./NextActionBar";
import { ProductividadDayHeader } from "./ProductividadDayHeader";
import { useAgendaHubItems } from "./use-agenda-hub-items";

export interface ProductividadHomePerms {
  hasAgenda: boolean;
  hasCorreos: boolean;
  hasTareas: boolean;
  canEditTareas: boolean;
}

type MobileTab = "hoy" | "correos" | "tareas";

/**
 * Home de la superficie Productividad — Mi día en 3 columnas (desktop)
 * o pila + segmentador (móvil).
 */
export function ProductividadHomeView({
  perms,
  currentUserId,
}: {
  perms: ProductividadHomePerms;
  currentUserId: string;
}) {
  const content = (
    <ProductividadHomeInner perms={perms} currentUserId={currentUserId} />
  );
  if (!perms.hasCorreos) return content;
  return <HubEmailProvider enabled>{content}</HubEmailProvider>;
}

function ProductividadHomeInner({
  perms,
  currentUserId,
}: {
  perms: ProductividadHomePerms;
  currentUserId: string;
}) {
  const agenda = useAgendaHubItems();
  const emails = useHubEmails();
  const [taskCount, setTaskCount] = useState(0);
  const [mobileTab, setMobileTab] = useState<MobileTab>(() => {
    if (perms.hasAgenda) return "hoy";
    if (perms.hasCorreos) return "correos";
    return "tareas";
  });

  const onTaskCount = useCallback((n: number) => setTaskCount(n), []);

  // Mi día: las tareas de Agenda deben coincidir con la columna Tareas (mías).
  // La API de agenda trae tareas del equipo entero; sin este filtro una tarea
  // de otro responsable aparece en Agenda y "falta" en Tareas.
  const myAgendaItems = useMemo(
    () => agenda.items.filter((i) => isHubTaskForUser(i, currentUserId)),
    [agenda.items, currentUserId],
  );

  const todayEventCount = useMemo(() => {
    const key = todayInChile();
    return myAgendaItems.filter((i) => {
      const day = agendaItemDayKey(i);
      return day === key || (i.source === "tarea" && day < key);
    }).length;
  }, [myAgendaItems]);

  const unreadCount = emails?.data?.unreadCount ?? 0;
  const colCount =
    Number(perms.hasAgenda) + Number(perms.hasCorreos) + Number(perms.hasTareas);

  const gridClass =
    colCount <= 1
      ? "lg:grid-cols-1"
      : colCount === 2
        ? "lg:grid-cols-2"
        : "lg:grid-cols-[1.05fr_1.35fr_0.95fr]";

  const tabs: { id: MobileTab; label: string; count: number; show: boolean }[] = [
    { id: "hoy", label: "Hoy", count: todayEventCount, show: perms.hasAgenda },
    { id: "correos", label: "Correos", count: unreadCount, show: perms.hasCorreos },
    { id: "tareas", label: "Tareas", count: taskCount, show: perms.hasTareas },
  ];

  return (
    <div
      className={cn(
        "ds-page-enter flex min-w-0 flex-col gap-3",
        // Desktop alto: una pantalla sin scroll de página. El offset se deriva de
        // --app-topbar-offset (topbar + safe-area) + 2.5rem del padding de página
        // (lg:pt-4 + lg:pb-6). En <800px de alto se permite scroll.
        "min-[800px]:lg:h-[calc(100dvh-var(--app-topbar-offset)-2.5rem)] min-[800px]:lg:min-h-0 min-[800px]:lg:overflow-hidden",
        "max-lg:pb-[env(safe-area-inset-bottom)]",
      )}
    >
      <ProductividadDayHeader
        eventCount={todayEventCount}
        unreadCount={perms.hasCorreos ? unreadCount : 0}
        openTaskCount={perms.hasTareas ? taskCount : 0}
      />

      {perms.hasAgenda && (
        <NextActionBar items={myAgendaItems} loading={agenda.loading} />
      )}

      {/* Segmentador móvil */}
      <div
        className="flex gap-1 rounded-xl bg-ds-surface-2 p-1 lg:hidden"
        role="tablist"
        aria-label="Secciones del día"
      >
        {tabs
          .filter((t) => t.show)
          .map((t) => (
            <button
              key={t.id}
              type="button"
              role="tab"
              aria-selected={mobileTab === t.id}
              onClick={() => setMobileTab(t.id)}
              className={cn(
                "flex min-h-11 flex-1 items-center justify-center gap-1.5 rounded-lg px-2 text-ds-body font-medium transition-colors",
                mobileTab === t.id
                  ? "bg-ds-surface-1 text-ds-text-1 shadow-sm"
                  : "text-ds-text-3",
              )}
            >
              {t.label}
              <span className="tabular-nums text-ds-text-4">{t.count}</span>
            </button>
          ))}
      </div>

      <div
        className={cn(
          "grid min-h-0 min-w-0 flex-1 grid-cols-1 gap-4",
          gridClass,
          // Móvil: solo la sección activa
          "max-lg:auto-rows-auto",
        )}
      >
        {perms.hasAgenda && (
          <div
            className={cn(
              "min-h-0 min-w-0",
              mobileTab !== "hoy" && "max-lg:hidden",
              "lg:flex lg:h-full lg:flex-col",
            )}
          >
            <AgendaHubCard
              variant="dense"
              items={myAgendaItems}
              loading={agenda.loading}
              expanded={agenda.expanded}
              onExpandedChange={(v) => agenda.setExpanded(v)}
              className="lg:h-full"
            />
          </div>
        )}
        {perms.hasCorreos && (
          <div
            className={cn(
              "min-h-0 min-w-0",
              mobileTab !== "correos" && "max-lg:hidden",
              "lg:flex lg:h-full lg:flex-col",
            )}
          >
            <RecentEmailCard variant="dense" className="lg:h-full" />
          </div>
        )}
        {perms.hasTareas && (
          <div
            className={cn(
              "min-h-0 min-w-0",
              mobileTab !== "tareas" && "max-lg:hidden",
              "lg:flex lg:h-full lg:flex-col",
            )}
          >
            <TareasHubCard
              currentUserId={currentUserId}
              canEdit={perms.canEditTareas}
              variant="dense"
              onCountChange={onTaskCount}
              className="lg:h-full"
            />
          </div>
        )}
      </div>
    </div>
  );
}
