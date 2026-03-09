"use client";

import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { MessageSquare, X } from "lucide-react";

interface ChatToastProps {
  channelName: string;
  senderName?: string;
  messagePreview?: string;
  messageCount?: number;
  channelId: string;
  toastId: string | number;
  chatUrl?: string;
}

export function ChatToast({
  channelName,
  senderName,
  messagePreview,
  messageCount,
  channelId,
  toastId,
  chatUrl,
}: ChatToastProps) {
  const router = useRouter();

  return (
    <div
      onClick={() => {
        toast.dismiss(toastId);
        router.push(chatUrl || `/chat?channel=${channelId}`);
      }}
      className="flex items-start gap-3 p-3 bg-card border border-border rounded-lg shadow-lg cursor-pointer hover:bg-accent/50 transition-colors w-80"
    >
      <div className="flex-shrink-0 mt-0.5">
        <MessageSquare className="h-5 w-5 text-primary" />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-foreground truncate">
          {channelName}
        </p>
        <p className="text-sm text-muted-foreground truncate">
          {messageCount
            ? `${messageCount} mensajes nuevos`
            : senderName && messagePreview
              ? `${senderName}: ${messagePreview}`
              : senderName || "Nuevo mensaje"}
        </p>
      </div>
      <button
        onClick={(e) => {
          e.stopPropagation();
          toast.dismiss(toastId);
        }}
        className="flex-shrink-0 text-muted-foreground hover:text-foreground p-0.5"
      >
        <X className="h-4 w-4" />
      </button>
    </div>
  );
}
