import type { TareaPriority, TareaVista } from "@/modules/tareas/tarea-priority";

export type { TareaPriority, TareaVista };

/** Item de tarea tal como lo entrega GET /api/crm/tasks. */
export interface TareaItem {
  id: string;
  title: string;
  notes: string | null;
  priority: TareaPriority;
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
  quoteId: string | null;
  installationId: string | null;
  emailThreadSubject: string | null;
  accountName: string | null;
  dealTitle: string | null;
  quoteLabel: string | null;
  installationName: string | null;
  createdAt: string;
  createdBy: string | null;
  assigneeIds: string[];
}

/** Draft de vinculación CRM (ids + labels para la UI). */
export interface TareaCrmLinkDraft {
  accountId: string | null;
  accountName: string | null;
  dealId: string | null;
  dealTitle: string | null;
  quoteId: string | null;
  quoteLabel: string | null;
  installationId: string | null;
  installationName: string | null;
}

export interface TareaCreateInput {
  title: string;
  notes?: string | null;
  priority?: TareaPriority;
  dueAt: string | null;
  allDay: boolean;
  assigneeIds: string[];
  accountId?: string | null;
  dealId?: string | null;
  quoteId?: string | null;
  installationId?: string | null;
}

/** Campos editables desde el detalle (PATCH parcial). Todos opcionales. */
export interface TareaUpdateInput {
  title?: string;
  notes?: string | null;
  priority?: TareaPriority;
  dueAt?: string | null;
  allDay?: boolean;
  assigneeIds?: string[];
  status?: string;
  accountId?: string | null;
  dealId?: string | null;
  quoteId?: string | null;
  installationId?: string | null;
  /** Labels optimistas tras guardar vinculación (no van al API). */
  accountName?: string | null;
  dealTitle?: string | null;
  quoteLabel?: string | null;
  installationName?: string | null;
}

export type TareaStatusFilter = "all" | "open" | "done";

export interface TareaFilters {
  status: TareaStatusFilter;
  assigneeId: string;
  q: string;
}

export interface TareaKpis {
  vencidas: number;
  hoy: number;
  semana: number;
}

export function crmLinksFromTask(task: TareaItem): TareaCrmLinkDraft {
  return {
    accountId: task.accountId,
    accountName: task.accountName,
    dealId: task.dealId,
    dealTitle: task.dealTitle,
    quoteId: task.quoteId,
    quoteLabel: task.quoteLabel,
    installationId: task.installationId,
    installationName: task.installationName,
  };
}

export const EMPTY_CRM_LINK_DRAFT: TareaCrmLinkDraft = {
  accountId: null,
  accountName: null,
  dealId: null,
  dealTitle: null,
  quoteId: null,
  quoteLabel: null,
  installationId: null,
  installationName: null,
};
