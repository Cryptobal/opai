"use client";

import { LogIn, LogOut, Shield, Settings, Users, Bell, AlertTriangle, BarChart3 } from "lucide-react";
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
    default:
      return Settings;
  }
}

/** Event types that link to the monitoring page */
const MONITOREO_EVENT_TYPES = new Set([
  "guard_no_viene",
  "cobertura_snapshot",
]);

/**
 * System message component.
 * Displayed centered with a visible, italic style and an event-specific icon.
 * Operational events (cobertura, no_viene) link to the monitoring page.
 */
export function ChatMessageSystem({ message }: ChatMessageSystemProps) {
  const Icon = getSystemIcon(message.systemEventType);
  const isMonitoreoEvent = MONITOREO_EVENT_TYPES.has(message.systemEventType ?? "");
  const isAlert = message.systemEventType === "guard_no_viene";

  const bgClass = isAlert
    ? "bg-red-500/10 border-red-500/20"
    : isMonitoreoEvent
      ? "bg-sky-500/8 border-sky-500/15"
      : "bg-white/[0.06] border-white/[0.10]";

  const iconColor = isAlert
    ? "text-red-400"
    : isMonitoreoEvent
      ? "text-sky-400"
      : "text-slate-400";

  const textColor = isAlert
    ? "text-red-300/90"
    : isMonitoreoEvent
      ? "text-sky-300/90"
      : "text-slate-300/70";

  const inner = (
    <div
      className={`flex items-start gap-2.5 py-2.5 my-1 mx-auto max-w-lg rounded-lg border px-4 ${bgClass} ${isMonitoreoEvent ? "cursor-pointer hover:brightness-110 transition-all" : ""}`}
    >
      <Icon className={`h-3.5 w-3.5 mt-0.5 shrink-0 ${iconColor}`} />
      <p className={`text-xs leading-relaxed whitespace-pre-wrap ${textColor}`}>
        {message.content}
      </p>
    </div>
  );

  if (isMonitoreoEvent) {
    return (
      <Link href="/ops/rondas/monitoreo" className="block no-underline">
        {inner}
      </Link>
    );
  }

  return inner;
}
