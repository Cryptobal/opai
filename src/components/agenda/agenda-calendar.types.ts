import type { AgendaItemSource, AgendaItemType } from "@/modules/agenda/agenda.types";

export type AgendaCalendarItem = {
  id: string;
  source: AgendaItemSource;
  type: AgendaItemType;
  title: string;
  start: string;
  end: string;
  allDay: boolean;
  syncStatus: string | null;
  dealId: string | null;
  assignedUserId: string;
  assignedName: string | null;
  /** Multi-responsable (tareas): todos los responsables. `assignedUserId` es el
   *  primero (compatibilidad). Cada uno ve la tarea en su agenda. */
  assignedUserIds?: string[];
  assignedNames?: string[];
  accountName: string | null;
  installationName: string | null;
  address: string | null;
  status: string;
  htmlLink?: string | null;
  calendarName?: string | null;
  href?: string | null;
};

/** Alias legacy usado por TaskDrawer/VisitList (ex AgendaWeekStrip, retirado). */
export type WeekItem = AgendaCalendarItem;

export type AgendaTeamMember = {
  id: string;
  name: string;
  email?: string;
};

export type AgendaViewMode = "day" | "multi" | "week" | "month";
export type AgendaContentFilter = "todo" | "reuniones" | "tareas";
export type AgendaTypeFilter =
  | "todos"
  | "tecnica"
  | "cliente"
  | "supervision"
  | "otra"
  | "licitacion";

export type AgendaSchedule = {
  start: Date;
  end: Date;
  allDay: boolean;
};
