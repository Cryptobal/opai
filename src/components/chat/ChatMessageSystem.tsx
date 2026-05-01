"use client";

import { LogIn, LogOut, Shield, Settings, Users, Bell, AlertTriangle, BarChart3, CheckCircle, HelpCircle } from "lucide-react";
import Link from "next/link";
import type { ChatMessageData } from "@/lib/chat-types";

interface ChatMessageSystemProps {
  message: ChatMessageData;
}

/**
 * Returns an icon component based on the system event type.
 */
function getSystemIcon(eventType: string | null) {
  switch (eventType) {
    case "member_joined":
      return LogIn;
    case "member_left":
      return LogOut;
    case "channel_created":
      return Users;
    case "role_changed":
      return Shield;
    case "settings_changed":
      return Settings;
    case "notification":
      return Bell;
    case "guard_no_viene":
      return AlertTriangle;
    case "cobertura_snapshot":
      return BarChart3;
    case "alerta_cobertura":
      return AlertTriangle;
    case "alerta_cobertura_aceptada":
      return CheckCircle;
    case "alerta_cobertura_confirmar":
      return HelpCircle;
    default:
      return Settings;
  }
}

/** Event types that link to the monitoring page */
const MONITOREO_EVENT_TYPES = new Set([
  "guard_no_viene",
  "cobertura_snapshot",
]);

/** Event types that link to the alerta de cobertura detail */
const ALERTA_COBERTURA_EVENT_TYPES = new Set([
  "alerta_cobertura",
  "alerta_cobertura_aceptada",
  "alerta_cobertura_confirmar",
]);

/**
 * Format time from ISO string to HH:MM.
 */
function formatTime(dateStr: string): string {
  const date = new Date(dateStr);
  return `${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`;
}

/**
 * System message component.
 * Displayed centered with a visible, italic style and an event-specific icon.
 * Operational events (cobertura, no_viene) link to the monitoring page.
 */
export function ChatMessageSystem({ message }: ChatMessageSystemProps) {
  const Icon = getSystemIcon(message.systemEventType);
  const isMonitoreoEvent = MONITOREO_EVENT_TYPES.has(message.systemEventType ?? "");
  const isAlertaCoberturaEvent = ALERTA_COBERTURA_EVENT_TYPES.has(message.systemEventType ?? "");
  const isAlert = message.systemEventType === "guard_no_viene";
  const isAlertaCobertura = message.systemEventType === "alerta_cobertura";
  const isAlertaAceptada = message.systemEventType === "alerta_cobertura_aceptada";
  const isLinkable = isMonitoreoEvent || isAlertaCoberturaEvent;

  const bgClass = isAlert
    ? "bg-status-danger-soft border-status-danger-border"
    : isAlertaCobertura
      ? "bg-status-warn-soft border-status-warn-border"
      : isAlertaAceptada
        ? "bg-status-ok-soft border-green-500/20"
        : isAlertaCoberturaEvent
          ? "bg-blue-500/8 border-blue-500/15"
          : isMonitoreoEvent
            ? "bg-sky-500/8 border-sky-500/15"
            : "bg-white/[0.06] border-white/[0.10]";

  const iconColor = isAlert
    ? "text-status-danger-fg"
    : isAlertaCobertura
      ? "text-status-warn-fg"
      : isAlertaAceptada
        ? "text-status-ok-fg"
        : isAlertaCoberturaEvent
          ? "text-status-info-fg"
          : isMonitoreoEvent
            ? "text-status-info-fg"
            : "text-slate-400";

  const textColor = isAlert
    ? "text-red-300/90"
    : isAlertaCobertura
      ? "text-amber-300/90"
      : isAlertaAceptada
        ? "text-green-300/90"
        : isAlertaCoberturaEvent
          ? "text-blue-300/90"
          : isMonitoreoEvent
            ? "text-sky-300/90"
            : "text-slate-300/70";

  const inner = (
    <div
      className={`flex flex-col gap-1.5 py-2 my-1 mx-auto max-w-lg rounded-lg border px-4 ${bgClass} ${isLinkable ? "cursor-pointer hover:brightness-110 transition-all" : ""}`}
    >
      <div className="flex items-start gap-2.5">
        <Icon className={`h-3.5 w-3.5 mt-0.5 shrink-0 ${iconColor}`} />
        <p className={`flex-1 text-xs leading-relaxed whitespace-pre-wrap ${textColor}`}>
          {message.content}
        </p>
      </div>
      <div className="flex justify-end">
        <span className="text-[10px] text-[rgba(255,255,255,0.35)] select-none">
          {formatTime(message.createdAt)}
        </span>
      </div>
    </div>
  );

  if (isMonitoreoEvent) {
    return (
      <Link href="/ops/rondas/monitoreo" className="block no-underline">
        {inner}
      </Link>
    );
  }

  if (isAlertaCoberturaEvent) {
    const alertaLink = (message.systemEventData as Record<string, unknown>)?.link as string | undefined;
    return (
      <Link href={alertaLink || "/ops/alertas-cobertura"} className="block no-underline">
        {inner}
      </Link>
    );
  }

  return inner;
}
