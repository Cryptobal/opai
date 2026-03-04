import { cn } from "@/lib/utils";
import { CheckCircle2, AlertTriangle, Play, Flag, Info } from "lucide-react";

type EventType = "check" | "alert" | "start" | "complete" | "info";

const EVENT_CONFIG: Record<EventType, { icon: React.ElementType; color: string; bg: string }> = {
  check:    { icon: CheckCircle2,  color: "text-green-400",  bg: "bg-green-500/10" },
  alert:    { icon: AlertTriangle, color: "text-red-400",    bg: "bg-red-500/10" },
  start:    { icon: Play,          color: "text-blue-400",   bg: "bg-blue-500/10" },
  complete: { icon: Flag,          color: "text-[#2dd4bf]",  bg: "bg-[#2dd4bf]/10" },
  info:     { icon: Info,          color: "text-[#94a3b8]",  bg: "bg-white/5" },
};

interface EventFeedItemProps {
  type: EventType | string;
  message: string;
  timestamp: string;
  actor?: string;
  isLast?: boolean;
}

function formatRelative(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "ahora";
  if (mins < 60) return `hace ${mins}m`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `hace ${hrs}h`;
  return new Date(iso).toLocaleString("es-CL", { hour: "2-digit", minute: "2-digit" });
}

export function EventFeedItem({ type, message, timestamp, actor, isLast }: EventFeedItemProps) {
  const cfg = EVENT_CONFIG[type as EventType] ?? EVENT_CONFIG.info;
  const Icon = cfg.icon;
  return (
    <div className="flex gap-3">
      <div className="flex flex-col items-center">
        <div className={cn("w-7 h-7 rounded-full flex items-center justify-center shrink-0", cfg.bg)}>
          <Icon className={cn("w-3.5 h-3.5", cfg.color)} />
        </div>
        {!isLast && <div className="w-px flex-1 bg-white/[0.06] mt-1" />}
      </div>
      <div className="pb-4 flex-1 min-w-0">
        <p className="text-[13px] text-[#f1f5f9] leading-snug">{message}</p>
        <div className="flex items-center gap-2 mt-0.5">
          {actor && <span className="text-[11px] text-[#64748b]">{actor}</span>}
          <span className="text-[11px] text-[#64748b]">{formatRelative(timestamp)}</span>
        </div>
      </div>
    </div>
  );
}
