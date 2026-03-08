"use client";

import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { ChatPortalWrapper } from "@/components/chat/ChatPortalWrapper";
import type { GuardSession } from "@/lib/guard-portal";

interface ChatGuardPortalProps {
  session: GuardSession;
}

/**
 * Guard portal chat — single-channel (installation channel).
 * Fetches the channel ID on mount, then renders ChatPortalWrapper.
 */
export function ChatGuardPortal({ session }: ChatGuardPortalProps) {
  const [channelId, setChannelId] = useState<string | null>(null);
  const [channelName, setChannelName] = useState("");
  const [isLoading, setIsLoading] = useState(true);

  const senderName = `${session.firstName} ${session.lastName}`.trim();

  const apiHeaders: Record<string, string> = {
    "x-guardia-id": session.guardiaId,
    "x-tenant-id": session.tenantId,
    "x-guardia-name": senderName,
  };

  useEffect(() => {
    fetch("/api/portal/guardia/chat/channels", {
      headers: apiHeaders,
    })
      .then((r) => r.json())
      .then((res) => {
        if (res.success && res.data?.length > 0) {
          setChannelId(res.data[0].id);
          setChannelName(res.data[0].name ?? "Chat");
        }
      })
      .catch(() => {})
      .finally(() => setIsLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (isLoading) {
    return (
      <div className="flex flex-1 items-center justify-center h-full">
        <Loader2 className="h-6 w-6 animate-spin text-zinc-400" />
      </div>
    );
  }

  if (!channelId) {
    return (
      <div className="flex flex-1 items-center justify-center h-full p-6">
        <p className="text-zinc-400 text-sm text-center">No hay chat disponible.</p>
      </div>
    );
  }

  return (
    <ChatPortalWrapper
      apiBase="/api/portal/guardia/chat"
      apiHeaders={apiHeaders}
      pusherAuthEndpoint="/api/portal/guardia/chat/pusher/auth"
      pusherAuthHeaders={apiHeaders}
      uploadEndpoint="/api/portal/guardia/chat/upload"
      senderName={senderName}
      senderType="GUARD"
      channelId={channelId}
      channelName={channelName}
      channelSubtitle="Chat de instalacion"
      enableEmoji
      enableFileUpload
    />
  );
}
