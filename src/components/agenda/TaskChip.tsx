"use client";

import Link from "next/link";
import { CheckCircle2 } from "lucide-react";

type Props = { title: string; start: string; allDay: boolean; href: string | null };

/** Chip de tarea en la agenda: distinto de visitas/licitaciones; abre el origen. */
export function TaskChip({ title, start, allDay, href }: Props) {
  const time = allDay
    ? "Todo el día"
    : new Date(start).toLocaleTimeString("es-CL", { hour: "2-digit", minute: "2-digit" });
  const inner = (
    <div className="w-full rounded-xl border border-primary/30 bg-primary/10 px-2 py-1.5 text-left text-[12px] text-ds-text-1">
      <div className="flex items-center gap-1 text-primary">
        <CheckCircle2 className="h-3.5 w-3.5 shrink-0" />
        <span className="font-medium">{time}</span>
      </div>
      <p className="truncate">{title}</p>
    </div>
  );
  return href ? (
    <Link href={href} className="block ds-tap">
      {inner}
    </Link>
  ) : (
    inner
  );
}
