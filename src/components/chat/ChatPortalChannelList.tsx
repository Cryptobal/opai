"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Search, ChevronDown, ChevronRight, Lock, MessageCircle, Hash } from "lucide-react";
import { cn } from "@/lib/utils";
import type { ChatChannelData } from "@/lib/chat-types";

export interface LockedChannel {
  icon: string;
  name: string;
  desc: string;
  locked: boolean;
}

interface ChatPortalChannelListProps {
  /** API base for fetching channels, e.g. "/api/chat" or "/api/portal/cliente/chat" */
  apiBase: string;
  /** Extra headers for auth */
  apiHeaders?: Record<string, string>;
  /** Callback when a channel is selected */
  onSelectChannel: (id: string, name: string, type?: string) => void;
  /** Currently selected channel ID */
  selectedChannelId?: string | null;
  /** Optional groups endpoint for portals that fetch groups separately (e.g. Cliente) */
  groupsEndpoint?: string;
  /** Locked channels to display (disabled UI) */
  lockedChannels?: LockedChannel[];
  /** If true, auto-selects the first channel when there's only one */
  autoSelectSingle?: boolean;
  /** Pre-fetched channels to avoid a duplicate fetch */
  initialChannels?: ChatChannelData[];
}

type ChannelSection = {
  key: string;
  label: string;
  channels: ChatChannelData[];
};

function getDisplayName(ch: ChatChannelData): string {
  if (ch.channelType === "DIRECT" && ch.dmParticipant) return ch.dmParticipant.name;
  if (ch.channelType === "INSTALLATION" && ch.installation) return ch.installation.name;
  if (ch.channelType === "EXTERNAL" && ch.account) return ch.account.name;
  return ch.name;
}

function getChannelIcon(ch: ChatChannelData) {
  if (ch.channelType === "DIRECT") return MessageCircle;
  return Hash;
}

/**
 * Reusable channel list for portal chat screens.
 * Groups channels by type, supports search, unread badges, and locked channels.
 */
