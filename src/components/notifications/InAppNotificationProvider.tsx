"use client";

import { useEffect, useRef, useCallback } from "react";
import { toast } from "sonner";
import { ChatToast } from "./ChatToast";
import { playNotificationSound } from "@/lib/notification-sounds";

interface InAppNotification {
  type: "chat_message";
  channelId: string;
  channelName: string;
  senderName: string;
  messagePreview: string;
  timestamp: string;
}

interface Props {
  children: React.ReactNode;
  pusherKey: string;
  pusherCluster: string;
  pusherAuthEndpoint: string;
  tenantId: string;
  userType: "ADMIN" | "GUARD" | "CLIENT";
  userId: string;
  chatUrlPrefix?: string;
}

/** Detect if the message preview indicates a file/attachment rather than text. */
function isFileMessage(preview: string): boolean {
  if (!preview) return false;
  const lower = preview.toLowerCase();
  return lower.startsWith("[archivo adjunto]");
}

export function InAppNotificationProvider({
  children,
  pusherKey,
  pusherCluster,
  pusherAuthEndpoint,
  tenantId,
  userType,
  userId,
  chatUrlPrefix = "/chat",
}: Props) {
  const bufferRef = useRef<
    Map<
      string,
      { count: number; lastSender: string; channelName: string; preview: string; isFile: boolean }
    >
  >(new Map());
  const timerRef = useRef<Map<string, NodeJS.Timeout>>(new Map());

  const handleNotification = useCallback(
    (data: InAppNotification) => {
      // Don't show toast if user is viewing that channel
      const activeChannelId =
        typeof window !== "undefined"
          ? (window as any).__activeChatChannelId
          : null;
      if (data.channelId === activeChannelId) return;

      // Don't show toast if tab is hidden (OS push handles it)
      if (typeof document !== "undefined" && document.hidden) return;

      // Increment unread count in ChatFloatingProvider via window bridge
      if (typeof window !== "undefined" && (window as any).__incrementChatUnread) {
        (window as any).__incrementChatUnread(data.channelId);
      }

      const fileMsg = isFileMessage(data.messagePreview);

      // Buffer rapid messages from same channel
      const buffer = bufferRef.current;
      const existing = buffer.get(data.channelId);

      if (existing) {
        existing.count++;
        existing.lastSender = data.senderName;
        existing.preview = data.messagePreview;
        existing.isFile = fileMsg;
        return; // Flush timer already running
      }

      buffer.set(data.channelId, {
        count: 1,
        lastSender: data.senderName,
        channelName: data.channelName,
        preview: data.messagePreview,
        isFile: fileMsg,
      });

      const timer = setTimeout(() => {
        const info = buffer.get(data.channelId);
        if (!info) return;
        buffer.delete(data.channelId);
        timerRef.current.delete(data.channelId);

        const chatUrl =
          chatUrlPrefix === "/chat"
            ? `/chat?channel=${data.channelId}`
            : `${chatUrlPrefix}?section=chat&channel=${data.channelId}`;

        // Play sound (debounced)
        playNotificationSound("chat");

        toast.custom(
          (t) => (
            <ChatToast
              channelName={info.channelName}
              senderName={info.count === 1 ? info.lastSender : undefined}
              messagePreview={info.count === 1 ? info.preview : undefined}
              messageCount={info.count > 1 ? info.count : undefined}
              channelId={data.channelId}
              toastId={t}
              chatUrl={chatUrl}
              isFile={info.count === 1 ? info.isFile : false}
            />
          ),
          { duration: 5000, position: "bottom-right" },
        );
      }, 1500);

      timerRef.current.set(data.channelId, timer);
    },
    [chatUrlPrefix],
  );

  useEffect(() => {
    if (!tenantId || !userId) return;

    let pusherInstance: any = null;
    let channel: any = null;

    // Dynamic import to avoid SSR issues with pusher-js
    import("pusher-js").then((PusherModule) => {
      const Pusher = PusherModule.default;
      pusherInstance = new Pusher(pusherKey, {
        cluster: pusherCluster,
        authEndpoint: pusherAuthEndpoint,
      });

      const channelName = `private-user-${tenantId}-${userType}-${userId}`;
      channel = pusherInstance.subscribe(channelName);
      channel.bind("in-app-notification", handleNotification);
    });

    return () => {
      if (channel) {
        channel.unbind("in-app-notification", handleNotification);
      }
      if (pusherInstance) {
        pusherInstance.disconnect();
      }
      timerRef.current.forEach((t) => clearTimeout(t));
      timerRef.current.clear();
      bufferRef.current.clear();
    };
  }, [tenantId, userId, userType, pusherKey, pusherCluster, pusherAuthEndpoint, handleNotification]);

  return <>{children}</>;
}
