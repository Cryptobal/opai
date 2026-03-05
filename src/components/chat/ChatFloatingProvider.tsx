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
import { ChatFloatingButton } from "./ChatFloatingButton";
import { ChatFloatingPanel } from "./ChatFloatingPanel";

/* ─── Types ─── */

export type ChatFloatingChannel = {
  id: string;
  name: string;
  channelType: string; // "DIRECT" | "GROUP" | "INSTALLATION" | "EXTERNAL"
  groupId: string | null;
  installationId: string | null;
  accountId: string | null;
  lastMessageAt: string | null;
  lastMessagePreview: string | null;
  unreadCount: number;
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

interface ChatFloatingContextValue {
  isPanelOpen: boolean;
  openPanel: () => void;
  closePanel: () => void;
  togglePanel: () => void;
  channels: ChatFloatingChannel[];
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
  archivedChannels: ChatFloatingChannel[];
  fetchArchivedChannels: () => Promise<void>;
}

export const ChatFloatingContext = createContext<ChatFloatingContextValue | null>(null);

export function useChatFloatingContext() {
  const ctx = useContext(ChatFloatingContext);
  if (!ctx) {
    throw new Error("useChatFloatingContext must be used inside <ChatFloatingProvider>");
  }
  return ctx;
}

/* ─── Provider ─── */

interface ChatFloatingProviderProps {
  currentUserId: string;
  userRole?: string;
  autoContext?: { pageUrl: string; pageLabel: string };
  children: ReactNode;
}

export function ChatFloatingProvider({
  currentUserId,
  userRole,
  autoContext,
  children,
}: ChatFloatingProviderProps) {
  const [isPanelOpen, setIsPanelOpen] = useState(false);
  const [channels, setChannels] = useState<ChatFloatingChannel[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedChannelId, setSelectedChannelId] = useState<string | null>(null);
  const [archivedChannels, setArchivedChannels] = useState<ChatFloatingChannel[]>([]);
  const fetchedRef = useRef(false);

  const fetchChannels = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/chat/channels");
      if (!res.ok) {
        const text = await res.text().catch(() => "");
        console.error("[ChatFloating] API error:", res.status, text.slice(0, 200));
        throw new Error(`Failed to fetch channels (${res.status})`);
      }
      const json = await res.json();
      if (json.success) {
        setChannels(json.data);
      }
    } catch (err) {
      console.error("Error fetching channels:", err);
    } finally {
      setLoading(false);
    }
  }, []);

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

  // Fetch unread counts periodically for badge
  useEffect(() => {
    // Initial fetch for badge
    fetchChannels();

    // Poll every 30s
    const interval = setInterval(() => {
      fetchChannels();
    }, 30_000);
    return () => clearInterval(interval);
  }, [fetchChannels]);

  const totalUnread = channels.reduce((sum, ch) => sum + ch.unreadCount, 0);

  const selectChannel = useCallback((id: string | null) => {
    setSelectedChannelId(id);
    if (id) {
      // Optimistic update: clear unread count locally so the badge drops immediately
      setChannels(prev =>
        prev.map(ch => ch.id === id ? { ...ch, unreadCount: 0 } : ch)
      );
    }
  }, []);

  const value: ChatFloatingContextValue = {
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
  };

  return (
    <ChatFloatingContext.Provider value={value}>
      {children}
      <ChatFloatingButton />
      <ChatFloatingPanel userRole={userRole} />
    </ChatFloatingContext.Provider>
  );
}
