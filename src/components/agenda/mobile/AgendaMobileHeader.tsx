"use client";

import { useEffect, useRef, useState } from "react";
import { ChevronDown, SlidersHorizontal } from "lucide-react";
import { cn } from "@/lib/utils";
import { useSetIslandModuleMenu } from "@/components/opai-ds";
import { addDaysChile, todayInChile, ymdInChile } from "@/lib/dates-cl";
import { dateAtChileSlot } from "../agenda-calendar-utils";
import { dayParts, monthTitle, type AgendaMobileView } from "./agenda-mobile-utils";

type Props = {
  view: AgendaMobileView;
  selectedYmd: string;
  daysWithEvents: Set<string>;
  filterCount: number;
  onOpenViewSheet: () => void;
  onSelectDate: (ymd: string) => void;
  onToday: () => void;
  onOpenFilters: () => void;
};

/**
 * Header compacto sticky (v3.1). El mes es el título tappable (abre el sheet de
 * vista/mes) y "Hoy" un pill compacto; el segmented se movió al sheet. Lo único
 * persistente abajo es la tira de días, que colapsa al hacer scroll (umbral
 * 26px) y vuelve cerca del tope (10px). Chrome ~208px → ~104px.
 */
export function AgendaMobileHeader({
  view,
  selectedYmd,
  daysWithEvents,
  filterCount,
  onOpenViewSheet,
  onSelectDate,
  onToday,
  onOpenFilters,
}: Props) {
  const { month, year } = monthTitle(selectedYmd);
  const today = todayInChile();
  const stripRef = useRef<HTMLDivElement>(null);
  const headerRef = useRef<HTMLElement>(null);
  const [collapsed, setCollapsed] = useState(false);

  // Filtros viven en la isla global (Zona C'), no en el header local.
  useSetIslandModuleMenu({
    icon: SlidersHorizontal,
    label: "Filtros",
    badge: filterCount > 0 ? filterCount : undefined,
    onOpen: onOpenFilters,
  });

  // Publica la altura real del header para los day-headers sticky de la lista.
  useEffect(() => {
    const el = headerRef.current;
    if (!el) return;
    const update = () =>
      document.documentElement.style.setProperty(
        "--agenda-mobile-header-h",
        `${el.offsetHeight}px`,
      );
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => {
      ro.disconnect();
      document.documentElement.style.removeProperty("--agenda-mobile-header-h");
    };
  }, []);

  // Colapso de la tira por scroll con histéresis (26px baja / 10px sube): sin
  // parpadeo en scroll rápido. rAF para no forzar layout en cada evento.
  useEffect(() => {
    let raf = 0;
    const onScroll = () => {
      if (raf) return;
      raf = requestAnimationFrame(() => {
        raf = 0;
        const y = window.scrollY;
        setCollapsed((prev) => (prev ? y > 10 : y > 26));
      });
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      window.removeEventListener("scroll", onScroll);
      if (raf) cancelAnimationFrame(raf);
    };
  }, []);

  // Tira: 3 días atrás → 18 adelante, centrada en la fecha seleccionada.
  const stripDays: string[] = [];
  const base = dateAtChileSlot(selectedYmd, 12 * 60);
  for (let i = -3; i <= 18; i++) stripDays.push(ymdInChile(addDaysChile(base, i)));

  useEffect(() => {
    const el = stripRef.current?.querySelector<HTMLElement>("[data-selected='true']");
    el?.scrollIntoView({ inline: "center", block: "nearest" });
  }, [selectedYmd, view]);

  const showStrip = view === "agenda";

  return (
    <header
      ref={headerRef}
      className="opai-glass-strong sticky top-[calc(env(safe-area-inset-top)+4rem)] z-20 rounded-[26px] px-3 pb-2 pt-2 [transform:translateZ(0)]"
    >
      <div className="flex items-center justify-between gap-2">
        <button
          type="button"
          onClick={onOpenViewSheet}
          aria-label="Cambiar vista o mes"
          className="flex min-h-11 items-center gap-1 rounded-xl pr-1 text-left ds-tap"
        >
          <span className="font-display text-[19px] font-semibold leading-tight text-ds-text-1">
            {month} <span className="font-mono text-[12px] font-normal text-ds-text-3">{year}</span>
          </span>
          <ChevronDown className="h-4 w-4 shrink-0 text-ds-text-3" />
        </button>
        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={onToday}
            className="h-11 rounded-full border border-ds-border-default px-3 text-[13px] font-medium text-ds-text-2 ds-tap"
          >
            Hoy
          </button>
        </div>
      </div>

      {showStrip && (
        <div
          aria-hidden={collapsed}
          className={cn(
            "grid transition-[grid-template-rows,opacity] duration-200 ease-out motion-reduce:transition-none",
            collapsed ? "grid-rows-[0fr] opacity-0" : "grid-rows-[1fr] opacity-100",
          )}
        >
          <div className="overflow-hidden">
            <div
              ref={stripRef}
              className="mt-2 flex snap-x snap-mandatory gap-1.5 overflow-x-auto pb-1 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
            >
              {stripDays.map((ymd) => {
                const { weekday, day } = dayParts(ymd);
                const selected = ymd === selectedYmd;
                const isToday = ymd === today;
                return (
                  <button
                    key={ymd}
                    type="button"
                    data-selected={selected}
                    onClick={() => onSelectDate(ymd)}
                    className={cn(
                      "flex h-[58px] w-[46px] shrink-0 snap-center flex-col items-center justify-center gap-0.5 rounded-[16px] ds-tap",
                      selected
                        ? "bg-primary text-primary-foreground"
                        : isToday
                          ? "border border-primary/50 text-ds-text-1"
                          : "opai-glass-soft text-ds-text-2",
                    )}
                  >
                    <span className="text-[12px] uppercase leading-none">{weekday}</span>
                    <span className="font-mono text-[15px] font-semibold leading-none">{day}</span>
                    <span
                      className={cn(
                        "h-1 w-1 rounded-full",
                        daysWithEvents.has(ymd)
                          ? selected
                            ? "bg-primary-foreground"
                            : "bg-primary"
                          : "bg-transparent",
                      )}
                    />
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      )}
    </header>
  );
}
