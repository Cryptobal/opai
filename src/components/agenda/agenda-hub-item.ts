export type HubAgendaItem = {
  id: string;
  source?: string;
  type: string;
  title: string;
  start: string;
  allDay: boolean;
  syncStatus: string | null;
  htmlLink?: string | null;
  calendarName?: string | null;
  href?: string | null;
};

export function hhmm(start: string): string {
  return new Date(start).toLocaleTimeString("es-CL", { hour: "2-digit", minute: "2-digit" });
}
