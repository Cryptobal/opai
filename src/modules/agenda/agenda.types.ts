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
  start: string;
  end: string;
  allDay: boolean;
  assignedUserId: string;
  assignedName: string | null;
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
  /** Sólo tareas: deep-link al origen (correo / negocio / cuenta). */
  href?: string | null;
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
