/** Props compartidas por la cadena del lector (CorreoMessages y sus filas). */
import type { ReactNode } from "react";
import type {
  CorreoAttachmentDTO,
  CorreoMessageDTO,
} from "@/modules/crm/email/correos.types";

export type MessageImagePrefs = {
  alwaysShowImages?: boolean;
  onAlwaysShowImages?: () => void;
  threadId?: string | null;
  attachments?: CorreoAttachmentDTO[];
  inSpam?: boolean;
  canModify?: boolean;
};

export type MessageSavePrefs = {
  dealId?: string | null;
  dealTitle?: string | null;
  accountId?: string | null;
  accountName?: string | null;
  mailboxEmail?: string | null;
  degraded?: boolean;
  onAttachmentsSaved?: () => void;
  onRequestAssociate?: () => void;
  /** Si se define, reemplaza el bloque CRM de adjuntos (p. ej. ficha entidad). */
  renderMessageAttachments?: (m: CorreoMessageDTO, items: CorreoAttachmentDTO[]) => ReactNode;
  /** Tras descartar un borrador en la cadena (refrescar detalle + lista). */
  onDraftDiscarded?: () => void;
  /** Continuar editando un borrador en el composer (estilo Gmail). */
  onContinueDraft?: (m: CorreoMessageDTO) => void;
};
