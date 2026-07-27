"use client";

import { useEffect, useState } from "react";
import { Clock, Download, File, FileText, Image as ImageIcon, Paperclip } from "lucide-react";
import { Spinner } from "@/components/opai-ds";
import { CorreoMessages } from "./correos/CorreoMessages";
import { CorreoAttachmentViewer, type ViewerFile } from "./correos/CorreoAttachmentViewer";
import { CorreoReaderShell } from "./correos/CorreoReaderShell";
import { parseSender } from "./correos/correo-sender";
import type { CorreoAttachmentDTO, EntityThreadDetail } from "@/modules/crm/email/correos.types";

type EntityType = "account" | "deal" | "installation";

function fmtSize(bytes: number): string {
  if (bytes <= 0) return "";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}
function iconFor(mime: string) {
  if (mime.includes("pdf")) return FileText;
  if (mime.startsWith("image/")) return ImageIcon;
  return File;
}

/**
 * Lector de solo lectura de un hilo compartido, embebido en la ficha (Bloque
 * 5). Sirve 100% del espejo local vía /api/crm/conversaciones/[threadId]
 * (autorizado por entidad; Gmail no participa). Los adjuntos materializados/
 * guardados abren el visor de Fase 1 (misma-origen); el resto se lista como
 * "Pendiente de sincronizar", sin enlace muerto.
 */
export function EntityThreadReader({
  threadId,
  entityType,
  entityId,
  onClose,
}: {
  threadId: string | null;
  entityType: EntityType;
  entityId: string;
  onClose: () => void;
}) {
  const [detail, setDetail] = useState<EntityThreadDetail | null>(null);
  const [state, setState] = useState<"loading" | "error" | "ready">("loading");
  const [viewer, setViewer] = useState<ViewerFile | null>(null);

  useEffect(() => {
    if (!threadId) return;
    setState("loading");
    setDetail(null);
    const qs = new URLSearchParams({ entityType, entityId });
    fetch(`/api/crm/conversaciones/${threadId}?${qs}`)
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((d: EntityThreadDetail) => {
        setDetail(d);
        setState("ready");
      })
      .catch(() => setState("error"));
  }, [threadId, entityType, entityId]);

  if (!threadId) return null;

  const rawFrom =
    detail?.messages.find((m) => m.direction !== "out")?.fromEmail ?? detail?.messages[0]?.fromEmail ?? "";
  const sender = parseSender(rawFrom);

  const openAttachment = (a: CorreoAttachmentDTO) => {
    if (!a.savedFileId) return;
    setViewer({
      url: `/api/crm/files/${a.savedFileId}/download`,
      filename: a.filename,
      mimeType: a.mimeType,
      size: a.size,
    });
  };

  return (
    <CorreoReaderShell
      open
      onClose={onClose}
      headerFrom={sender.name || sender.email || rawFrom || "—"}
      headerSubject={detail?.thread.subject || "Conversación"}
      desktopWidth={560}
      onResizePointerDown={() => {}}
      onResizeKeyDown={() => {}}
      onResizeReset={() => {}}
    >
      {state === "loading" ? (
        <Spinner className="mx-auto" />
      ) : state === "error" ? (
        <p className="text-[13px] text-status-danger-fg">No se pudo cargar la conversación.</p>
      ) : detail && !detail.synced ? (
        <div className="flex items-center gap-2 rounded-xl border border-ds-border-subtle bg-ds-surface-1 px-3 py-4 text-[13px] text-ds-text-4">
          <Clock className="h-4 w-4 shrink-0" />
          Conversación no sincronizada todavía.
        </div>
      ) : detail ? (
        <>
          <CorreoMessages messages={detail.messages} />
          {detail.attachments.length > 0 && (
            <div className="space-y-1.5">
              <p className="flex items-center gap-1.5 text-[12px] font-medium text-ds-text-3">
                <Paperclip className="h-3.5 w-3.5" /> Adjuntos ({detail.attachments.length})
              </p>
              <ul className="space-y-1">
                {detail.attachments.map((a) => {
                  const Icon = iconFor(a.mimeType);
                  const saved = Boolean(a.savedFileId);
                  return (
                    <li
                      key={`${a.messageId}-${a.attachmentId}`}
                      className="flex items-center gap-2 rounded-lg border border-ds-border-subtle bg-ds-surface-1 px-2.5 py-1 text-[13px] text-ds-text-2"
                    >
                      {saved ? (
                        <button
                          type="button"
                          onClick={() => openAttachment(a)}
                          className="flex min-h-11 min-w-0 flex-1 items-center gap-2 text-left ds-tap"
                          title={a.filename}
                        >
                          <Icon className="h-4 w-4 shrink-0 text-ds-text-4" />
                          <span className="min-w-0 flex-1 truncate">{a.filename}</span>
                          <span className="shrink-0 text-[12px] text-ds-text-4">{fmtSize(a.size)}</span>
                        </button>
                      ) : (
                        <div className="flex min-h-11 min-w-0 flex-1 items-center gap-2" title={a.filename}>
                          <Icon className="h-4 w-4 shrink-0 text-ds-text-4" />
                          <span className="min-w-0 flex-1 truncate text-ds-text-4">{a.filename}</span>
                          <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-ds-surface-3 px-2 py-0.5 text-[12px] text-ds-text-4">
                            <Clock className="h-3 w-3" /> Pendiente
                          </span>
                        </div>
                      )}
                      {saved && (
                        <a
                          href={`/api/crm/files/${a.savedFileId}/download`}
                          download={a.filename}
                          aria-label="Descargar"
                          title="Descargar"
                          className="flex h-11 w-9 shrink-0 items-center justify-center text-ds-text-4 ds-tap hover:text-ds-text-2"
                        >
                          <Download className="h-4 w-4" />
                        </a>
                      )}
                    </li>
                  );
                })}
              </ul>
            </div>
          )}
        </>
      ) : null}
      <CorreoAttachmentViewer file={viewer} onClose={() => setViewer(null)} />
    </CorreoReaderShell>
  );
}
