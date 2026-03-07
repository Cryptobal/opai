"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Archive,
  ArrowDownAZ,
  Building2,
  ChevronDown,
  ChevronRight,
  Clock,
  Contact,
  MessageCircle,
  Plus,
  Search,
  SlidersHorizontal,
  UserCheck,
  Users,
} from "lucide-react";
import { cn } from "@/lib/utils";
import type { ChatChannelData, ChannelsResponse } from "@/lib/chat-types";
import { ChatChannelListItem } from "./ChatChannelListItem";
import { ChatNewDmModal } from "./ChatNewDmModal";
import { NewExternalChatModal } from "./NewExternalChatModal";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";

type Filter = "all" | "unread";
type SortKey = "recent" | "alpha" | "unread_first";

const SORT_LABELS: Record<SortKey, string> = {
  recent: "Más recientes",
  alpha: "A → Z",
  unread_first: "No leídos primero",
};

interface ChatChannelListProps {
  selectedChannelId: string | null;
  unreadCounts: Record<string, number>;
  onSelectChannel: (channelId: string, channelName: string) => void;
  userRole?: string;
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
        className="flex-1 flex items-center gap-2 px-4 py-2 text-[11px] font-bold text-[rgba(255,255,255,0.28)] uppercase tracking-[0.05em] hover:bg-[rgba(255,255,255,0.04)] transition-colors"
      >
        {collapsed ? (
          <ChevronRight className="h-3 w-3 shrink-0" />
        ) : (
          <ChevronDown className="h-3 w-3 shrink-0" />
        )}
        {icon}
        <span className="flex-1 text-left">{label}</span>
        <span className="min-w-[20px] text-right text-[10px] font-normal normal-case tracking-normal tabular-nums text-[rgba(255,255,255,0.2)]">
          {count}
        </span>
        {unreadCount > 0 && (
          <span className="flex h-4 min-w-[16px] items-center justify-center rounded-full bg-[#2dd4bf] px-1 text-[9px] font-bold text-zinc-900">
            {unreadCount > 99 ? "99+" : unreadCount}
          </span>
        )}
      </button>
      {action && (
        <div className="pr-3 opacity-0 group-hover:opacity-100 transition-opacity">
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
  userRole,
}: ChatChannelListProps) {
  const [channels, setChannels] = useState<ChatChannelData[]>([]);
  const [archivedChannels, setArchivedChannels] = useState<ChatChannelData[]>([]);
  const [search, setSearch] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [showNewDm, setShowNewDm] = useState(false);
  const [newExternalStatus, setNewExternalStatus] = useState<"prospect" | "client_active" | null>(null);
  const [filter, setFilter] = useState<Filter>("all");
  const [sort, setSort] = useState<SortKey>("recent");
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({
    direct: false,
    group: true,
    installation_reportes: true,
    installation_interno: true,
    prospects: true,
    clients: true,
    archived: true,
  });
  const [deleteTarget, setDeleteTarget] = useState<string | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const archivedFetchedRef = useRef(false);

  const canDelete = userRole === "owner" || userRole === "admin";

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

  const fetchArchivedChannels = useCallback(async () => {
    try {
      const res = await fetch("/api/chat/channels?archived=true");
      if (!res.ok) return;
      const json = await res.json();
      if (json.success) setArchivedChannels(json.data);
    } catch {
      // ignore
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

  const toggleSection = useCallback((key: string) => {
    setCollapsed((prev) => {
      const next = { ...prev, [key]: !prev[key] };
      if (key === "archived" && prev.archived && !archivedFetchedRef.current) {
        archivedFetchedRef.current = true;
        fetchArchivedChannels();
      }
      return next;
    });
  }, [fetchArchivedChannels]);

  // ── Actions ──

  const archiveChannel = useCallback(async (channelId: string) => {
    try {
      const res = await fetch(`/api/chat/channels/${channelId}/archive`, { method: "POST" });
      if (!res.ok) return;
      setChannels((prev) => prev.filter((ch) => ch.id !== channelId));
      if (archivedFetchedRef.current) fetchArchivedChannels();
    } catch {
      // ignore
    }
  }, [fetchArchivedChannels]);

  const unarchiveChannel = useCallback(async (channelId: string) => {
    try {
      const res = await fetch(`/api/chat/channels/${channelId}/archive`, { method: "DELETE" });
      if (!res.ok) return;
      setArchivedChannels((prev) => prev.filter((ch) => ch.id !== channelId));
      fetchChannels();
    } catch {
      // ignore
    }
  }, [fetchChannels]);

  const deleteChannel = useCallback(async (channelId: string) => {
    try {
      const res = await fetch(`/api/chat/channels/${channelId}`, { method: "DELETE" });
      if (!res.ok) return;
      setChannels((prev) => prev.filter((ch) => ch.id !== channelId));
      setArchivedChannels((prev) => prev.filter((ch) => ch.id !== channelId));
    } catch {
      // ignore
    }
  }, []);

  const confirmDelete = useCallback(() => {
    if (deleteTarget) {
      deleteChannel(deleteTarget);
      setDeleteTarget(null);
    }
  }, [deleteTarget, deleteChannel]);

  // ── Derived data ──

  const isSearching = search.trim().length > 0;

  const getDisplayName = useCallback((channel: ChatChannelData) => {
    if (channel.channelType === "DIRECT" && channel.dmParticipant) return channel.dmParticipant.name;
    if (channel.channelType === "INSTALLATION" && channel.installation) return channel.installation.name;
    if (channel.channelType === "EXTERNAL" && channel.account) return channel.account.name;
    return channel.name;
  }, []);

  const sectionUnread = (chs: ChatChannelData[]) =>
    chs.reduce((sum, ch) => sum + (unreadCounts[ch.id] || 0), 0);

  const processedChannels = useMemo(() => {
    let list = channels.filter((ch) => !ch.isArchivedByMe);

    if (filter === "unread") {
      list = list.filter((ch) => (unreadCounts[ch.id] || 0) > 0);
    }

    list = [...list].sort((a, b) => {
      if (sort === "alpha") {
        return getDisplayName(a).localeCompare(getDisplayName(b), "es", { sensitivity: "base" });
      }
      if (sort === "unread_first") {
        const uA = unreadCounts[a.id] || 0;
        const uB = unreadCounts[b.id] || 0;
        if (uA !== uB) return uB - uA;
        return (b.lastMessageAt ?? "").localeCompare(a.lastMessageAt ?? "");
      }
      if (!a.lastMessageAt && !b.lastMessageAt) return 0;
      if (!a.lastMessageAt) return 1;
      if (!b.lastMessageAt) return -1;
      return b.lastMessageAt.localeCompare(a.lastMessageAt);
    });

    return list;
  }, [channels, filter, sort, unreadCounts, getDisplayName]);

  const { directChannels, groupChannels, installationReportesChannels, installationInternoChannels, prospectChannels, clientChannels } = useMemo(() => ({
    directChannels: processedChannels.filter((ch) => ch.channelType === "DIRECT"),
    groupChannels: processedChannels.filter((ch) => ch.channelType === "GROUP"),
    installationReportesChannels: processedChannels.filter((ch) => ch.channelType === "INSTALLATION" && ch.subType !== "interno"),
    installationInternoChannels: processedChannels.filter((ch) => ch.channelType === "INSTALLATION" && ch.subType === "interno"),
    prospectChannels: processedChannels.filter((ch) => ch.channelType === "EXTERNAL" && ch.account?.status === "prospect"),
    clientChannels: processedChannels.filter((ch) => ch.channelType === "EXTERNAL" && ch.account?.status !== "prospect"),
  }), [processedChannels]);

  const totalUnread = useMemo(
    () => channels.filter((ch) => !ch.isArchivedByMe).reduce((sum, ch) => sum + (unreadCounts[ch.id] || 0), 0),
    [channels, unreadCounts]
  );

  const isEmpty = processedChannels.length === 0 && archivedChannels.length === 0;

  const renderChannelItems = (chs: ChatChannelData[], opts: { showArchive?: boolean; showUnarchive?: boolean; showDelete?: boolean }) =>
    chs.map((channel) => (
      <ChatChannelListItem
        key={channel.id}
        channel={channel}
        isSelected={channel.id === selectedChannelId}
        unreadCount={unreadCounts[channel.id] || 0}
        onClick={() => onSelectChannel(channel.id, getDisplayName(channel))}
        onArchive={opts.showArchive ? () => archiveChannel(channel.id) : undefined}
        onUnarchive={opts.showUnarchive ? () => unarchiveChannel(channel.id) : undefined}
        onDelete={opts.showDelete !== false && canDelete ? () => setDeleteTarget(channel.id) : undefined}
        canDelete={opts.showDelete !== false && canDelete}
        isArchived={opts.showUnarchive}
      />
    ));

  const shouldExpand = (key: string) => isSearching || filter === "unread" ? true : !collapsed[key];

  return (
    <div className="flex flex-col h-full bg-[#0d1220]">
      {/* Header */}
      <div className="shrink-0 px-4 pt-3 pb-2 border-b border-[rgba(255,255,255,0.06)] space-y-2">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold text-zinc-100">Chat</h2>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                type="button"
                className="flex items-center gap-1 rounded px-2 py-1 text-xs text-zinc-400 hover:bg-zinc-800 hover:text-zinc-200 transition-colors"
                title="Ordenar"
              >
                {sort === "alpha" ? (
                  <ArrowDownAZ className="h-3.5 w-3.5" />
                ) : sort === "unread_first" ? (
                  <MessageCircle className="h-3.5 w-3.5" />
                ) : (
                  <Clock className="h-3.5 w-3.5" />
                )}
                <span className="hidden sm:inline">{SORT_LABELS[sort]}</span>
                <SlidersHorizontal className="h-3 w-3 opacity-50" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-44 z-[200]">
              {(["recent", "alpha", "unread_first"] as SortKey[]).map((key) => (
                <DropdownMenuItem
                  key={key}
                  onClick={() => setSort(key)}
                  className={cn(sort === key && "bg-accent")}
                >
                  {key === "alpha" ? (
                    <ArrowDownAZ className="mr-2 h-3.5 w-3.5" />
                  ) : key === "unread_first" ? (
                    <MessageCircle className="mr-2 h-3.5 w-3.5" />
                  ) : (
                    <Clock className="mr-2 h-3.5 w-3.5" />
                  )}
                  <span>{SORT_LABELS[key]}</span>
                  {sort === key && <span className="ml-auto text-xs text-teal-400">✓</span>}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>

        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-zinc-500" />
          <input
            type="text"
            value={search}
            onChange={(e) => handleSearchChange(e.target.value)}
            placeholder="Buscar canal o conversación..."
            className="w-full rounded-md border border-[rgba(255,255,255,0.06)] bg-[rgba(255,255,255,0.04)] py-1.5 pl-8 pr-3 text-sm text-zinc-100 placeholder:text-zinc-500 focus:border-[rgba(255,255,255,0.12)] focus:outline-none focus:ring-1 focus:ring-[rgba(255,255,255,0.06)] transition-colors"
          />
        </div>

        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={() => setFilter("all")}
            className={cn(
              "rounded-full px-3 py-0.5 text-xs font-medium transition-colors",
              filter === "all"
                ? "bg-zinc-700 text-zinc-100"
                : "text-zinc-500 hover:text-zinc-300"
            )}
          >
            Todos
          </button>
          <button
            type="button"
            onClick={() => setFilter("unread")}
            className={cn(
              "flex items-center gap-1 rounded-full px-3 py-0.5 text-xs font-medium transition-colors",
              filter === "unread"
                ? "bg-teal-600 text-white"
                : "text-zinc-500 hover:text-zinc-300"
            )}
          >
            No leídos
            {totalUnread > 0 && (
              <span className={cn(
                "flex h-4 min-w-[16px] items-center justify-center rounded-full px-1 text-[9px] font-bold",
                filter === "unread" ? "bg-white/20 text-white" : "bg-teal-600 text-white"
              )}>
                {totalUnread > 99 ? "99+" : totalUnread}
              </span>
            )}
          </button>
        </div>
      </div>

      {/* Channel list */}
      <div className="flex-1 overflow-y-auto">
        {isLoading && channels.length === 0 ? (
          <div className="flex items-center justify-center py-12">
            <div className="h-5 w-5 animate-spin rounded-full border-2 border-zinc-600 border-t-zinc-300" />
          </div>
        ) : isEmpty ? (
          <div className="px-4 py-8 text-center text-sm text-zinc-500">
            {filter === "unread"
              ? "✓ Todo al día"
              : search
                ? "Sin resultados"
                : "Sin canales disponibles"}
          </div>
        ) : (
          <div className="py-1">
            {/* Direct Messages */}
            {directChannels.length > 0 && (
              <div>
                <SectionHeader
                  label="Mensajes directos"
                  icon={<MessageCircle className="h-3.5 w-3.5 text-teal-500" />}
                  count={directChannels.length}
                  unreadCount={sectionUnread(directChannels)}
                  collapsed={!shouldExpand("direct")}
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
                {shouldExpand("direct") && (
                  <div>{renderChannelItems(directChannels, {})}</div>
                )}
              </div>
            )}

            {/* Groups */}
            {groupChannels.length > 0 && (
              <div>
                <SectionHeader
                  label="Grupos"
                  icon={<Users className="h-3.5 w-3.5 text-amber-500" />}
                  count={groupChannels.length}
                  unreadCount={sectionUnread(groupChannels)}
                  collapsed={!shouldExpand("group")}
                  onToggle={() => toggleSection("group")}
                />
                {shouldExpand("group") && (
                  <div>{renderChannelItems(groupChannels, {})}</div>
                )}
              </div>
            )}

            {/* Instalaciones - Reportes */}
            {installationReportesChannels.length > 0 && (
              <div>
                <SectionHeader
                  label="Instalaciones - Reportes"
                  icon={<Building2 className="h-3.5 w-3.5 text-indigo-500" />}
                  count={installationReportesChannels.length}
                  unreadCount={sectionUnread(installationReportesChannels)}
                  collapsed={!shouldExpand("installation_reportes")}
                  onToggle={() => toggleSection("installation_reportes")}
                />
                {shouldExpand("installation_reportes") && (
                  <div>{renderChannelItems(installationReportesChannels, { showArchive: true, showDelete: false })}</div>
                )}
              </div>
            )}

            {/* Instalaciones - Interno */}
            {installationInternoChannels.length > 0 && (
              <div>
                <SectionHeader
                  label="Instalaciones - Interno"
                  icon={<Building2 className="h-3.5 w-3.5 text-indigo-400" />}
                  count={installationInternoChannels.length}
                  unreadCount={sectionUnread(installationInternoChannels)}
                  collapsed={!shouldExpand("installation_interno")}
                  onToggle={() => toggleSection("installation_interno")}
                />
                {shouldExpand("installation_interno") && (
                  <div>{renderChannelItems(installationInternoChannels, { showArchive: true, showDelete: false })}</div>
                )}
              </div>
            )}

            {/* Prospectos (EXTERNAL with prospect status) */}
            <div>
              <SectionHeader
                label="Prospectos"
                icon={<Contact className="h-3.5 w-3.5 text-green-500" />}
                count={prospectChannels.length}
                unreadCount={sectionUnread(prospectChannels)}
                collapsed={!shouldExpand("prospects")}
                onToggle={() => toggleSection("prospects")}
                action={
                  <button
                    type="button"
                    onClick={(e) => { e.stopPropagation(); setNewExternalStatus("prospect"); }}
                    className="flex h-5 w-5 items-center justify-center rounded text-zinc-500 hover:bg-zinc-700 hover:text-zinc-200 transition-colors"
                    title="Nuevo chat con prospecto"
                  >
                    <Plus className="h-3 w-3" />
                  </button>
                }
              />
              {shouldExpand("prospects") && prospectChannels.length > 0 && (
                <div>{renderChannelItems(prospectChannels, { showArchive: true })}</div>
              )}
            </div>

            {/* Clientes (EXTERNAL with client status) */}
            <div>
              <SectionHeader
                label="Clientes"
                icon={<UserCheck className="h-3.5 w-3.5 text-blue-500" />}
                count={clientChannels.length}
                unreadCount={sectionUnread(clientChannels)}
                collapsed={!shouldExpand("clients")}
                onToggle={() => toggleSection("clients")}
                action={
                  <button
                    type="button"
                    onClick={(e) => { e.stopPropagation(); setNewExternalStatus("client_active"); }}
                    className="flex h-5 w-5 items-center justify-center rounded text-zinc-500 hover:bg-zinc-700 hover:text-zinc-200 transition-colors"
                    title="Nuevo chat con cliente"
                  >
                    <Plus className="h-3 w-3" />
                  </button>
                }
              />
              {shouldExpand("clients") && clientChannels.length > 0 && (
                <div>{renderChannelItems(clientChannels, { showArchive: true })}</div>
              )}
            </div>

            {/* Archivados (lazy load) */}
            {filter !== "unread" && (
              <div>
                <SectionHeader
                  label="Archivados"
                  icon={<Archive className="h-3.5 w-3.5 text-zinc-500" />}
                  count={archivedChannels.length}
                  unreadCount={0}
                  collapsed={collapsed["archived"]}
                  onToggle={() => toggleSection("archived")}
                />
                {!collapsed["archived"] && (
                  archivedChannels.length > 0 ? (
                    <div>
                      {archivedChannels.map((channel) => (
                        <ChatChannelListItem
                          key={channel.id}
                          channel={channel}
                          isSelected={channel.id === selectedChannelId}
                          unreadCount={unreadCounts[channel.id] || 0}
                          onClick={() => onSelectChannel(channel.id, getDisplayName(channel))}
                          onUnarchive={() => unarchiveChannel(channel.id)}
                          onDelete={channel.channelType !== "INSTALLATION" && canDelete ? () => setDeleteTarget(channel.id) : undefined}
                          canDelete={channel.channelType !== "INSTALLATION" && canDelete}
                          isArchived
                        />
                      ))}
                    </div>
                  ) : (
                    <div className="px-4 py-3 text-xs text-zinc-600">Sin canales archivados</div>
                  )
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

      {/* New External Chat Modal (Prospectos / Clientes) */}
      <NewExternalChatModal
        open={!!newExternalStatus}
        onClose={() => setNewExternalStatus(null)}
        onCreated={(channelId) => {
          setNewExternalStatus(null);
          fetchChannels();
          onSelectChannel(channelId, "Nueva conversación");
        }}
        defaultStatus={newExternalStatus ?? undefined}
      />

      {/* Delete Confirmation Dialog */}
      <ConfirmDialog
        open={!!deleteTarget}
        onOpenChange={(open) => { if (!open) setDeleteTarget(null); }}
        title="¿Eliminar conversación?"
        description="Esta acción es permanente y no se puede deshacer. Se eliminarán todos los mensajes para todos los participantes."
        confirmLabel="Eliminar permanentemente"
        onConfirm={confirmDelete}
        variant="destructive"
      />
    </div>
  );
}
