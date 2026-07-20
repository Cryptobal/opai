export type AgendaItemSource = "agenda_visita" | "visita_tecnica" | "licitacion";

export type AgendaItemType =
  | "cliente"
  | "supervision"
  | "otra"
  | "tecnica"
  | "licitacion";

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
