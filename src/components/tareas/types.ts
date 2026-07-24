/** Item de tarea tal como lo entrega GET /api/crm/tasks. */
export interface TareaItem {
  id: string;
  title: string;
  notes: string | null;
  status: string; // "open" | "done"
  type: string;
  dueAt: string | null;
  allDay: boolean;
  assignedTo: string | null;
  completedBy: string | null;
  completedAt: string | null;
  dealId: string | null;
  accountId: string | null;
  emailThreadId: string | null;
  createdAt: string;
  assigneeIds: string[];
}

export interface TareaCreateInput {
  title: string;
  notes?: string | null;
  dueAt: string | null;
  allDay: boolean;
  assigneeIds: string[];
}

/** Campos editables desde el detalle (PATCH parcial). Todos opcionales. */
export interface TareaUpdateInput {
  title?: string;
  notes?: string | null;
  dueAt?: string | null;
  allDay?: boolean;
  assigneeIds?: string[];
  status?: string;
}

export type TareaStatusFilter = "all" | "open" | "done";

export interface TareaFilters {
  status: TareaStatusFilter;
  assigneeId: string;
  q: string;
}
