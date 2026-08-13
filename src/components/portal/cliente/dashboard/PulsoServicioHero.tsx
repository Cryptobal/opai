"use client";

import { useEffect, useState } from "react";
import { MapPin, MessageSquare } from "lucide-react";
import { cn } from "@/lib/utils";
import type {
  SummaryNextRound,
  SummaryOnDuty,
  SummaryRound24hSlot,
} from "@/lib/portal-cliente-types";

interface Props {
  compliance: number;
  onDuty: SummaryOnDuty | null;
  nextRound: SummaryNextRound | null;
  rounds24h: SummaryRound24hSlot[];
  lastRound?: { status: string; guardiaName: string | null } | null;
  onNavigate: (section: string) => void;
  onOpenLead?: () => void;
}

export function PulsoServicioHero({
  compliance, onDuty, nextRound, rounds24h, lastRound, onNavigate, onOpenLead,
}: Props) {
  const [shown, setShown] = useState(0);
  const [remain, setRemain] = useState<number | null>(null);
  const circ = 2 * Math.PI * 36;

  useEffect(() => {
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduce) { setShown(compliance); return; }
    const start = performance.now();
    let raf = 0;
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / 900);
      setShown(Math.round((1 - (1 - t) ** 3) * compliance));
      if (t < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [compliance]);

  useEffect(() => {
    if (!nextRound?.scheduledAt) { setRemain(null); return; }
    const update = () => setRemain(new Date(nextRound.scheduledAt).getTime() - Date.now());
    update();
    const id = window.setInterval(update, 1000);
    return () => window.clearInterval(id);
  }, [nextRound?.scheduledAt]);

  const hhmm = (iso: string) =>
    new Date(iso).toLocaleTimeString("es-CL", { hour: "2-digit", minute: "2-digit" });
  const countdown = remain == null ? null : remain <= 0 ? "en curso"
    : remain >= 3600000
      ? `${Math.floor(remain / 3600000)}h ${Math.floor((remain % 3600000) / 60000)}m`
      : `${Math.max(0, Math.floor(remain / 60000))}m`;

  return (
    <div className="rounded-2xl border border-ds-border-subtle bg-ds-surface-1 p-4 sm:p-5">
      <div className="flex items-start gap-4">
        <svg viewBox="0 0 88 88" className="h-20 w-20 shrink-0 -rotate-90" aria-label={`Cumplimiento ${shown}%`}>
          <circle cx="44" cy="44" r="36" fill="none" stroke="hsl(var(--ds-border-subtle))" strokeWidth="7" />
          <circle cx="44" cy="44" r="36" fill="none" stroke="hsl(var(--primary))" strokeWidth="7" strokeLinecap="round"
            strokeDasharray={circ} strokeDashoffset={circ * (1 - shown / 100)} />
        </svg>
        <div className="min-w-0 flex-1">
          <p className="text-ds-caption font-mono uppercase tracking-[0.08em] text-ds-text-4">Pulso del servicio</p>
          {onDuty ? (
            <>
              <p className="mt-1 inline-flex items-center gap-1.5 text-ds-caption font-semibold uppercase tracking-wider text-status-ok-fg">
                <span className="relative flex h-2 w-2">
                  <span className="absolute inset-0 rounded-full bg-status-ok animate-ping motion-reduce:animate-none" />
                  <span className="relative h-2 w-2 rounded-full bg-status-ok" />
                </span>
                En servicio ahora
              </p>
              <p className="text-ds-title font-display text-ds-text-1 mt-0.5">{onDuty.guardName}</p>
              <p className="text-ds-caption font-mono text-ds-text-3">
                desde {hhmm(onDuty.shiftStart)}
                {onDuty.shiftEnd ? ` · hasta ${hhmm(onDuty.shiftEnd)}` : ""}
                {" · "}{onDuty.sinceMinutes} min en instalación
              </p>
            </>
          ) : lastRound ? (
            <>
              <p className="mt-1 text-ds-title font-display text-ds-text-1">Última ronda</p>
              <p className="text-ds-caption text-ds-text-3">
                {lastRound.status === "completada" ? "Completada" : lastRound.status}
                {lastRound.guardiaName ? ` · ${lastRound.guardiaName}` : ""}
              </p>
            </>
          ) : (
            <p className="mt-1 text-ds-body text-ds-text-3">Sin actividad reciente en esta instalación</p>
          )}
        </div>
        <p className="font-mono text-ds-heading text-ds-text-1 tabular-nums">{shown}%</p>
      </div>
      {rounds24h.length > 0 && (
        <div className="mt-4 flex items-center gap-1.5" aria-label="Rondas últimas 24 horas">
          {rounds24h.map((slot, i) => (
            <span key={`${slot.hour}-${i}`} title={`${String(slot.hour).padStart(2, "0")}:00`}
              className={cn("h-2.5 flex-1 rounded-full",
                slot.status === "ok" && "bg-status-ok",
                slot.status === "warn" && "bg-status-warn",
                slot.status === "now" && "bg-primary animate-pulse motion-reduce:animate-none",
                slot.status === "pending" && "bg-ds-surface-3")} />
          ))}
        </div>
      )}
      <div className="mt-4 flex flex-wrap items-center gap-2">
        {countdown && (
          <span className="text-ds-caption font-mono text-ds-text-3">
            Próxima ronda {countdown === "en curso" ? "en curso" : `en ${countdown}`}
            {nextRound ? ` · ${nextRound.checkpoints} CP` : ""}
          </span>
        )}
        <div className="ml-auto flex flex-wrap gap-2">
          <button type="button" onClick={() => onNavigate("rondas")}
            className="inline-flex items-center gap-1.5 min-h-11 px-3 rounded-full bg-primary/10 text-primary text-ds-caption font-medium">
            <MapPin className="h-4 w-4" /> Ver ronda en vivo
          </button>
          <button type="button" onClick={() => (onOpenLead ? onOpenLead() : onNavigate("chat"))}
            className="inline-flex items-center gap-1.5 min-h-11 px-3 rounded-full border border-ds-border-default text-ds-text-2 text-ds-caption font-medium">
            <MessageSquare className="h-4 w-4" /> Hablar con mi ejecutivo/a
          </button>
        </div>
      </div>
    </div>
  );
}
