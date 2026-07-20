"use client";

import { Paperclip } from "lucide-react";
import type { CorreoAttachmentDTO } from "@/modules/crm/email/correos.types";

function fmtSize(bytes: number): string {
  if (bytes <= 0) return "";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

export function CorreoAttachments({ items }: { items: CorreoAttachmentDTO[] }) {
  if (items.length === 0) return null;
  return (
    <div className="space-y-1.5">
      <p className="text-[12px] font-medium text-ds-text-3">Adjuntos ({items.length})</p>
      <ul className="space-y-1">
        {items.map((a) => (
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
  );
}
