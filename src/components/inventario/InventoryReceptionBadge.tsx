import { Tag } from "@/components/opai-ds";

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
      <Tag variant="ok" size="sm" className={className}>
        Recepcionado
      </Tag>
    );
  }
  return (
    <Tag variant="warn" size="sm" className={className}>
      Pendiente recepción
    </Tag>
  );
}

export function receptionStatusFromMovement(
  confirmationStatus?: string | null
): ReceptionStatus {
  return confirmationStatus === "confirmed" ? "confirmed" : "pending";
}
