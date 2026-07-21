"use client";

import { useCallback, useEffect, useState } from "react";
import { Spinner } from "@/components/opai-ds";
import { CorreoReaderShell } from "./CorreoReaderShell";
import { CorreoDrawerContent } from "./CorreoDrawerContent";
import { CorreoThreadActions } from "./CorreoThreadActions";
import { useMarkCorreoRead } from "./useMarkCorreoRead";
import type { CorreoDetail } from "@/modules/crm/email/correos.types";

type Props = {
  threadId: string | null;
  onClose: () => void;
  onChanged?: () => void;
  autoExtract?: boolean;
  canModify?: boolean;
};

export function CorreoDrawer({ threadId, onClose, onChanged, autoExtract, canModify }: Props) {
  const [detail, setDetail] = useState<CorreoDetail | null>(null);
  const [loading, setLoading] = useState(false);
  const [aiOpen, setAiOpen] = useState(false);

  const load = useCallback(async () => {
    if (!threadId) return;
    setLoading(true);
    try {
      const r = await fetch(`/api/crm/correos/${threadId}`);
      setDetail(r.ok ? await r.json() : null);
    } finally {
      setLoading(false);
    }
  }, [threadId]);

  useEffect(() => {
    setDetail(null);
    setAiOpen(false);
    void load();
  }, [load]);

  useEffect(() => {
    if (autoExtract && detail && !detail.thread.leadId) setAiOpen(true);
  }, [autoExtract, detail]);

  const refresh = useCallback(() => {
    void load();
    onChanged?.();
  }, [load, onChanged]);

  useMarkCorreoRead(threadId, detail?.thread.isUnread, canModify, () => {
    setDetail((d) => (d ? { ...d, thread: { ...d.thread, isUnread: false } } : d));
    onChanged?.();
  });

  async function associate(p: { accountId: string | null; dealId: string | null }) {
    if (!threadId) return;
    await fetch(`/api/crm/correos/${threadId}/associate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(p),
    });
    refresh();
  }

  if (!threadId) return null;
  const from =
    detail?.messages.find((m) => m.direction !== "out")?.fromEmail ??
    detail?.messages[0]?.fromEmail ??
    "";

  return (
    <CorreoReaderShell
      open
      onClose={onClose}
      headerFrom={from}
      headerSubject={detail?.thread.subject || "Correo"}
      mobileActions={
        detail && canModify ? (
          <CorreoThreadActions
            threadId={detail.thread.id}
            isUnread={detail.thread.isUnread}
            archived={Boolean(detail.thread.archivedAt)}
            canModify
            variant="mobile-bar"
            onReply={() =>
              document.getElementById("correo-suggested-reply")?.scrollIntoView({ behavior: "smooth", block: "start" })
            }
            onDone={refresh}
          />
        ) : null
      }
    >
      {loading && !detail ? (
        <Spinner className="mx-auto" />
      ) : !detail ? (
        <p className="text-[13px] text-ds-text-4">No se pudo cargar el hilo.</p>
      ) : (
        <CorreoDrawerContent
          detail={detail}
          canModify={canModify}
          aiOpen={aiOpen}
          setAiOpen={setAiOpen}
          onAssociate={associate}
          onRefresh={refresh}
        />
      )}
    </CorreoReaderShell>
  );
}
