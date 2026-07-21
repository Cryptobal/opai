"use client";

import { useState } from "react";
import { Download, File, FileText, Image as ImageIcon } from "lucide-react";
import type { CorreoAttachmentDTO } from "@/modules/crm/email/correos.types";
import { CorreoAttachmentSave } from "./CorreoAttachmentSave";
import { CorreoAttachmentViewer, type ViewerFile } from "./CorreoAttachmentViewer";

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

/** URL del adjunto con hints fn/sz: permiten re-ubicarlo si el id de Gmail rotó. */
function attachmentUrl(threadId: string, a: CorreoAttachmentDTO): string {
  const qs = new URLSearchParams({ fn: a.filename, sz: String(a.size) });
  return `/api/crm/correos/${threadId}/attachments/${a.messageId}/${a.attachmentId}?${qs}`;
}

export function CorreoAttachments({
  items,
  threadId,
  dealId,
  dealTitle,
  accountId,
}: {
  items: CorreoAttachmentDTO[];
  threadId: string;
  dealId: string | null;
  dealTitle: string | null;
  accountId: string | null;
}) {
  const [viewer, setViewer] = useState<ViewerFile | null>(null);
  if (items.length === 0) return null;
  return (
    <div className="space-y-1.5">
      <p className="text-[12px] font-medium text-ds-text-3">Adjuntos ({items.length})</p>
      <ul className="space-y-1">
        {items.map((a) => {
          const Icon = iconFor(a.mimeType);
          const url = attachmentUrl(threadId, a);
          return (
            <li
              key={`${a.messageId}-${a.attachmentId}`}
              className="flex items-center gap-1 rounded-lg border border-ds-border-subtle bg-ds-surface-1 px-2.5 text-[13px] text-ds-text-2"
            >
              <button
                type="button"
                onClick={() => setViewer({ url, filename: a.filename, mimeType: a.mimeType })}
                className="flex min-h-11 min-w-0 flex-1 items-center gap-2 text-left ds-tap"
                title={a.filename}
              >
                <Icon className="h-4 w-4 shrink-0 text-ds-text-4" />
                <span className="min-w-0 flex-1 truncate">{a.filename}</span>
                <span className="shrink-0 text-[12px] text-ds-text-4">{fmtSize(a.size)}</span>
              </button>
              <a
                href={url}
                download={a.filename}
                aria-label="Descargar"
                title="Descargar"
                className="flex h-11 w-9 shrink-0 items-center justify-center text-ds-text-4 ds-tap hover:text-ds-text-2"
              >
                <Download className="h-4 w-4" />
              </a>
              <CorreoAttachmentSave
                threadId={threadId}
                messageId={a.messageId}
                attachmentId={a.attachmentId}
                filename={a.filename}
                size={a.size}
                dealId={dealId}
                dealTitle={dealTitle}
                accountId={accountId}
              />
            </li>
          );
        })}
      </ul>
      <CorreoAttachmentViewer file={viewer} onClose={() => setViewer(null)} />
    </div>
  );
}
