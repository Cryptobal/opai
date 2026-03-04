import { cn } from "@/lib/utils";
import { TrustScoreGauge } from "./TrustScoreGauge";
import { StatusBadge, normalizeStatus } from "./StatusBadge";
import { Button } from "@/components/ui/button";
import { ChevronRight } from "lucide-react";
import { formatPersonName } from "@/lib/personas";

interface RondaRowCardProps {
  id: string;
  status: string;
  installationName: string;
  templateName: string;
  guardiaFirstName?: string;
  guardiaLastName?: string;
  scheduledAt: string;
  checkpointsCompleted: number;
  checkpointsTotal: number;
  trustScore: number;
  onView?: (id: string) => void;
}

export function RondaRowCard({
  id, status, installationName, templateName,
  guardiaFirstName, guardiaLastName,
  scheduledAt, checkpointsCompleted, checkpointsTotal, trustScore,
  onView,
}: RondaRowCardProps) {
  const isAtrasada = normalizeStatus(status) === "atrasada";
  const pct = checkpointsTotal > 0 ? Math.round((checkpointsCompleted / checkpointsTotal) * 100) : 0;

  return (
    <div className={cn(
      "rounded-xl border p-4 space-y-3 transition-colors",
      isAtrasada
        ? "bg-red-500/5 border-red-500/20 border-l-2 border-l-red-500"
        : "bg-[#111827] border-[#1e293b]"
    )}>
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-[13px] font-semibold text-[#f1f5f9] truncate">{installationName}</p>
          <p className="text-[11px] text-[#94a3b8] truncate">{templateName}</p>
        </div>
        <StatusBadge status={status} />
      </div>

      <div className="flex items-center justify-between gap-3">
        <div className="flex-1 space-y-1">
          <div className="flex justify-between text-[11px] text-[#64748b]">
            <span>{checkpointsCompleted}/{checkpointsTotal} checks</span>
            <span>{pct}%</span>
          </div>
          <div className="h-1 bg-[#1e293b] rounded-full overflow-hidden">
            <div
              className="h-full rounded-full transition-all duration-500"
              style={{
                width: `${pct}%`,
                background: pct >= 70 ? "#22c55e" : pct >= 40 ? "#f59e0b" : "#ef4444"
              }}
            />
          </div>
        </div>
        <TrustScoreGauge score={trustScore} size="sm" showLabel />
      </div>

      <div className="flex items-center justify-between">
        <div>
          {guardiaFirstName && (
            <p className="text-[11px] text-[#94a3b8]">
              {formatPersonName(guardiaFirstName, guardiaLastName ?? "")}
            </p>
          )}
          <p className="text-[11px] text-[#64748b]">
            {new Date(scheduledAt).toLocaleString("es-CL", { hour: "2-digit", minute: "2-digit" })}
          </p>
        </div>
        {onView && (
          <Button
            size="sm"
            variant="ghost"
            className="h-8 px-2 text-[#94a3b8] hover:text-[#f1f5f9]"
            onClick={() => onView(id)}
          >
            <ChevronRight className="w-4 h-4" />
          </Button>
        )}
      </div>
    </div>
  );
}
