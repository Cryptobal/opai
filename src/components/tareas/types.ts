/** Item de tarea tal como lo entrega GET /api/crm/tasks. */
export interface TareaItem {
  id: string;
  title: string;
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
  dueAt: string | null;
  allDay: boolean;
  assigneeIds: string[];
}

export type TareaStatusFilter = "all" | "open" | "done";

export interface TareaFilters {
  status: TareaStatusFilter;
  assigneeId: string;
  q: string;
}
