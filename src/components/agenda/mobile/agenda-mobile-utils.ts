"use client";

import { useEffect, useState } from "react";
import { CHILE_TZ, todayInChile } from "@/lib/dates-cl";
import type { AgendaCalendarItem } from "../agenda-calendar.types";

export type AgendaMobileView = "agenda" | "day" | "month";

const PREFS_KEY = "opai-agenda-prefs-mobile";

export type AgendaMobilePrefs = { view: AgendaMobileView; date: string };

/** Prefs móviles con clave propia (fix B13): elegir vista en desktop no afecta móvil. */
export function readMobilePrefs(): AgendaMobilePrefs {
  const fallback: AgendaMobilePrefs = { view: "agenda", date: todayInChile() };
  if (typeof window === "undefined") return fallback;
  try {
    const raw = window.localStorage.getItem(PREFS_KEY);
    if (!raw) return fallback;
    const parsed = JSON.parse(raw) as Partial<AgendaMobilePrefs>;
    const view =
      parsed.view && ["agenda", "day", "month"].includes(parsed.view)
        ? parsed.view
        : "agenda";
    return { view, date: todayInChile() };
  } catch {
    return fallback;
  }
}

export function writeMobilePrefs(prefs: AgendaMobilePrefs): void {
  try {
    window.localStorage.setItem(PREFS_KEY, JSON.stringify(prefs));
  } catch {
    // storage lleno/bloqueado: prefs efímeras
  }
}

/** `< lg` con init síncrono (la página suspende en SSR, no hay mismatch). */
export function useIsMobileAgenda(): boolean {
  const [isMobile, setIsMobile] = useState(
    () =>
      typeof window !== "undefined" &&
      window.matchMedia("(max-width: 1023px)").matches,
  );
  useEffect(() => {
    const mq = window.matchMedia("(max-width: 1023px)");
    const update = () => setIsMobile(mq.matches);
    mq.addEventListener("change", update);
    return () => mq.removeEventListener("change", update);
  }, []);
  return isMobile;
}

export function hhmmChile(iso: string): string {
  return new Date(iso).toLocaleTimeString("es-CL", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZone: CHILE_TZ,
  });
}

/** Barra vertical de color semántico por tipo (spec §2). */
export function typeBarClass(item: Pick<AgendaCalendarItem, "source" | "type">): string {
  if (item.source === "tarea") return "bg-primary";
  if (item.source === "google") return "bg-ds-text-4";
  if (item.type === "cliente") return "bg-tint-violet-fg";
  if (item.type === "tecnica") return "bg-status-ok-fg";
  if (item.type === "supervision") return "bg-status-warn-fg";
  if (item.type === "licitacion") return "bg-status-danger-fg";
  return "bg-ds-text-4";
}

export const TYPE_LABELS: Record<string, string> = {
  cliente: "Cliente",
  tecnica: "Técnica",
  supervision: "Supervisión",
  otra: "Visita",
  licitacion: "Licitación",
  google: "Google",
  tarea: "Tarea",
};

export function mobileTypeLabel(item: Pick<AgendaCalendarItem, "source" | "type">): string {
  if (item.source === "tarea") return "Tarea";
  if (item.source === "google") return "Google";
  return TYPE_LABELS[item.type] ?? "Evento";
}

/** Etiqueta de día para headers/strip: "MIÉ", "22". */
export function dayParts(ymd: string): { weekday: string; day: string } {
  const d = new Date(`${ymd}T12:00:00Z`);
  const weekday = d
    .toLocaleDateString("es-CL", { weekday: "short", timeZone: "UTC" })
    .replace(".", "");
  return { weekday, day: String(d.getUTCDate()) };
}

export function monthTitle(ymd: string): { month: string; year: string } {
  const d = new Date(`${ymd}T12:00:00Z`);
  const month = d.toLocaleDateString("es-CL", { month: "long", timeZone: "UTC" });
  return { month: month.charAt(0).toUpperCase() + month.slice(1), year: String(d.getUTCFullYear()) };
}

/** Desplaza `ymd` `delta` meses conservando el día (clamp a fin de mes). */
export function addMonthsYmd(ymd: string, delta: number): string {
  const [y, m, d] = ymd.split("-").map(Number);
  const total = y * 12 + (m - 1) + delta;
  const ny = Math.floor(total / 12);
  const nm = (total % 12 + 12) % 12; // 0-based mes destino
  const lastDay = new Date(Date.UTC(ny, nm + 1, 0)).getUTCDate();
  const nd = Math.min(d, lastDay);
  return `${ny}-${String(nm + 1).padStart(2, "0")}-${String(nd).padStart(2, "0")}`;
}

/** Header de día en la lista: "HOY · MIÉRCOLES 22" / "JUEVES 23". */
export function listDayLabel(ymd: string): string {
  const today = todayInChile();
  const d = new Date(`${ymd}T12:00:00Z`);
  const long = d
    .toLocaleDateString("es-CL", { weekday: "long", day: "numeric", timeZone: "UTC" })
    .toUpperCase();
  return ymd === today ? `HOY · ${long}` : long;
}
