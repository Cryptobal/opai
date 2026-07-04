export type AiActionRow = {
  id: string;
  createdAt: string;
  tenantId: string;
  tenantName: string;
  tenantSlug: string;
  userId: string;
  userName: string;
  toolName: string;
  status: string;
  durationMs: number;
  resultEntityId: string | null;
  resultEntityType: string | null;
  errorMessage: string | null;
  args: string;
};

export type AiActionsResponse = {
  rows: AiActionRow[];
  total: number;
  page: number;
  pageSize: number;
};

export function entityPath(type: string | null, id: string | null): string | null {
  if (!type || !id) return null;
  const map: Record<string, string> = {
    crm_account: `/crm/accounts/${id}`,
    crm_contact: `/crm/contacts/${id}`,
    crm_lead: `/crm/leads/${id}`,
    crm_deal: `/crm/deals/${id}`,
    crm_installation: `/crm/installations/${id}`,
    ops_ticket: `/ops/tickets/${id}`,
  };
  return map[type] ?? null;
}

export function statusTagVariant(status: string): "ok" | "warn" | "danger" | "info" | "neutral" {
  if (status === "success") return "ok";
  if (status === "denied") return "warn";
  if (status === "validation_error") return "warn";
  if (status === "internal_error") return "danger";
  return "neutral";
}
