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
  channelType: string;
  groupId: string | null;
  installationId: string | null;
  lastMessageAt: string | null;
  lastMessagePreview: string | null;
  unreadCount: number;
  group: { id: string; color: string; slug: string } | null;
  installation: {
    id: string;
    name: string;
    account: { id: string; name: string } | null;
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
}

const ChatFloatingContext = createContext<ChatFloatingContextValue | null>(null);

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
  autoContext?: { pageUrl: string; pageLabel: string };
  children: ReactNode;
}

export function ChatFloatingProvider({
  currentUserId,
  autoContext,
  children,
}: ChatFloatingProviderProps) {
  const [isPanelOpen, setIsPanelOpen] = useState(false);
  const [channels, setChannels] = useState<ChatFloatingChannel[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedChannelId, setSelectedChannelId] = useState<string | null>(null);
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
    const fetchUnreads = async () => {
      try {
        const res = await fetch("/api/chat/channels");
        if (!res.ok) return;
        const json = await res.json();
        if (json.success) {
          setChannels(json.data);
        }
      } catch {
        // Ignore
      }
    };

    // Initial fetch for badge
    fetchUnreads();

    // Poll every 30s
    const interval = setInterval(fetchUnreads, 30000);
    return () => clearInterval(interval);
  }, []);

  const totalUnread = channels.reduce((sum, ch) => sum + ch.unreadCount, 0);

  const value: ChatFloatingContextValue = {
    isPanelOpen,
    openPanel,
    closePanel,
    togglePanel,
    channels,
    loading,
    totalUnread,
    selectedChannelId,
    selectChannel: setSelectedChannelId,
    currentUserId,
    autoContext: autoContext ?? null,
    refreshChannels: fetchChannels,
  };

  return (
    <ChatFloatingContext.Provider value={value}>
      {children}
      <ChatFloatingButton />
      <ChatFloatingPanel />
    </ChatFloatingContext.Provider>
  );
}
