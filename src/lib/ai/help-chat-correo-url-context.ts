import { isUuid } from "@/lib/utils/uuid";

/** Shape compatible con ChatPageContextValue / HelpChatPageContext. */
export type CorreoUrlPageContext = {
  entityType: "crm_email_thread";
  entityId: string;
  entityName: string;
  entityUrl: string;
};

/**
 * Fallback: si el page context del cliente no llegó (p. ej. el hilo abierto
 * no está en la página actual de la lista) pero la URL de Correos sí trae
 * `?thread=` / `?hilo=`, sintetiza un contexto mínimo con ese threadId.
 */
export function pageContextFromCorreoUrl(
  pathname: string | null | undefined,
  search: string | null | undefined,
): CorreoUrlPageContext | null {
  if (!pathname?.startsWith("/crm/correos")) return null;
  const sp = new URLSearchParams(search ?? "");
  const thread = (sp.get("hilo") || sp.get("thread") || "").trim();
  if (!isUuid(thread)) return null;
  return {
    entityType: "crm_email_thread",
    entityId: thread,
    entityName: "Correo abierto",
    entityUrl: `/crm/correos?thread=${thread}`,
  };
}
