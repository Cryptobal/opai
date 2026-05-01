"use client";

import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { X } from "lucide-react";

interface ChatToastProps {
  channelName: string;
  senderName?: string;
  messagePreview?: string;
  messageCount?: number;
  channelId: string;
  toastId: string | number;
  chatUrl?: string;
  isFile?: boolean;
}

/** Generate a deterministic color from a string (for avatar background). */
function avatarColor(name: string): string {
  const colors = [
    "bg-status-info", "bg-status-info", "bg-violet-600", "bg-rose-600",
    "bg-amber-600", "bg-status-ok", "bg-cyan-600", "bg-pink-600",
  ];
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = name.charCodeAt(i) + ((hash << 5) - hash);
  }
  return colors[Math.abs(hash) % colors.length];
}

/** Get initials (first two chars of first two words, or first two chars). */
function initials(name: string): string {
  const parts = name.trim().split(/\s+/);
  if (parts.length >= 2) {
    return (parts[0][0] + parts[1][0]).toUpperCase();
  }
  return name.slice(0, 2).toUpperCase();
}

export function ChatToast({
  channelName,
  senderName,
  messagePreview,
  messageCount,
  channelId,
  toastId,
  chatUrl,
  isFile,
}: ChatToastProps) {
  const router = useRouter();

  const displayPreview = isFile
    ? "\uD83D\uDCCE Envió un archivo"
    : messagePreview || "Nuevo mensaje";

  const hasSender = !!senderName;

  return (
    <div
      onClick={() => {
        toast.dismiss(toastId);
        router.push(chatUrl || `/chat?channel=${channelId}`);
      }}
      className="flex items-start gap-3 p-3 cursor-pointer transition-colors hover:bg-white/[0.03] w-[360px] bg-[#0d1220] border border-white/[0.08] border-l-[3px] border-l-teal-400 rounded-xl shadow-[0_8px_24px_rgba(0,0,0,0.4)]"
    >
      {/* Avatar */}
      {hasSender && (
        <div
          className={`flex-shrink-0 w-9 h-9 rounded-lg flex items-center justify-center text-white text-xs font-bold ${avatarColor(senderName!)}`}
        >
          {initials(senderName!)}
        </div>
      )}

      {/* Content */}
      <div className="flex-1 min-w-0">
        {/* Sender + Channel */}
        {hasSender && (
          <>
            <p className="text-[13px] font-bold text-white truncate">
              {senderName}
            </p>
            <p className="text-[12px] text-status-info-fg truncate">
              en # {channelName}
            </p>
          </>
        )}
        {!hasSender && (
          <p className="text-[13px] font-bold text-white truncate">
            # {channelName}
          </p>
        )}

        {/* Preview or count */}
        <p className="text-[13px] text-zinc-400 line-clamp-2 mt-0.5">
          {messageCount
            ? `${messageCount} mensajes nuevos`
            : displayPreview}
        </p>
      </div>

      {/* Close button */}
      <button
        onClick={(e) => {
          e.stopPropagation();
          toast.dismiss(toastId);
        }}
        className="flex-shrink-0 text-zinc-500 hover:text-zinc-300 p-0.5 mt-0.5"
        aria-label="Cerrar notificación"
      >
        <X className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}
