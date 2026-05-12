"use client";

import { useState } from "react";
import { ArrowLeft } from "lucide-react";
import { ChatPortalChannelList } from "@/components/chat/ChatPortalChannelList";
import { ChatPortalWrapper } from "@/components/chat/ChatPortalWrapper";
import type { SupervisorSession } from "@/lib/portal-supervisor";

interface ChatSupervisorPortalProps {
  session: SupervisorSession;
}

/**
 * Supervisor portal chat — multi-channel.
 * Uses ADMIN API endpoints with channel filtering by supervisor's installations.
 */
export function ChatSupervisorPortal({ session }: ChatSupervisorPortalProps) {
  const [selectedChannel, setSelectedChannel] = useState<{
    id: string;
    name: string;
  } | null>(null);

  const apiHeaders: Record<string, string> = {
    "x-sender-type": "ADMIN",
  };

  if (selectedChannel) {
    return (
      <div className="flex flex-col h-full overflow-hidden">
        <ChatPortalWrapper
          apiBase="/api/chat"
          apiHeaders={apiHeaders}
          pusherAuthEndpoint="/api/chat/pusher/auth"
          pusherAuthHeaders={apiHeaders}
          uploadEndpoint="/api/chat/upload"
          senderName={session.name}
          senderType="ADMIN"
          channelId={selectedChannel.id}
          channelName={selectedChannel.name}
          onBack={() => setSelectedChannel(null)}
          enableEmoji
          enableFileUpload
        />
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Header */}
      <div className="shrink-0 flex items-center gap-3 h-14 px-4 border-b border-[rgba(255,255,255,0.06)] bg-[#0d1220]">
        <h3 className="text-sm font-semibold text-[rgba(255,255,255,0.88)]">
          Chat
        </h3>
      </div>

      {/* Channel list */}
      <ChatPortalChannelList
        apiBase="/api/chat"
        apiHeaders={apiHeaders}
        onSelectChannel={(id, name) => setSelectedChannel({ id, name })}
        selectedChannelId={null}
      />
    </div>
  );
}
