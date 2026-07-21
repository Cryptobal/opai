"use client";

import { Download, File, FileText, Image as ImageIcon } from "lucide-react";
import type { CorreoAttachmentDTO } from "@/modules/crm/email/correos.types";

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

export function CorreoAttachments({
  items,
  threadId,
}: {
  items: CorreoAttachmentDTO[];
  threadId: string;
}) {
  if (items.length === 0) return null;
  return (
    <div className="space-y-1.5">
      <p className="text-[12px] font-medium text-ds-text-3">Adjuntos ({items.length})</p>
      <ul className="space-y-1">
        {items.map((a) => {
          const Icon = iconFor(a.mimeType);
          const url = `/api/crm/correos/${threadId}/attachments/${a.messageId}/${a.attachmentId}`;
          return (
            <li
              key={`${a.messageId}-${a.attachmentId}`}
              className="flex items-center gap-1 rounded-lg border border-ds-border-subtle bg-ds-surface-1 px-2.5 text-[13px] text-ds-text-2"
            >
              <a
                href={url}
                target="_blank"
                rel="noopener noreferrer"
                className="flex min-h-11 min-w-0 flex-1 items-center gap-2 ds-tap"
                title={a.filename}
              >
                <Icon className="h-4 w-4 shrink-0 text-ds-text-4" />
                <span className="min-w-0 flex-1 truncate">{a.filename}</span>
                <span className="shrink-0 text-[12px] text-ds-text-4">{fmtSize(a.size)}</span>
              </a>
              <a
                href={url}
                download={a.filename}
                aria-label="Descargar"
                title="Descargar"
                className="flex h-11 w-9 shrink-0 items-center justify-center text-ds-text-4 ds-tap hover:text-ds-text-2"
              >
                <Download className="h-4 w-4" />
              </a>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
