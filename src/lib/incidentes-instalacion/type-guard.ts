import { INCIDENTE_TICKET_SLUG } from "./constants";

export function isIncidenteTicketType(slug: string | null | undefined): boolean {
  return slug === INCIDENTE_TICKET_SLUG;
}
