"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";

/* ─── Types ─── */

export type NotifPreference = "ALL" | "MENTIONS_ONLY" | "MUTED";

export type ChatSidePanelChannel = {
  id: string;
  name: string;
  channelType: string; // "DIRECT" | "GROUP" | "INSTALLATION" | "EXTERNAL"
  subType: "reportes" | "interno" | null;
  groupId: string | null;
  installationId: string | null;
  accountId: string | null;
  lastMessageAt: string | null;
  lastMessagePreview: string | null;
  unreadCount: number;
  notificationPreference: NotifPreference;
  isArchivedByMe: boolean;
  group: { id: string; color: string; slug: string } | null;
  installation: {
    id: string;
    name: string;
    account: { id: string; name: string } | null;
  } | null;
  account: {
    id: string;
    name: string;
    status: string;
  } | null;
  dmParticipant: {
    id: string;
    name: string;
    email: string;
    image: null;
  } | null;
};

interface ChatSidePanelContextValue {
  isPanelOpen: boolean;
  openPanel: () => void;
  closePanel: () => void;
  togglePanel: () => void;
  channels: ChatSidePanelChannel[];
  loading: boolean;
  totalUnread: number;
  selectedChannelId: string | null;
  selectChannel: (id: string | null) => void;
  currentUserId: string;
  autoContext: { pageUrl: string; pageLabel: string } | null;
  refreshChannels: () => Promise<void>;
  archiveChannel: (channelId: string) => Promise<void>;
  unarchiveChannel: (channelId: string) => Promise<void>;
  deleteChannel: (channelId: string) => Promise<void>;
  archivedChannels: ChatSidePanelChannel[];
  fetchArchivedChannels: () => Promise<void>;
  markChannelAsRead: (channelId: string) => Promise<void>;
  markAllChannelsAsRead: () => Promise<void>;
  updateChannelNotifPref: (channelId: string, preference: NotifPreference) => Promise<void>;
}

export const ChatSidePanelContext = createContext<ChatSidePanelContextValue | null>(null);

export function useChatSidePanelContext() {
  const ctx = useContext(ChatSidePanelContext);
  if (!ctx) {
    throw new Error("useChatSidePanelContext must be used inside <ChatSidePanelProvider>");
  }
  return ctx;
}

/* ─── Provider ─── */

interface ChatSidePanelProviderProps {
  currentUserId: string;
  userRole?: string;
  autoContext?: { pageUrl: string; pageLabel: string };
  children: ReactNode;
}

