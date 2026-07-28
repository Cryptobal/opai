"use client";

import { useState } from "react";
import { Clock, Download, File, FileText, Image as ImageIcon, Paperclip } from "lucide-react";
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

export function EntityMessageAttachments({
  items,
  onOpen,
}: {
  items: CorreoAttachmentDTO[];
  onOpen: (a: CorreoAttachmentDTO) => void;
}) {
  const [open, setOpen] = useState(false);
  return (
    <div className="space-y-1.5">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex h-9 w-full items-center gap-1.5 rounded-lg text-left text-[12px] font-medium text-ds-text-3 ds-tap"
      >
        <Paperclip className="h-3.5 w-3.5" />
        Adjuntos ({items.length})
      </button>
      {open && (
        <ul className="space-y-1">
          {items.map((a) => {
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
                    onClick={() => onOpen(a)}
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
      )}
    </div>
  );
}
