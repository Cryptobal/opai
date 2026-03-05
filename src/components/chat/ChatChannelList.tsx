"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Building2, ChevronDown, ChevronRight, MessageCircle, Plus, Search, Users } from "lucide-react";
import { cn } from "@/lib/utils";
import type { ChatChannelData, ChannelsResponse } from "@/lib/chat-types";
import { ChatChannelListItem } from "./ChatChannelListItem";
import { ChatNewDmModal } from "./ChatNewDmModal";

interface ChatChannelListProps {
  selectedChannelId: string | null;
  unreadCounts: Record<string, number>;
  onSelectChannel: (channelId: string, channelName: string) => void;
}

function SectionHeader({
  label,
  icon,
  count,
  unreadCount,
  collapsed,
  onToggle,
  action,
}: {
  label: string;
  icon: React.ReactNode;
  count: number;
  unreadCount: number;
  collapsed: boolean;
  onToggle: () => void;
  action?: React.ReactNode;
}) {
  return (
    <div className="flex items-center group">
      <button
        type="button"
        onClick={onToggle}
        className="flex-1 flex items-center gap-2 px-4 py-2 text-xs font-semibold text-zinc-500 uppercase tracking-wider hover:bg-zinc-800/50 transition-colors"
      >
        {collapsed ? (
          <ChevronRight className="h-3 w-3 shrink-0" />
        ) : (
          <ChevronDown className="h-3 w-3 shrink-0" />
        )}
        {icon}
        <span className="flex-1 text-left">{label}</span>
        <span className="text-[10px] font-normal normal-case tracking-normal text-zinc-600">
          {count}
        </span>
        {unreadCount > 0 && (
          <span className="flex h-4 min-w-[16px] items-center justify-center rounded-full bg-teal-600 px-1 text-[9px] font-bold text-white">
            {unreadCount > 99 ? "99+" : unreadCount}
          </span>
        )}
      </button>
      {action && (
        <div className="pr-2 opacity-0 group-hover:opacity-100 transition-opacity">
          {action}
        </div>
      )}
    </div>
  );
}

export function ChatChannelList({
  selectedChannelId,
  unreadCounts,
  onSelectChannel,
}: ChatChannelListProps) {
  const [channels, setChannels] = useState<ChatChannelData[]>([]);
  const [search, setSearch] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [showNewDm, setShowNewDm] = useState(false);
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({
    direct: false,
    group: true,
    installation: true,
  });
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const fetchChannels = useCallback(async (query?: string) => {
    setIsLoading(true);
    try {
      const params = new URLSearchParams();
      if (query) params.set("search", query);
      const res = await fetch(`/api/chat/channels?${params.toString()}`);
      if (!res.ok) throw new Error(`Failed to fetch channels (${res.status})`);
      const json: ChannelsResponse = await res.json();
      if (json.success) setChannels(json.data);
    } catch (err) {
      console.error("[ChatChannelList] fetch error:", err);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchChannels();
  }, [fetchChannels]);

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

  const toggleSection = (key: string) => {
    setCollapsed((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  const isSearching = search.trim().length > 0;

  const { directChannels, groupChannels, installationChannels } = useMemo(() => ({
    directChannels: channels.filter((ch) => ch.channelType === "DIRECT"),
    groupChannels: channels.filter((ch) => ch.channelType === "GROUP"),
    installationChannels: channels.filter((ch) => ch.channelType === "INSTALLATION"),
  }), [channels]);

  const getDisplayName = (channel: ChatChannelData) => {
    if (channel.channelType === "DIRECT" && channel.dmParticipant) return channel.dmParticipant.name;
    if (channel.channelType === "INSTALLATION" && (channel as any).installation) return (channel as any).installation.name;
    return channel.name;
  };

  const sectionUnread = (chs: ChatChannelData[]) =>
    chs.reduce((sum, ch) => sum + (unreadCounts[ch.id] || 0), 0);

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="shrink-0 px-4 py-3 border-b border-zinc-800">
        <h2 className="text-sm font-semibold text-zinc-100 mb-3">Chat</h2>
        {/* Search input */}
        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-zinc-500" />
          <input
            type="text"
            value={search}
            onChange={(e) => handleSearchChange(e.target.value)}
            placeholder="Buscar canal o conversación..."
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
            {/* Direct Messages */}
            {directChannels.length > 0 && (
              <div>
                <SectionHeader
                  label="Mensajes directos"
                  icon={<MessageCircle className="h-3.5 w-3.5" />}
                  count={directChannels.length}
                  unreadCount={sectionUnread(directChannels)}
                  collapsed={isSearching ? false : collapsed["direct"]}
                  onToggle={() => toggleSection("direct")}
                  action={
                    <button
                      type="button"
                      onClick={(e) => { e.stopPropagation(); setShowNewDm(true); }}
                      className="flex h-5 w-5 items-center justify-center rounded text-zinc-500 hover:bg-zinc-700 hover:text-zinc-200 transition-colors"
                      title="Nuevo mensaje directo"
                    >
                      <Plus className="h-3 w-3" />
                    </button>
                  }
                />
                {(isSearching ? true : !collapsed["direct"]) && (
                  <div>
                    {directChannels.map((channel) => (
                      <ChatChannelListItem
                        key={channel.id}
                        channel={channel}
                        isSelected={channel.id === selectedChannelId}
                        unreadCount={unreadCounts[channel.id] || 0}
                        onClick={() => onSelectChannel(channel.id, getDisplayName(channel))}
                      />
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* Groups */}
            {groupChannels.length > 0 && (
              <div>
                <SectionHeader
                  label="Grupos"
                  icon={<Users className="h-3.5 w-3.5" />}
                  count={groupChannels.length}
                  unreadCount={sectionUnread(groupChannels)}
                  collapsed={isSearching ? false : collapsed["group"]}
                  onToggle={() => toggleSection("group")}
                />
                {(isSearching ? true : !collapsed["group"]) && (
                  <div>
                    {groupChannels.map((channel) => (
                      <ChatChannelListItem
                        key={channel.id}
                        channel={channel}
                        isSelected={channel.id === selectedChannelId}
                        unreadCount={unreadCounts[channel.id] || 0}
                        onClick={() => onSelectChannel(channel.id, getDisplayName(channel))}
                      />
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* Installations */}
            {installationChannels.length > 0 && (
              <div>
                <SectionHeader
                  label="Instalaciones"
                  icon={<Building2 className="h-3.5 w-3.5" />}
                  count={installationChannels.length}
                  unreadCount={sectionUnread(installationChannels)}
                  collapsed={isSearching ? false : collapsed["installation"]}
                  onToggle={() => toggleSection("installation")}
                />
                {(isSearching ? true : !collapsed["installation"]) && (
                  <div>
                    {installationChannels.map((channel) => (
                      <ChatChannelListItem
                        key={channel.id}
                        channel={channel}
                        isSelected={channel.id === selectedChannelId}
                        unreadCount={unreadCounts[channel.id] || 0}
                        onClick={() => onSelectChannel(channel.id, getDisplayName(channel))}
                      />
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </div>

      {/* New DM Modal */}
      {showNewDm && (
        <ChatNewDmModal
          onClose={() => setShowNewDm(false)}
          onSelectDm={(channelId, channelName) => {
            setShowNewDm(false);
            fetchChannels();
            onSelectChannel(channelId, channelName);
          }}
        />
      )}
    </div>
  );
}
