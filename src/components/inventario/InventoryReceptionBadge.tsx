import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

export type ReceptionStatus = "pending" | "confirmed";

/**
 * Badges consistentes para recepción de entregas (portal guardia + ops inventario).
 * Pendiente = ámbar; recepcionado = verde.
 */
export function InventoryReceptionBadge({
  status,
  className,
}: {
  status: ReceptionStatus;
  className?: string;
}) {
  if (status === "confirmed") {
    return (
      <Badge
        className={cn(
          "bg-emerald-600 hover:bg-emerald-600 text-white text-[10px] font-semibold shrink-0",
          className
        )}
      >
        Recepcionado
      </Badge>
    );
  }
  return (
    <Badge
      variant="outline"
      className={cn(
        "text-[10px] font-semibold shrink-0 border-amber-500/60 text-amber-800 dark:text-amber-400 bg-amber-500/10",
        className
      )}
    >
      Pendiente recepción
    </Badge>
  );
}

export function receptionStatusFromMovement(
  confirmationStatus?: string | null
): ReceptionStatus {
  return confirmationStatus === "confirmed" ? "confirmed" : "pending";
}