export function ChatPortalChannelList({
  apiBase,
  apiHeaders,
  onSelectChannel,
  selectedChannelId,
  groupsEndpoint,
  lockedChannels,
  autoSelectSingle = false,
  initialChannels,
}: ChatPortalChannelListProps) {
  const [channels, setChannels] = useState<ChatChannelData[]>(initialChannels ?? []);
  const [groupChannels, setGroupChannels] = useState<ChatChannelData[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [collapsedSections, setCollapsedSections] = useState<Set<string>>(new Set());
  const [filter, setFilter] = useState<"all" | "unread">("all");
  const autoSelectedRef = useRef(false);
  const prevSelectedChannelIdRef = useRef<string | null | undefined>(selectedChannelId);

  const refreshChannels = useCallback(
    async (withLoading = false) => {
      if (withLoading) setIsLoading(true);
      const promises: Promise<void>[] = [];

      promises.push(
        fetch(`${apiBase}/channels`, { headers: apiHeaders })
          .then((r) => r.json())
          .then((res) => {
            if (res.success) setChannels(res.data ?? []);
          })
          .catch(() => {}),
      );

      if (groupsEndpoint) {
        promises.push(
          fetch(groupsEndpoint, { headers: apiHeaders })
            .then((r) => r.json())
            .then((res) => {
              if (res.success) setGroupChannels(res.data ?? []);
            })
            .catch(() => {}),
        );
      }

      await Promise.all(promises);
      if (withLoading) setIsLoading(false);
    },
    [apiBase, apiHeaders, groupsEndpoint],
  );

  // Initial fetch (skip main channels fetch if initialChannels provided)
  useEffect(() => {
    if (initialChannels && !groupsEndpoint) {
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    const promises: Promise<void>[] = [];

    if (!initialChannels) {
      promises.push(
        fetch(`${apiBase}/channels`, { headers: apiHeaders })
          .then((r) => r.json())
          .then((res) => {
            if (res.success) setChannels(res.data ?? []);
          })
          .catch(() => {}),
      );
    }

    if (groupsEndpoint) {
      promises.push(
        fetch(groupsEndpoint, { headers: apiHeaders })
          .then((r) => r.json())
          .then((res) => {
            if (res.success) setGroupChannels(res.data ?? []);
          })
          .catch(() => {}),
      );
    }

    Promise.all(promises).finally(() => setIsLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [apiBase, groupsEndpoint]);

  // Refetch when the user returns from a conversation (selectedChannelId: value → null)
  useEffect(() => {
    const prev = prevSelectedChannelIdRef.current;
    prevSelectedChannelIdRef.current = selectedChannelId;
    if (prev && !selectedChannelId) {
      refreshChannels();
    }
  }, [selectedChannelId, refreshChannels]);

  // Auto-select single channel
  useEffect(() => {
    if (!autoSelectSingle || autoSelectedRef.current) return;
    const all = [...channels, ...groupChannels];
    if (all.length === 1 && !isLoading) {
      autoSelectedRef.current = true;
      const ch = all[0];
      onSelectChannel(ch.id, getDisplayName(ch), ch.channelType);
    }
  }, [channels, groupChannels, isLoading, autoSelectSingle, onSelectChannel]);

  // Build sections
  const buildSections = useCallback((): ChannelSection[] => {
    const allChannels = [...channels, ...groupChannels];
    const query = searchQuery.toLowerCase().trim();

    // Filter by search
    let filtered = allChannels;
    if (query) {
      filtered = filtered.filter((ch) =>
        getDisplayName(ch).toLowerCase().includes(query),
      );
    }

    // Filter by unread (exclude MUTED channels)
    if (filter === "unread") {
      filtered = filtered.filter((ch) => (ch.unreadCount ?? 0) > 0 && (ch.notificationPreference ?? "ALL") !== "MUTED");
    }

    // Group by type
    const groups: Record<string, ChatChannelData[]> = {};
    for (const ch of filtered) {
      let key: string;
      if (ch.channelType === "GROUP") key = "grupos";
      else if (ch.channelType === "DIRECT") key = "mensajes-directos";
      else if (ch.channelType === "INSTALLATION") key = "instalaciones-reportes";
      else if (ch.channelType === "EXTERNAL") key = "externos";
      else key = "otros";

      if (!groups[key]) groups[key] = [];
      groups[key].push(ch);
    }

    // Sort each group by lastMessageAt desc
    for (const key of Object.keys(groups)) {
      groups[key].sort((a, b) => {
        const aTime = a.lastMessageAt ? new Date(a.lastMessageAt).getTime() : 0;
        const bTime = b.lastMessageAt ? new Date(b.lastMessageAt).getTime() : 0;
        return bTime - aTime;
      });
    }

    const sectionOrder = [
      { key: "grupos", label: "Grupos" },
      { key: "instalaciones-reportes", label: "Instalaciones - Reportes" },
      { key: "mensajes-directos", label: "Mensajes Directos" },
      { key: "externos", label: "Externos" },
      { key: "otros", label: "Otros" },
    ];

    return sectionOrder
      .filter((s) => groups[s.key]?.length > 0)
      .map((s) => ({ key: s.key, label: s.label, channels: groups[s.key] }));
  }, [channels, groupChannels, searchQuery, filter]);

  const sections = buildSections();

  const toggleSection = (key: string) => {
    setCollapsedSections((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  if (isLoading) {
    return (
      <div className="flex flex-col h-full overflow-hidden px-2 pt-3">
        {/* Skeleton search bar */}
        <div className="mx-1 mb-3 h-8 rounded-lg bg-[rgba(255,255,255,0.04)] animate-pulse" />
        {/* Skeleton channel items */}
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="flex items-center gap-2.5 px-3 py-2.5">
            <div className="h-4 w-4 rounded bg-[rgba(255,255,255,0.06)] animate-pulse" />
            <div className="flex-1 space-y-1.5">
              <div className="h-3.5 rounded bg-[rgba(255,255,255,0.06)] animate-pulse" style={{ width: `${55 + i * 8}%` }} />
              <div className="h-2.5 rounded bg-[rgba(255,255,255,0.04)] animate-pulse" style={{ width: `${70 + i * 5}%` }} />
            </div>
          </div>
        ))}
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Search */}
      <div className="shrink-0 px-3 pt-3 pb-2">
        <div className="flex items-center gap-2 rounded-lg border border-[rgba(255,255,255,0.06)] bg-[#141a2a] px-3 py-1.5">
          <Search className="h-3.5 w-3.5 text-zinc-500 shrink-0" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Buscar canal..."
            className="flex-1 bg-transparent text-sm text-zinc-100 placeholder:text-zinc-500 focus:outline-none"
          />
        </div>
      </div>

      {/* Filter tabs */}
      <div className="shrink-0 flex gap-1 px-3 pb-2">
        <button
          type="button"
          onClick={() => setFilter("all")}
          className={cn(
            "px-3 py-1 rounded-full text-xs font-medium transition-colors",
            filter === "all"
              ? "bg-[rgba(45,212,191,0.15)] text-teal-400"
              : "text-zinc-400 hover:text-zinc-200",
          )}
        >
          Todos
        </button>
        <button
          type="button"
          onClick={() => setFilter("unread")}
          className={cn(
            "px-3 py-1 rounded-full text-xs font-medium transition-colors",
            filter === "unread"
              ? "bg-[rgba(45,212,191,0.15)] text-teal-400"
              : "text-zinc-400 hover:text-zinc-200",
          )}
        >
          No leidos
        </button>
      </div>

      {/* Channel sections */}
      <div className="flex-1 overflow-y-auto min-h-0 px-2">
        {sections.length === 0 && !lockedChannels?.length && (
          <div className="flex items-center justify-center py-12 text-sm text-zinc-500">
            {searchQuery ? "Sin resultados" : "No hay canales disponibles"}
          </div>
        )}

        {sections.map((section) => {
          const isCollapsed = collapsedSections.has(section.key);
          const sectionUnread = section.channels.reduce(
            (sum, ch) => sum + ((ch.notificationPreference ?? "ALL") === "ALL" ? (ch.unreadCount ?? 0) : 0),
            0,
          );

          return (
            <div key={section.key} className="mb-1">
              {/* Section header */}
              <button
                type="button"
                onClick={() => toggleSection(section.key)}
                className="flex items-center gap-1.5 w-full px-2 py-1.5 text-[11px] font-semibold uppercase text-[rgba(255,255,255,0.45)] hover:text-[rgba(255,255,255,0.65)] transition-colors"
              >
                {isCollapsed ? (
                  <ChevronRight className="h-3 w-3" />
                ) : (
                  <ChevronDown className="h-3 w-3" />
                )}
                <span>{section.label}</span>
                {sectionUnread > 0 && (
                  <span className="ml-auto rounded-full bg-teal-500/20 px-1.5 py-0.5 text-[10px] font-bold text-teal-400">
                    {sectionUnread > 99 ? "99+" : sectionUnread}
                  </span>
                )}
              </button>

              {/* Channel items */}
              {!isCollapsed &&
                section.channels.map((ch) => {
                  const name = getDisplayName(ch);
                  const Icon = getChannelIcon(ch);
                  const isSelected = ch.id === selectedChannelId;
                  const unread = ch.unreadCount ?? 0;

                  return (
                    <button
                      key={ch.id}
                      type="button"
                      onClick={() => {
                        // Optimistic: clear unread locally so the badge doesn't
                        // linger until the next refetch.
                        if (unread > 0) {
                          const zero = (list: ChatChannelData[]) =>
                            list.map((c) => (c.id === ch.id ? { ...c, unreadCount: 0 } : c));
                          setChannels(zero);
                          setGroupChannels(zero);
                        }
                        onSelectChannel(ch.id, name, ch.channelType);
                      }}
                      className={cn(
                        "flex items-center gap-2.5 w-full px-3 py-2 rounded-lg text-left transition-colors",
                        isSelected
                          ? "bg-[rgba(45,212,191,0.1)] text-zinc-100"
                          : "text-zinc-300 hover:bg-[rgba(255,255,255,0.04)]",
                      )}
                    >
                      <Icon className="h-4 w-4 shrink-0 text-zinc-500" />
                      <div className="flex-1 min-w-0">
                        <p
                          className={cn(
                            "text-sm truncate",
                            unread > 0 && "font-semibold",
                          )}
                        >
                          {name}
                        </p>
                        {ch.lastMessagePreview && (
                          <p className="text-xs text-zinc-500 truncate">
                            {ch.lastMessagePreview}
                          </p>
                        )}
                      </div>
                      {unread > 0 && (ch.notificationPreference ?? "ALL") !== "MUTED" && (
                        <span className={cn(
                          "shrink-0 min-w-[20px] rounded-full px-1.5 py-0.5 text-center text-[10px] font-bold",
                          (ch.notificationPreference ?? "ALL") === "MENTIONS_ONLY"
                            ? "bg-zinc-600 text-zinc-300"
                            : "bg-teal-500 text-white"
                        )}>
                          {unread > 99 ? "99+" : unread}
                        </span>
                      )}
                    </button>
                  );
                })}
            </div>
          );
        })}

        {/* Locked channels */}
        {lockedChannels && lockedChannels.length > 0 && (
          <div className="mb-1 mt-2">
            <div className="flex items-center gap-1.5 px-2 py-1.5 text-[11px] font-semibold uppercase text-zinc-500">
              <Lock className="h-3 w-3" />
              <span>Canales disponibles al activarse</span>
            </div>
            {lockedChannels.map((lc, idx) => (
              <div
                key={idx}
                className="flex items-center gap-2.5 w-full px-3 py-2 rounded-lg opacity-50 cursor-not-allowed"
              >
                <Lock className="h-4 w-4 shrink-0 text-zinc-600" />
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-zinc-400 truncate">{lc.name}</p>
                  <p className="text-xs text-zinc-600 truncate">{lc.desc}</p>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
