"use client";

import { useState } from "react";
import {
  File as FileIcon,
  Download,
  X,
} from "lucide-react";
import type { ChatAttachment } from "@/lib/chat-types";

interface ChatAttachmentPreviewProps {
  attachments: ChatAttachment[];
}

/**
 * Format file size to human-readable string.
 */
function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/**
 * Check if a file type is an image.
 */
function isImage(fileType: string): boolean {
  return fileType.startsWith("image/");
}

/**
 * Renders attachments in a message.
 * - Images: thumbnail with click to expand
 * - Files: card with file icon, name, size, download link
 */
export function ChatAttachmentPreview({ attachments }: ChatAttachmentPreviewProps) {
  const [expandedImage, setExpandedImage] = useState<string | null>(null);

  return (
    <>
      {/* Attachments – horizontal thumbnail row */}
      {attachments.length > 0 && (
        <div className="flex items-center gap-2 mt-2 overflow-x-auto">
          {attachments.map((att) =>
            isImage(att.fileType) ? (
              <button
                key={att.id}
                type="button"
                onClick={() => setExpandedImage(att.fileUrl)}
                className="w-[120px] h-[100px] rounded-lg border border-[rgba(255,255,255,0.06)] hover:border-[rgba(255,255,255,0.15)] overflow-hidden cursor-pointer transition-colors shrink-0"
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={att.fileUrl}
                  alt={att.fileName}
                  className="w-full h-full object-cover"
                  loading="lazy"
                />
              </button>
            ) : (
              <a
                key={att.id}
                href={att.fileUrl}
                download={att.fileName}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-2 rounded-lg border border-[rgba(255,255,255,0.06)] bg-[rgba(255,255,255,0.04)] px-3 py-2 shrink-0 transition-colors hover:border-[rgba(255,255,255,0.15)]"
              >
                <FileIcon className="h-4 w-4 shrink-0 text-zinc-400" />
                <div className="min-w-0">
                  <p className="text-xs font-medium text-zinc-300 truncate">
                    {att.fileName}
                  </p>
                  <p className="text-[10px] text-zinc-500">
                    {formatFileSize(att.fileSize)}
                  </p>
                </div>
                <Download className="h-3.5 w-3.5 shrink-0 text-zinc-500" />
              </a>
            )
          )}
        </div>
      )}

      {/* Expanded image overlay */}
      {expandedImage && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm"
          onClick={() => setExpandedImage(null)}
        >
          <button
            type="button"
            onClick={() => setExpandedImage(null)}
            className="absolute top-4 right-4 flex h-10 w-10 items-center justify-center rounded-full bg-zinc-800/80 text-zinc-300 hover:bg-zinc-700 transition-colors"
            aria-label="Cerrar imagen"
          >
            <X className="h-5 w-5" />
          </button>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={expandedImage}
            alt="Imagen expandida"
            className="max-w-[90vw] max-h-[90vh] object-contain rounded-lg"
            onClick={(e) => e.stopPropagation()}
          />
        </div>
      )}
    </>
  );
}
