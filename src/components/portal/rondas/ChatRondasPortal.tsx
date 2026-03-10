"use client";

import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { ChatPortalWrapper } from "@/components/chat/ChatPortalWrapper";
import type { RondasSession } from "./RondasPortalClient";

interface ChatRondasPortalProps {
  session: RondasSession;
  onBack: () => void;
}

/**
 * Rondas portal chat — single-channel.
 * Fetches the installation channel ID on mount, then renders ChatPortalWrapper.
 */
export function ChatRondasPortal({ session, onBack }: ChatRondasPortalProps) {
  const [channelId, setChannelId] = useState<string | null>(null);
  const [channelName, setChannelName] = useState("");
  const [isLoading, setIsLoading] = useState(true);

  const apiHeaders: Record<string, string> = {
    "x-guardia-id": session.guardiaId,
    "x-tenant-id": session.tenantId,
    "x-guardia-name": encodeURIComponent(session.nombre),
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
      senderName={session.nombre}
      senderType="GUARD"
      channelId={channelId}
      channelName={channelName}
      channelSubtitle="Chat de instalacion"
      onBack={onBack}
      enableEmoji
      enableFileUpload
    />
  );
}
