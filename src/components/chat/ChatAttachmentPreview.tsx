"use client";

import { useState } from "react";
import {
  Image as ImageIcon,
  File as FileIcon,
  Download,
  X,
} from "lucide-react";
import { cn } from "@/lib/utils";
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

  const images = attachments.filter((a) => isImage(a.fileType));
  const files = attachments.filter((a) => !isImage(a.fileType));

  return (
    <>
      {/* Images */}
      {images.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {images.map((img) => (
            <button
              key={img.id}
              type="button"
              onClick={() => setExpandedImage(img.fileUrl)}
              className="group relative overflow-hidden rounded-lg border border-zinc-700/50 transition-all hover:border-zinc-600"
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={img.fileUrl}
                alt={img.fileName}
                className="max-w-64 max-h-48 object-cover rounded-lg"
                loading="lazy"
              />
              <div className="absolute inset-0 bg-black/0 group-hover:bg-black/10 transition-colors" />
            </button>
          ))}
        </div>
      )}

      {/* Files */}
      {files.length > 0 && (
        <div className="flex flex-col gap-1.5">
          {files.map((file) => (
            <a
              key={file.id}
              href={file.fileUrl}
              download={file.fileName}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-2.5 rounded-lg border border-zinc-700/50 bg-zinc-800/30 px-3 py-2 transition-colors hover:bg-zinc-800/60 hover:border-zinc-600"
            >
              <FileIcon className="h-4 w-4 shrink-0 text-zinc-400" />
              <div className="flex-1 min-w-0">
                <p className="text-xs font-medium text-zinc-300 truncate">
                  {file.fileName}
                </p>
                <p className="text-[10px] text-zinc-500">
                  {formatFileSize(file.fileSize)}
                </p>
              </div>
              <Download className="h-3.5 w-3.5 shrink-0 text-zinc-500" />
            </a>
          ))}
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
