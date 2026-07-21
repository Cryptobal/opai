import { toast } from "sonner";
import type { CorreoAction } from "@/modules/crm/email/gmail-thread-actions";

async function postAction(threadId: string, action: CorreoAction) {
  const res = await fetch(`/api/crm/correos/${threadId}/action`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action }),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body?.error || "Error");
}

export async function runCorreoAction(
  threadId: string,
  action: CorreoAction,
  okMsg: string,
  onDone?: () => void,
  undo?: CorreoAction,
) {
  try {
    await postAction(threadId, action);
    if (undo) {
      toast.success(okMsg, {
        duration: 5000,
        action: {
          label: "Deshacer",
          onClick: () => void postAction(threadId, undo).then(() => onDone?.()),
        },
      });
    } else toast.success(okMsg);
    onDone?.();
  } catch (e) {
    toast.error(e instanceof Error ? e.message : "No se pudo completar");
  }
}
