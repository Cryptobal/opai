"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { EntityThreadDetail } from "@/modules/crm/email/correos.types";
import type { ConversationEntityType } from "@/modules/crm/email/entity-conversations";

export type EntityThreadLoadState = "loading" | "forbidden" | "error" | "ready";

export function useEntityThreadDetail(
  threadId: string | null,
  entityType: ConversationEntityType,
  entityId: string,
) {
  const [detail, setDetail] = useState<EntityThreadDetail | null>(null);
  const [state, setState] = useState<EntityThreadLoadState>("loading");
  const requestedId = useRef<string | null>(null);

  const load = useCallback(() => {
    if (!threadId) return;
    requestedId.current = threadId;
    setState("loading");
    setDetail(null);
    const qs = new URLSearchParams({ entityType, entityId });
    fetch(`/api/crm/conversaciones/${threadId}?${qs}`)
      .then(async (r) => {
        if (requestedId.current !== threadId) return null;
        if (r.status === 403) {
          setState("forbidden");
          return null;
        }
        if (!r.ok) throw new Error("fail");
        return r.json() as Promise<EntityThreadDetail>;
      })
      .then((d) => {
        if (!d || requestedId.current !== threadId) return;
        setDetail(d);
        setState("ready");
      })
      .catch(() => {
        if (requestedId.current === threadId) setState("error");
      });
  }, [threadId, entityType, entityId]);

  useEffect(() => {
    load();
  }, [load]);

  return { detail, state, reload: load };
}
