"use client";

import { useEffect, useRef } from "react";

/** Marca el hilo como leído una sola vez al abrir el drawer. */
export function useMarkCorreoRead(
  threadId: string | null,
  isUnread: boolean | undefined,
  canModify: boolean | undefined,
  onMarked?: () => void,
) {
  const done = useRef<string | null>(null);

  useEffect(() => {
    done.current = null;
  }, [threadId]);

  useEffect(() => {
    if (!threadId || !isUnread || !canModify || done.current === threadId) return;
    done.current = threadId;
    void fetch(`/api/crm/correos/${threadId}/action`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "markRead" }),
    }).then(() => onMarked?.());
  }, [threadId, isUnread, canModify, onMarked]);
}
