"use client";

import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { ChatPortalChannelList, type LockedChannel } from "@/components/chat/ChatPortalChannelList";
import { ChatPortalWrapper } from "@/components/chat/ChatPortalWrapper";
import type { ClienteSession } from "@/lib/portal-cliente-types";

interface ChatClientePortalProps {
  session: ClienteSession;
}

/**
 * Cliente portal chat — multi-channel with locked channels support.
 * Uses cliente API endpoints with contact auth headers.
 * En móvil: transición fluida lista ↔ conversación, swipe right para volver.
 */
export function ChatClientePortal({ session }: ChatClientePortalProps) {
  const [selectedChannel, setSelectedChannel] = useState<{
    id: string;
    name: string;
  } | null>(null);
  const [lockedChannels, setLockedChannels] = useState<LockedChannel[]>([]);
  const [prefetchedChannels, setPrefetchedChannels] = useState<any[] | null>(null);
  const [autoSelectDone, setAutoSelectDone] = useState(false);

  const senderName = session.lastName
    ? `${session.firstName} ${session.lastName}`
    : session.firstName;

  const apiHeaders: Record<string, string> = {
    "x-contact-id": session.contactId,
    "x-tenant-id": session.tenantId,
    "x-account-id": session.accountId,
    "x-contact-name": encodeURIComponent(senderName),
  };

  // Fetch locked channels from the channels endpoint
  useEffect(() => {
    fetch("/api/portal/cliente/chat/channels", {
      headers: apiHeaders,
    })
      .then((r) => r.json())
      .then((res) => {
        if (res.lockedChannels) {
          setLockedChannels(res.lockedChannels);
        }
        // Save fetched channels to avoid re-fetching in ChatPortalChannelList
        const channels = res.success ? res.data ?? [] : [];
        setPrefetchedChannels(channels);
        // Auto-select single channel
        if (channels.length === 1 && !res.lockedChannels?.length) {
          setSelectedChannel({ id: channels[0].id, name: channels[0].name });
        }
        setAutoSelectDone(true);
      })
      .catch(() => setAutoSelectDone(true));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (!autoSelectDone) {
    return (
      <div className="flex flex-1 items-center justify-center h-full">
        <Loader2 className="h-6 w-6 animate-spin text-zinc-400" />
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full overflow-hidden relative">
      {/* Lista de canales — slide a la izquierda cuando hay conversación */}
      <div
        className={cn(
          "absolute inset-0 flex flex-col bg-[#0a0e17] transition-transform duration-[250ms] ease-out z-0",
          selectedChannel ? "-translate-x-full" : "translate-x-0"
        )}
      >
        <div className="shrink-0 flex items-center gap-3 h-14 px-4 border-b border-[rgba(255,255,255,0.06)] bg-[#0d1220]">
          <h3 className="text-sm font-semibold text-[rgba(255,255,255,0.88)]">
            Chat con tu equipo
          </h3>
        </div>
        <ChatPortalChannelList
          apiBase="/api/portal/cliente/chat"
          apiHeaders={apiHeaders}
          groupsEndpoint="/api/portal/cliente/chat/groups"
          onSelectChannel={(id, name) => setSelectedChannel({ id, name })}
          selectedChannelId={selectedChannel?.id ?? null}
          lockedChannels={lockedChannels}
          autoSelectSingle
          initialChannels={prefetchedChannels ?? undefined}
        />
      </div>

      {/* Conversación — slide desde la derecha */}
      <div
        className={cn(
          "absolute inset-0 flex flex-col bg-[#0a0e17] transition-transform duration-[250ms] ease-out z-10",
          selectedChannel ? "translate-x-0" : "translate-x-full"
        )}
      >
        {selectedChannel && (
          <ChatPortalWrapper
            apiBase="/api/portal/cliente/chat"
            apiHeaders={apiHeaders}
            pusherAuthEndpoint="/api/portal/cliente/chat/pusher/auth"
            pusherAuthHeaders={apiHeaders}
            uploadEndpoint="/api/portal/cliente/chat/upload"
            senderName={senderName}
            senderType="CLIENT"
            channelId={selectedChannel.id}
            channelName={selectedChannel.name}
            onBack={() => setSelectedChannel(null)}
            enableEmoji
            enableFileUpload
          />
        )}
      </div>
    </div>
  );
}
