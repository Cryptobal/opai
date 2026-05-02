import { MapPinOff } from "lucide-react";
import { cn } from "@/lib/utils";

type Props = {
  lifecycleStatus?: string | null;
  currentInstallationId?: string | null;
  className?: string;
};

export function UnassignedHiredBadge({
  lifecycleStatus,
  currentInstallationId,
  className,
}: Props) {
  if (lifecycleStatus !== "contratado" || currentInstallationId) return null;
  return (
    <span
      title="Contratado sin asignación operativa"
      onClick={(e) => e.stopPropagation()}
      className={cn(
        "inline-flex shrink-0 items-center text-status-warn-fg/80 cursor-help",
        className
      )}
      aria-label="Contratado sin asignación operativa"
    >
      <MapPinOff className="h-3.5 w-3.5" />
    </span>
  );
}

export function isContratadoSinAsignacion(
  lifecycleStatus?: string | null,
  currentInstallationId?: string | null
): boolean {
  return lifecycleStatus === "contratado" && !currentInstallationId;
}
