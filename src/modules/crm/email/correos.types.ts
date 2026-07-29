export type CorreoThreadDTO = {
  id: string;
  subject: string;
  fromEmail: string | null;
  snippet: string | null;
  lastMessageAt: string | null;
  accountId: string | null;
  accountName: string | null;
  dealId: string | null;
  dealTitle: string | null;
  leadId: string | null;
  attachmentCount: number;
  messageCount: number;
  providerThreadId: string | null;
  possibleLead: boolean;
  isUnread: boolean;
  archivedAt: string | null;
  trashedAt: string | null;
  snoozedUntil: string | null;
  starredAt: string | null;
  spamAt: string | null;
  hasDraft: boolean;
  /** A03: vertical cruda de la IA (para comandos / medición de precisión). */
  aiVertical: string | null;
  /** Vertical efectiva visible (override ?? IA), filtrada por capability. */
  vertical: import("./radar-types").RadarVertical | null;
  /** true si hay corrección humana persistida. */
  verticalFixed: boolean;
  /** Motivo de match bajo búsqueda híbrida (null fuera de búsqueda). */
  matchReason?: "lexical" | "semantic" | "both" | null;
};

export type CorreoMessageDTO = {
  id: string;
  /** Id del mensaje en Gmail (para URLs de adjuntos / cid). */
  providerMessageId?: string | null;
  direction: string;
  fromEmail: string;
  /** Reply-To si difiere del From (listas / grupos Google). */
  replyToEmail?: string | null;
  toEmails: string[];
  ccEmails: string[];
  subject: string;
  htmlBody: string | null;
  textBody: string | null;
  sentAt: string | null;
  /** Borrador Gmail espejado (visible en la cadena con acción Descartar). */
  isDraft?: boolean;
  /** Id estable del draft en Gmail (`users.drafts`); null si no es borrador. */
  providerDraftId?: string | null;
};

export type CorreoAttachmentDTO = {
  messageId: string;
  attachmentId: string;
  filename: string;
  mimeType: string;
  size: number;
  /** Content-ID MIME (sin <>). Sirve para reescribir `src="cid:…"` en el HTML. */
  contentId?: string | null;
  /** B5: id del CrmFile si el adjunto ya fue guardado a una ficha desde este
   *  hilo (chip "Guardado"). Se resuelve por consulta fresca en cada detalle,
   *  fuera de `attachmentsMeta`, para no invalidar el caché C18. */
  savedFileId?: string | null;
};

/** Invitación de calendario detectada en un mensaje (RSVP en el lector). */
export type CorreoInviteDTO = {
  messageId: string;
  attachmentId: string | null;
  filename: string;
  uid: string | null;
  method: string | null;
  title: string;
  whenLabel: string | null;
  startAt: string | null;
  endAt: string | null;
  allDay: boolean;
  location: string | null;
  joinUrl: string | null;
  organizerName: string | null;
  organizerEmail: string | null;
  attendeeCount: number;
  responseStatus: "needs_action" | "accepted" | "declined" | "tentative";
  cancelled: boolean;
  calendarConnected: boolean;
  googleEventId: string | null;
  googleHtmlLink: string | null;
  source: "ics";
};

/**
 * Detalle de un hilo servido a una ficha (Bloque 5): solo lectura, 100% desde
 * el espejo local — NUNCA toca Gmail. Autorizado por la entidad, no por la
 * casilla. `synced=false` cuando el hilo aún no tiene mensajes espejados.
 */
export type EntityThreadDetail = {
  thread: {
    id: string;
    subject: string;
    accountId: string | null;
    dealId: string | null;
    contactId: string | null;
  };
  messages: CorreoMessageDTO[];
  attachments: CorreoAttachmentDTO[];
  synced: boolean;
  /** Calculado en servidor: casilla propia activa + canEdit correos. */
  canReply?: boolean;
  /** Email de la casilla propia si puede responder; null si no. */
  ownerEmail?: string | null;
  associations?: {
    accountId: string | null;
    dealId: string | null;
    contactId: string | null;
  };
};

export type CorreoDetail = {
  thread: {
    id: string;
    subject: string;
    accountId: string | null;
    accountName: string | null;
    dealId: string | null;
    dealTitle: string | null;
    /** Fecha de entrega del negocio asociado (licitación), ISO date o null. */
    dealFechaEntrega: string | null;
    dealIsLicitacion: boolean;
    leadId: string | null;
    providerThreadId: string | null;
    isUnread: boolean;
    archivedAt: string | null;
    starredAt: string | null;
    spamAt: string | null;
    /** Bloque 5: el hilo asociado es visible en la ficha de la cuenta. */
    sharedWithAccount: boolean;
    lastMessageAt: string | null;
    /** Clasificación radar persistida; null si aún no clasificado. */
    aiCategory: string | null;
    aiVertical: string | null;
    /** Vertical efectiva visible (override ?? IA), filtrada por capability. */
    vertical: import("./radar-types").RadarVertical | null;
    verticalFixed: boolean;
    aiUrgency: string | null;
    aiSentiment: string | null;
    aiSummary: string | null;
    aiClassifiedAt: string | null;
    /** Sello de lectura previo a abrir el hilo (para "desde lectura"). */
    lastReadAt: string | null;
    /** Resumen ejecutivo cacheado; null si nunca se generó. */
    threadSummary: { text: string; generatedAt: string | null; stale: boolean } | null;
  };
  messages: CorreoMessageDTO[];
  attachments: CorreoAttachmentDTO[];
  /** true si Gmail falló al cargar el hilo: los adjuntos pueden faltar y la
   * UI debe avisar en vez de mostrar una lista vacía silenciosa (B3). */
  degraded: boolean;
};
