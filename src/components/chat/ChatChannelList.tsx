"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Search } from "lucide-react";
import { cn } from "@/lib/utils";
import type { ChatChannelData, ChannelsResponse } from "@/lib/chat-types";
import { ChatChannelListItem } from "./ChatChannelListItem";

interface ChatChannelListProps {
  selectedChannelId: string | null;
  unreadCounts: Record<string, number>;
  onSelectChannel: (channelId: string, channelName: string) => void;
}

/**
 * Scrollable list of channels with search input at top.
 * Fetches channels from /api/chat/channels (with search param).
 */
export function ChatChannelList({
  selectedChannelId,
  unreadCounts,
  onSelectChannel,
}: ChatChannelListProps) {
  const [channels, setChannels] = useState<ChatChannelData[]>([]);
  const [search, setSearch] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const fetchChannels = useCallback(async (query?: string) => {
    setIsLoading(true);
    try {
      const params = new URLSearchParams();
      if (query) params.set("search", query);
      const res = await fetch(`/api/chat/channels?${params.toString()}`);
      if (!res.ok) {
        const text = await res.text().catch(() => "");
        console.error("[ChatChannelList] API error:", res.status, text.slice(0, 200));
        throw new Error(`Failed to fetch channels (${res.status})`);
      }

      const json: ChannelsResponse = await res.json();
      if (json.success) {
        setChannels(json.data);
      }
    } catch (err) {
      console.error("[ChatChannelList] fetch error:", err);
    } finally {
      setIsLoading(false);
    }
  }, []);

  // Initial fetch
  useEffect(() => {
    fetchChannels();
  }, [fetchChannels]);

  // Debounced search
  const handleSearchChange = useCallback(
    (value: string) => {
      setSearch(value);
      if (debounceRef.current) clearTimeout(debounceRef.current);
      debounceRef.current = setTimeout(() => {
        fetchChannels(value || undefined);
      }, 300);
    },
    [fetchChannels]
  );

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="shrink-0 px-4 py-3 border-b border-zinc-800">
        <h2 className="text-sm font-semibold text-zinc-100 mb-3">Chat</h2>
        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-zinc-500" />
          <input
            type="text"
            value={search}
            onChange={(e) => handleSearchChange(e.target.value)}
            placeholder="Buscar canal..."
            className="w-full rounded-md border border-zinc-700 bg-zinc-900 py-1.5 pl-8 pr-3 text-sm text-zinc-100 placeholder:text-zinc-500 focus:border-zinc-600 focus:outline-none focus:ring-1 focus:ring-zinc-600 transition-colors"
          />
        </div>
      </div>

      {/* Channel list */}
      <div className="flex-1 overflow-y-auto">
        {isLoading && channels.length === 0 ? (
          <div className="flex items-center justify-center py-12">
            <div className="h-5 w-5 animate-spin rounded-full border-2 border-zinc-600 border-t-zinc-300" />
          </div>
        ) : channels.length === 0 ? (
          <div className="px-4 py-8 text-center text-sm text-zinc-500">
            {search ? "Sin resultados" : "Sin canales disponibles"}
          </div>
        ) : (
          <div className="py-1">
            {channels.map((channel) => (
              <ChatChannelListItem
                key={channel.id}
                channel={channel}
                isSelected={channel.id === selectedChannelId}
                unreadCount={unreadCounts[channel.id] || 0}
                onClick={() => onSelectChannel(channel.id, channel.name)}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
