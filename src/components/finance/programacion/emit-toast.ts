import { toast } from "sonner";

/**
 * Resultado del auto-envío de email tras emitir un borrador. `issueDte`
 * adjunta `emailStatus`/`emailError` al DTE emitido y el endpoint los devuelve
 * en `data`.
 */
export interface EmitResult {
  emailStatus?: "sent" | "failed" | "no_receiver" | "skipped";
  emailError?: string | null;
  folio?: number | null;
  id?: string;
  /** v4.7: emitida sin vínculo con programaciones activas → banner vincular. */
  needsTemplateLink?: boolean;
}

/**
 * Avisa el resultado de la emisión + auto-envío de email con un toast acorde.
 * El DTE se emite igual en todos los casos; lo que varía es si el correo al
 * receptor salió. Antes el handler mostraba siempre "emitido ✓" aunque el
 * email no se enviara (receptor sin correo, auto-envío off, o fallo), dejando
 * al usuario creyendo que el cliente recibió la factura.
 */
function notifyNeedsTemplateLink(data: EmitResult | undefined) {
  if (!data?.needsTemplateLink || data.folio == null) return;
  const folio = data.folio;
  toast.warning(`F°${folio} quedó por asignar`, {
    description: "Vincular ahora en la bandeja del flujo de caja.",
    duration: 20_000,
    action: {
      label: "Vincular ahora",
      onClick: () => {
        const q = data.id ? `?focusDte=${encodeURIComponent(data.id)}` : "";
        window.location.href = `/finanzas/flujo-caja/planilla${q}`;
      },
    },
  });
}

export function notifyEmitResult(data: EmitResult | undefined) {
  switch (data?.emailStatus) {
    case "sent":
      toast.success("Emitida y enviada por email al receptor");
      notifyNeedsTemplateLink(data);
      return;
    case "no_receiver":
      toast.warning(
        "Emitida ✓ — pero el receptor no tiene email: no se envió. Cárgale un correo a la plantilla/contrato, o reenvíalo desde DTEs Emitidos.",
      );
      notifyNeedsTemplateLink(data);
      return;
    case "skipped":
      toast.success("Emitida ✓ — auto-envío de email desactivado en la plantilla.");
      notifyNeedsTemplateLink(data);
      return;
    case "failed":
      toast.warning(
        `Emitida ✓ — pero falló el envío de email: ${data?.emailError ?? "error desconocido"}. Reenvíalo desde DTEs Emitidos.`,
      );
      notifyNeedsTemplateLink(data);
      return;
    default:
      // emailStatus ausente (emisión por una ruta que no lo reporta): mensaje genérico.
      toast.success("Borrador emitido al SII");
      notifyNeedsTemplateLink(data);
  }
}
