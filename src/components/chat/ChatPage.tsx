"use client";

import { useCallback, useState } from "react";
import { useSearchParams } from "next/navigation";
import { cn } from "@/lib/utils";
import { ChatChannelList } from "./ChatChannelList";
import { ChatConversation } from "./ChatConversation";
import { usePusher } from "./hooks/usePusher";
import { useChatUnreadCounts } from "./hooks/useChatUnreadCounts";

interface ChatPageProps {
  currentUserId?: string;
  userRole?: string;
}

/**
 * Full-page chat layout with two panels:
 * - Left: ChatChannelList (260px width, border-right)
 * - Right: ChatConversation (flex-1)
 *
 * On mobile (< lg): shows only channel list OR conversation,
 * toggled on channel select with a back button to return.
 */
export function ChatPage({ currentUserId, userRole }: ChatPageProps) {
  const searchParams = useSearchParams();
  const initialChannel = searchParams.get("channel");
  const [selectedChannelId, setSelectedChannelId] = useState<string | null>(initialChannel);
  const [selectedChannelName, setSelectedChannelName] = useState<string>("");
  const pusher = usePusher("/api/chat/pusher/auth");
  const { channels: unreadChannels, refresh: refreshUnread, markChannelAsRead } = useChatUnreadCounts();

  const handleSelectChannel = useCallback(
    (channelId: string, channelName: string) => {
      setSelectedChannelId(channelId);
      setSelectedChannelName(channelName);
    },
    []
  );

  const handleBack = useCallback(() => {
    setSelectedChannelId(null);
    setSelectedChannelName("");
    refreshUnread();
  }, [refreshUnread]);

  return (
    <div className="chat-full-height flex overflow-hidden rounded-lg border border-[rgba(255,255,255,0.06)] bg-[#0a0e17]">
      {/* Left panel: Channel list */}
      <div
        className={cn(
          "w-full lg:w-[260px] lg:min-w-[260px] shrink-0 border-r border-[rgba(255,255,255,0.06)] flex flex-col",
          // On mobile, hide when a channel is selected
          selectedChannelId ? "hidden lg:flex" : "flex"
        )}
      >
        <ChatChannelList
          selectedChannelId={selectedChannelId}
          unreadCounts={unreadChannels}
          onSelectChannel={handleSelectChannel}
          userRole={userRole}
        />
      </div>

      {/* Right panel: Conversation */}
      <div
        className={cn(
          "flex-1 min-w-0 flex flex-col",
          // On mobile, hide when no channel is selected
          !selectedChannelId ? "hidden lg:flex" : "flex"
        )}
      >
        {selectedChannelId ? (
          <ChatConversation
            channelId={selectedChannelId}
            channelName={selectedChannelName}
            pusher={pusher}
            onBack={handleBack}
            currentUserId={currentUserId}
            userRole={userRole}
            onMarkAsRead={markChannelAsRead}
          />
        ) : (
          <div className="flex flex-1 items-center justify-center text-[rgba(255,255,255,0.45)]">
            <div className="text-center">
              <p className="text-lg font-medium">Selecciona una conversacion</p>
              <p className="mt-1 text-sm text-[rgba(255,255,255,0.28)]">
                Elige un canal del listado para comenzar
              </p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
