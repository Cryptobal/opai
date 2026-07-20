"use client";

import { useCallback, useEffect, useState, type MouseEvent } from "react";
import { ExternalLink, Paperclip } from "lucide-react";
import { Surface, Tag, Spinner } from "@/components/opai-ds";
import { AsociarCuenta } from "./AsociarCuenta";
import { CorreoMessages } from "./CorreoMessages";
import type { CorreoDetail } from "@/modules/crm/email/correos.types";

function fmtSize(bytes: number): string {
  if (bytes <= 0) return "";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

type Props = { threadId: string | null; onClose: () => void; onChanged?: () => void };

export function CorreoDrawer({ threadId, onClose, onChanged }: Props) {
  const [detail, setDetail] = useState<CorreoDetail | null>(null);
  const [loading, setLoading] = useState(false);

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
    void load();
  }, [load]);

  async function associate(accountId: string) {
    if (!threadId) return;
    await fetch(`/api/crm/correos/${threadId}/associate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ accountId }),
    });
    await load();
    onChanged?.();
  }

  if (!threadId) return null;
  const gmailUrl = detail?.thread.providerThreadId
    ? `https://mail.google.com/mail/u/0/#all/${detail.thread.providerThreadId}`
    : null;

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-black/40" onClick={onClose}>
      <Surface
        elevation={2}
        padding="md"
        className="h-full w-full max-w-lg space-y-4 overflow-y-auto"
        onClick={(e: MouseEvent) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-2">
          <p className="font-display text-base font-semibold text-ds-text-1">
            {detail?.thread.subject || "Correo"}
          </p>
          <button type="button" onClick={onClose} className="shrink-0 text-[13px] text-ds-text-3">
            Cerrar
          </button>
        </div>

        {loading && !detail ? (
          <Spinner className="mx-auto" />
        ) : !detail ? (
          <p className="text-[13px] text-ds-text-4">No se pudo cargar el hilo.</p>
        ) : (
          <>
            <div className="flex flex-wrap items-center gap-2">
              {detail.thread.accountId ? (
                <Tag variant="brand" size="sm">{detail.thread.accountName || "Cuenta"}</Tag>
              ) : (
                <Tag variant="neutral" size="sm">Sin asociar</Tag>
              )}
              {detail.thread.dealId && (
                <Tag variant="info" size="sm">Negocio · {detail.thread.dealTitle || "—"}</Tag>
              )}
              {gmailUrl && (
                <a
                  href={gmailUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="ml-auto inline-flex items-center gap-1 text-[12px] text-primary ds-tap"
                >
                  Abrir en Gmail <ExternalLink className="h-3 w-3" />
                </a>
              )}
            </div>

            <div className="flex flex-wrap items-center gap-2 rounded-xl border border-ds-border-subtle bg-ds-surface-2 p-2.5">
              <span className="text-[12px] text-ds-text-3">Asociación:</span>
              <span className="text-[13px] text-ds-text-1">
                {detail.thread.accountName || "Sin cuenta"}
              </span>
              <div className="ml-auto">
                <AsociarCuenta onSelect={associate} />
              </div>
            </div>

            {detail.attachments.length > 0 && (
              <div className="space-y-1.5">
                <p className="text-[12px] font-medium text-ds-text-3">
                  Adjuntos ({detail.attachments.length})
                </p>
                <ul className="space-y-1">
                  {detail.attachments.map((a) => (
                    <li
                      key={`${a.messageId}-${a.attachmentId}`}
                      className="flex items-center gap-2 rounded-lg border border-ds-border-subtle bg-ds-surface-1 px-2.5 py-1.5 text-[13px] text-ds-text-2"
                    >
                      <Paperclip className="h-3.5 w-3.5 shrink-0 text-ds-text-4" />
                      <span className="min-w-0 flex-1 truncate">{a.filename}</span>
                      <span className="shrink-0 text-[12px] text-ds-text-4">{fmtSize(a.size)}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            <CorreoMessages messages={detail.messages} />
          </>
        )}
      </Surface>
    </div>
  );
}
