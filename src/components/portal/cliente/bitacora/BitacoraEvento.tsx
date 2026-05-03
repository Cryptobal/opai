"use client";

import {
  MapPin,
  LogIn,
  LogOut,
  Ticket,
  CheckCircle2,
  Eye,
  AlertTriangle,
} from "lucide-react";

export interface TimelineEvent {
  id: string;
  type: string;
  timestamp: string;
  installationId: string | null;
  installationName: string | null;
  title: string;
  detail: string | null;
  icon: string;
  severity: "info" | "success" | "warning" | "critical";
  guardiaName: string | null;
  link: string | null;
}

const ICON_MAP: Record<string, React.ComponentType<{ className?: string }>> = {
  MapPin,
  LogIn,
  LogOut,
  Ticket,
  CheckCircle2,
  Eye,
  AlertTriangle,
};

const SEVERITY_TONES: Record<
  TimelineEvent["severity"],
  { bg: string; dot: string; icon: string }
> = {
  info: {
    bg: "bg-white/[0.02]",
    dot: "bg-zinc-500",
    icon: "text-zinc-400",
  },
  success: {
    bg: "bg-status-ok-soft/30",
    dot: "bg-status-ok",
    icon: "text-status-ok-fg",
  },
  warning: {
    bg: "bg-status-warn-soft/30",
    dot: "bg-status-warn",
    icon: "text-status-warn-fg",
  },
  critical: {
    bg: "bg-status-danger-soft/30",
    dot: "bg-status-danger",
    icon: "text-status-danger-fg",
  },
};

export function BitacoraEventoItem({ ev }: { ev: TimelineEvent }) {
  const Icon = ICON_MAP[ev.icon] ?? MapPin;
  const tone = SEVERITY_TONES[ev.severity];
  const d = new Date(ev.timestamp);
  const hora = d.toLocaleTimeString("es-CL", {
    hour: "2-digit",
    minute: "2-digit",
  });

  return (
    <div className={`flex items-start gap-3 rounded-lg px-3 py-2.5 ${tone.bg}`}>
      <div className="flex flex-col items-center pt-0.5">
        <div className={`h-2 w-2 rounded-full ${tone.dot}`} />
      </div>
      <Icon className={`h-4 w-4 flex-shrink-0 mt-0.5 ${tone.icon}`} />
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <p className="text-sm truncate">{ev.title}</p>
          <span className="text-[10px] text-zinc-500 flex-shrink-0">{hora}</span>
        </div>
        <div className="flex items-center gap-2 text-[11px] text-zinc-500 mt-0.5">
          {ev.installationName && (
            <span className="truncate">{ev.installationName}</span>
          )}
          {ev.guardiaName && (
            <>
              <span>·</span>
              <span className="break-words">{ev.guardiaName}</span>
            </>
          )}
        </div>
        {ev.detail && (
          <p className="text-[11px] text-zinc-400 mt-1 line-clamp-2">
            {ev.detail}
          </p>
        )}
      </div>
    </div>
  );
}
