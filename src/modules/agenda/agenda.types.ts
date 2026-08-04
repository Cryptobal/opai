export type AgendaItemSource = "agenda_visita" | "visita_tecnica" | "licitacion" | "google" | "tarea";

export type AgendaItemType =
  | "cliente"
  | "supervision"
  | "otra"
  | "tecnica"
  | "licitacion"
  | "google"
  | "tarea";

export type AgendaListItem = {
  id: string;
  source: AgendaItemSource;
  type: AgendaItemType;
  title: string;
  /** Etiqueta libre del evento (chip); null en fuentes sin etiqueta. */
  label?: string | null;
  start: string;
  end: string;
  allDay: boolean;
  assignedUserId: string;
  assignedName: string | null;
  /** Multi-responsable (tareas): todos los responsables. `assignedUserId` es el
   *  primero (compatibilidad). Cada uno ve la tarea en su agenda. */
  assignedUserIds?: string[];
  assignedNames?: string[];
  accountName: string | null;
  installationName: string | null;
  address: string | null;
  syncStatus: string | null;
  dealId: string | null;
  status: string;
  /** Sólo eventos Google: URL del evento en Google Calendar (abre en pestaña nueva). */
  htmlLink?: string | null;
  /** Nombre del calendario cuando no es el primary (tooltip / subtítulo). */
  calendarName?: string | null;
  /** googleEventId crudo (sin prefijo de calendarId) para dedupe. */
  googleEventId?: string | null;
  /**
   * Clave estable de fuente para color/filtro:
   * `opai:cliente|tecnica|tareas|licitaciones` o `google:{accountId}:{calendarId}`.
   */
  sourceKey?: string;
  /** Sólo tareas: deep-link al origen (correo / negocio / cuenta). */
  href?: string | null;
  /** Sólo tareas: usuario que creó la tarea (ownership para eliminar). */
  createdBy?: string | null;
};

export type LicitacionListItem = {
  id: string;
  title: string;
  accountName: string | null;
  amount: number;
  ownerId: string | null;
  ownerName: string | null;
  fechaEntrega: string;
  daysLeft: number;
  syncStatus: string | null;
  stageName: string | null;
};
