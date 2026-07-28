import type { ConversationEntityType } from "@/modules/crm/email/entity-conversations";

/**
 * Al responder desde quote/installation, materializa el vínculo directo
 * (CrmEmailThreadLink) para que el hilo deje de ser solo "heredado".
 */
export async function ensureEntityLink(params: {
  threadId: string;
  entityType: ConversationEntityType;
  entityId: string;
}): Promise<void> {
  if (params.entityType !== "installation" && params.entityType !== "quote") {
    return;
  }
  await fetch(`/api/crm/correos/${params.threadId}/links`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      entityType: params.entityType,
      entityId: params.entityId,
      linkedVia: "manual",
    }),
  }).catch(() => undefined);
}