export function ChatSidePanelProvider({
  currentUserId,
  autoContext,
  children,
}: ChatSidePanelProviderProps) {
  const [isPanelOpen, setIsPanelOpen] = useState(false);
  const [channels, setChannels] = useState<ChatSidePanelChannel[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedChannelId, setSelectedChannelId] = useState<string | null>(null);
  const [archivedChannels, setArchivedChannels] = useState<ChatSidePanelChannel[]>([]);
  const fetchedRef = useRef(false);

  // Expose unread increment for InAppNotificationProvider
  useEffect(() => {
    if (typeof window === 'undefined') return;
    (window as any).__incrementChatUnread = (channelId: string) => {
      setChannels((prev) =>
        prev.map((ch) =>
          ch.id === channelId
            ? { ...ch, unreadCount: (ch.unreadCount || 0) + 1 }
            : ch
        )
      );
    };
    return () => {
      delete (window as any).__incrementChatUnread;
    };
  }, []);

  const initialLoadDone = useRef(false);

  const fetchChannels = useCallback(async () => {
    if (!currentUserId) return;
    if (!initialLoadDone.current) setLoading(true);
    try {
      const res = await fetch("/api/chat/channels");
      if (!res.ok) {
        if (res.status === 401) {
          setChannels([]);
          return;
        }
        const text = await res.text().catch(() => "");
        const preview = text.startsWith("<") ? "(HTML error page)" : text.slice(0, 150);
        console.error("[ChatSidePanel] API error:", res.status, preview);
        setChannels([]);
        return;
      }
      const json = await res.json();
      if (json.success) {
        setChannels(json.data);
      }
    } catch (err) {
      console.error("[ChatSidePanel] Error fetching channels:", err);
      setChannels([]);
    } finally {
      setLoading(false);
      initialLoadDone.current = true;
    }
  }, [currentUserId]);

  const fetchArchivedChannels = useCallback(async () => {
    try {
      const res = await fetch("/api/chat/archived");
      if (!res.ok) return;
      const json = await res.json();
      if (json.success) setArchivedChannels(json.data);
    } catch {}
  }, []);

  const archiveChannel = useCallback(async (channelId: string) => {
    const res = await fetch(`/api/chat/channels/${channelId}/archive`, { method: "POST" });
    if (!res.ok) return;
    setChannels((prev) => prev.filter((c) => c.id !== channelId));
  }, []);

  const unarchiveChannel = useCallback(async (channelId: string) => {
    const res = await fetch(`/api/chat/channels/${channelId}/archive`, { method: "DELETE" });
    if (!res.ok) return;
    await fetchChannels();
  }, [fetchChannels]);

  const deleteChannel = useCallback(async (channelId: string) => {
    const res = await fetch(`/api/chat/channels/${channelId}`, { method: "DELETE" });
    if (!res.ok) return;
    setChannels((prev) => prev.filter((c) => c.id !== channelId));
  }, []);

  const markChannelAsRead = useCallback(async (channelId: string) => {
    setChannels((prev) =>
      prev.map((ch) => (ch.id === channelId ? { ...ch, unreadCount: 0 } : ch))
    );
    try {
      await fetch(`/api/chat/channels/${channelId}/read`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
    } catch {}
  }, []);

  const markAllChannelsAsRead = useCallback(async () => {
    try {
      const res = await fetch("/api/chat/read-all", { method: "POST" });
      if (!res.ok) return;
      setChannels((prev) => prev.map((ch) => ({ ...ch, unreadCount: 0 })));
    } catch {}
  }, []);

  const updateChannelNotifPref = useCallback(async (channelId: string, preference: NotifPreference) => {
    setChannels((prev) =>
      prev.map((ch) => (ch.id === channelId ? { ...ch, notificationPreference: preference } : ch))
    );
    try {
      await fetch(`/api/chat/channels/${channelId}/notification-preference`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ preference }),
      });
    } catch {}
  }, []);

  // Fetch channels on first panel open
  const openPanel = useCallback(() => {
    setIsPanelOpen(true);
    if (!fetchedRef.current) {
      fetchedRef.current = true;
      fetchChannels();
    }
  }, [fetchChannels]);

  const closePanel = useCallback(() => {
    setIsPanelOpen(false);
    setSelectedChannelId(null);
  }, []);

  const togglePanel = useCallback(() => {
    if (isPanelOpen) {
      closePanel();
    } else {
      openPanel();
    }
  }, [isPanelOpen, closePanel, openPanel]);

  // Fetch unread counts periodically for badge (only when logged in)
  useEffect(() => {
    if (!currentUserId) return;
    fetchChannels();
    const interval = setInterval(fetchChannels, 30_000);
    return () => clearInterval(interval);
  }, [currentUserId, fetchChannels]);

  const totalUnread = channels.reduce((sum, ch) => sum + ch.unreadCount, 0);

  // Sync PWA app badge with real unread count
  useEffect(() => {
    if (typeof navigator === 'undefined') return;
    if (totalUnread > 0 && 'setAppBadge' in navigator) {
      (navigator as any).setAppBadge(totalUnread).catch(() => {});
    } else if (totalUnread === 0 && 'clearAppBadge' in navigator) {
      (navigator as any).clearAppBadge().catch(() => {});
    }
  }, [totalUnread]);

  const selectChannel = useCallback((id: string | null) => {
    setSelectedChannelId(id);
    // Expose active channel for InAppNotificationProvider to suppress duplicate toasts
    if (typeof window !== 'undefined') {
      (window as any).__activeChatChannelId = id;
    }
    if (id) {
      // Optimistic update: clear unread count locally so the badge drops immediately
      setChannels(prev =>
        prev.map(ch => ch.id === id ? { ...ch, unreadCount: 0 } : ch)
      );
    }
  }, []);

  const value: ChatSidePanelContextValue = {
    isPanelOpen,
    openPanel,
    closePanel,
    togglePanel,
    channels,
    loading,
    totalUnread,
    selectedChannelId,
    selectChannel,
    currentUserId,
    autoContext: autoContext ?? null,
    refreshChannels: fetchChannels,
    archiveChannel,
    unarchiveChannel,
    deleteChannel,
    archivedChannels,
    fetchArchivedChannels,
    markChannelAsRead,
    markAllChannelsAsRead,
    updateChannelNotifPref,
  };

  return (
    <ChatSidePanelContext.Provider value={value}>
      {children}
    </ChatSidePanelContext.Provider>
  );
}

