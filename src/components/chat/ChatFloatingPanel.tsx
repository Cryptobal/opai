"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Archive,
  ArchiveRestore,
  ArrowLeft,
  Building2,
  ChevronDown,
  ChevronRight,
  Handshake,
  Loader2,
  MessageCircle,
  MoreHorizontal,
  Search,
  Sprout,
  Trash2,
  Users,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useChatFloatingContext, type ChatFloatingChannel } from "./ChatFloatingProvider";
import { ChatConversation } from "./ChatConversation";
import { usePusher } from "./hooks/usePusher";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

type AdminUser = { id: string; name: string; email: string };

/* ─── Component ─── */

export function ChatFloatingPanel({ userRole }: { userRole?: string }) {
  const ctx = useChatFloatingContext();
  const panelRef = useRef<HTMLDivElement>(null);
  const backdropRef = useRef<HTMLDivElement>(null);
  const pusher = usePusher("/api/chat/pusher/auth");

  // Track whether auto-context was injected for this panel session
  const [contextInjected, setContextInjected] = useState(false);

  // Reset context injection when panel closes
  useEffect(() => {
    if (!ctx.isPanelOpen) setContextInjected(false);
  }, [ctx.isPanelOpen]);

  // ── Mobile drag-to-close ──
  const dragStartY = useRef<number | null>(null);
  const dragCurrentY = useRef<number>(0);
  const [dragOffset, setDragOffset] = useState(0);
  const isDragging = useRef(false);

  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    const touch = e.touches[0];
    const rect = panelRef.current?.getBoundingClientRect();
    if (!rect) return;
    const relativeY = touch.clientY - rect.top;
    if (relativeY > 60) return;
    dragStartY.current = touch.clientY;
    isDragging.current = true;
  }, []);

  const handleTouchMove = useCallback((e: React.TouchEvent) => {
    if (!isDragging.current || dragStartY.current === null) return;
    const delta = e.touches[0].clientY - dragStartY.current;
    if (delta > 0) {
      dragCurrentY.current = delta;
      setDragOffset(delta);
    }
  }, []);

  const handleTouchEnd = useCallback(() => {
    if (!isDragging.current) return;
    isDragging.current = false;
    if (dragCurrentY.current > 120) {
      ctx.closePanel();
    }
    dragStartY.current = null;
    dragCurrentY.current = 0;
    setDragOffset(0);
  }, [ctx]);

  // Close on Escape
  useEffect(() => {
    if (!ctx.isPanelOpen) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") ctx.closePanel();
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [ctx.isPanelOpen, ctx]);

  // Lock body scroll on mobile when open
  useEffect(() => {
    if (!ctx.isPanelOpen) return;
    const scrollY = window.scrollY;
    document.body.style.position = "fixed";
    document.body.style.top = `-${scrollY}px`;
    document.body.style.width = "100%";
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.position = "";
      document.body.style.top = "";
      document.body.style.width = "";
      document.body.style.overflow = "";
      window.scrollTo(0, scrollY);
    };
  }, [ctx.isPanelOpen]);

  // Close on backdrop click
  useEffect(() => {
    if (!ctx.isPanelOpen) return;
    const handler = (e: MouseEvent) => {
      if (backdropRef.current && e.target === backdropRef.current) {
        ctx.closePanel();
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [ctx.isPanelOpen, ctx]);

  const [searchQuery, setSearchQuery] = useState("");
  const [filter, setFilter] = useState<"all" | "unread">("all");
  const [collapsedSections, setCollapsedSections] = useState<Record<string, boolean>>({
    group: true,
    installation: true,
    users: true,
    prospects: false,
    clients: false,
    archived: true,
  });
  const [channelToDelete, setChannelToDelete] = useState<string | null>(null);
  const [allUsers, setAllUsers] = useState<AdminUser[]>([]);
  const [creatingDmFor, setCreatingDmFor] = useState<string | null>(null);

  // Reset search and filter when panel closes
  useEffect(() => {
    if (!ctx.isPanelOpen) {
      setSearchQuery("");
      setFilter("all");
    }
  }, [ctx.isPanelOpen]);

  // Fetch all users once for the "Usuarios" section
  useEffect(() => {
    if (!ctx.isPanelOpen || allUsers.length > 0) return;
    fetch("/api/chat/mentions/users")
      .then((r) => r.ok ? r.json() : null)
      .then((json) => { if (json?.success) setAllUsers(json.data); })
      .catch(() => {});
  }, [ctx.isPanelOpen, allUsers.length]);

  // Derived external channels
  const prospectChannels = ctx.channels.filter(
    (c) => c.channelType === "EXTERNAL" && c.account?.status === "prospect"
  );
  const clientChannels = ctx.channels.filter(
    (c) =>
      c.channelType === "EXTERNAL" &&
      (c.account?.status === "client_active" || c.account?.status === "client_inactive")
  );

  const canDeleteChannels = userRole === "owner" || userRole === "admin";

  const handleDeleteChannel = (id: string) => setChannelToDelete(id);

  const confirmDelete = async () => {
    if (!channelToDelete) return;
    await ctx.deleteChannel(channelToDelete);
    if (ctx.selectedChannelId === channelToDelete) ctx.selectChannel(null);
    setChannelToDelete(null);
  };

  const selectedChannel = ctx.channels.find((ch) => ch.id === ctx.selectedChannelId);

  // Derive display name for a channel
  const getChannelDisplayName = useCallback((ch: ChatFloatingChannel) => {
    if (ch.channelType === "DIRECT") return ch.dmParticipant?.name ?? ch.name;
    if (ch.channelType === "INSTALLATION") return ch.installation?.name ?? ch.name;
    return ch.name;
  }, []);

  // Filter and section channels + users
  const { directChannels, groupChannels, installationChannels, filteredUsers, filteredTotal } = useMemo(() => {
    const q = searchQuery.toLowerCase().trim();
    const filtered = q
      ? ctx.channels.filter((ch) => {
          const displayName = getChannelDisplayName(ch).toLowerCase();
          if (displayName.includes(q)) return true;
          if (ch.channelType === "INSTALLATION" && ch.installation?.account?.name?.toLowerCase().includes(q)) return true;
          return false;
        })
      : ctx.channels;

    // Filter users by search (exclude users who already have a DM channel)
    const existingDmUserIds = new Set(
      ctx.channels
        .filter((ch) => ch.channelType === "DIRECT" && ch.dmParticipant)
        .map((ch) => ch.dmParticipant!.id)
    );
    const usersToShow = q
      ? allUsers.filter((u) =>
          !existingDmUserIds.has(u.id) &&
          (u.name.toLowerCase().includes(q) || u.email.toLowerCase().includes(q))
        )
      : allUsers.filter((u) => !existingDmUserIds.has(u.id));

    return {
      directChannels: filter === "unread" ? filtered.filter(ch => ch.channelType === "DIRECT" && ch.unreadCount > 0) : filtered.filter((ch) => ch.channelType === "DIRECT"),
      groupChannels: filter === "unread" ? filtered.filter(ch => ch.channelType === "GROUP" && ch.unreadCount > 0) : filtered.filter((ch) => ch.channelType === "GROUP"),
      installationChannels: filter === "unread" ? filtered.filter(ch => ch.channelType === "INSTALLATION" && ch.unreadCount > 0) : filtered.filter((ch) => ch.channelType === "INSTALLATION"),
      filteredUsers: filter === "unread" ? [] : usersToShow,
      filteredTotal: filtered.length + (q ? usersToShow.length : 0),
    };
  }, [ctx.channels, searchQuery, getChannelDisplayName, allUsers, filter]);

  const isSearching = searchQuery.trim().length > 0;

  const toggleSection = useCallback((key: string) => {
    setCollapsedSections((prev) => ({ ...prev, [key]: !prev[key] }));
  }, []);

  // Create DM from user click
  const handleStartDm = useCallback(async (user: AdminUser) => {
    if (creatingDmFor) return;
    setCreatingDmFor(user.id);
    try {
      const res = await fetch("/api/chat/dms", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ targetAdminId: user.id }),
      });
      if (!res.ok) throw new Error("Failed to create DM");
      const json = await res.json();
      if (json.success) {
        await ctx.refreshChannels();
        ctx.selectChannel(json.data.id);
      }
    } catch (err) {
      console.error("[ChatFloating] create DM error:", err);
    } finally {
      setCreatingDmFor(null);
    }
  }, [creatingDmFor, ctx]);

  // Build auto-context prefix for first message
  const getAutoContextPrefix = useCallback(() => {
    if (!ctx.autoContext || contextInjected) return "";
    setContextInjected(true);
    return `📍 Desde: ${ctx.autoContext.pageUrl} — "${ctx.autoContext.pageLabel}"\n---\n`;
  }, [ctx.autoContext, contextInjected]);

  // Resolve the channel name for conversation header
  const selectedChannelName = selectedChannel ? getChannelDisplayName(selectedChannel) : "";

  if (!ctx.isPanelOpen) return null;

  return (
    <>
      {/* Backdrop */}
      <div
        ref={backdropRef}
        className={cn(
          "fixed inset-0 z-[60] transition-opacity duration-300",
          "bg-black/40 backdrop-blur-[2px]",
          "sm:bg-black/20 sm:backdrop-blur-none",
        )}
        aria-hidden="true"
      />

      {/* Panel */}
      <div
        ref={panelRef}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
        className={cn(
          "fixed z-[61] flex flex-col bg-background border-border transition-transform duration-300 ease-out",
          "inset-x-0 bottom-0 max-h-[85dvh] rounded-t-2xl border-t shadow-2xl",
          "sm:bottom-0 sm:right-6 sm:left-auto sm:top-auto sm:w-[600px] sm:max-h-[75vh] sm:rounded-t-2xl sm:rounded-b-none sm:border sm:border-b-0 sm:shadow-[0_-8px_30px_-12px_rgba(0,0,0,0.25)]",
          ctx.isPanelOpen ? "translate-y-0" : "translate-y-full",
        )}
        style={dragOffset > 0 ? { transform: `translateY(${dragOffset}px)` } : undefined}
        role="dialog"
        aria-label="Panel de chat"
      >
        {/* Mobile drag handle */}
        <div className="sm:hidden flex justify-center pt-2 pb-1">
          <div className="h-1 w-10 rounded-full bg-muted-foreground/30" />
        </div>

        {ctx.selectedChannelId && selectedChannel ? (
          /* ── Conversation view ── */
          <div className="flex flex-col h-full min-h-0">
            <ChatConversation
              channelId={ctx.selectedChannelId}
              channelName={selectedChannelName}
              pusher={pusher}
              onBack={() => ctx.selectChannel(null)}
              autoContextPrefix={getAutoContextPrefix}
              currentUserId={ctx.currentUserId}
            />
          </div>
        ) : (
          /* ── Channel list view ── */
          <>
            {/* Header */}
            <div className="flex items-center gap-2 px-4 py-3 border-b border-border/60 shrink-0">
              <MessageCircle className="h-4 w-4 text-teal-600 shrink-0" />
              <div className="flex-1 min-w-0">
                <h2 className="text-sm font-semibold truncate">Chat</h2>
                <p className="text-[10px] text-muted-foreground truncate">
                  {ctx.channels.length} {ctx.channels.length === 1 ? "conversación" : "conversaciones"}
                </p>
              </div>
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7 shrink-0"
                onClick={ctx.closePanel}
                aria-label="Cerrar panel"
              >
                <X className="h-4 w-4" />
              </Button>
            </div>

            {/* Search bar */}
            <div className="px-3 pt-2 border-b border-border/40 shrink-0">
              <div className="relative">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground/60" />
                <input
                  type="text"
                  placeholder="Buscar conversación..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full h-8 pl-8 pr-3 text-xs rounded-md border border-border/60 bg-muted/40 placeholder:text-muted-foreground/50 focus:outline-none focus:ring-1 focus:ring-teal-600/50 focus:border-teal-600/50"
                />
              </div>
              {/* Filter chips */}
              <div className="px-0 pb-2 pt-2 flex items-center gap-1.5 shrink-0">
                <button
                  type="button"
                  onClick={() => setFilter("all")}
                  className={cn(
                    "rounded-full px-3 py-1 text-[11px] font-medium transition-colors",
                    filter === "all"
                      ? "bg-teal-600 text-white"
                      : "bg-muted/50 text-muted-foreground hover:bg-muted"
                  )}
                >
                  Todos
                </button>
                <button
                  type="button"
                  onClick={() => setFilter("unread")}
                  className={cn(
                    "rounded-full px-3 py-1 text-[11px] font-medium transition-colors",
                    filter === "unread"
                      ? "bg-teal-600 text-white"
                      : "bg-muted/50 text-muted-foreground hover:bg-muted"
                  )}
                >
                  No leídos
                  {ctx.totalUnread > 0 && filter !== "unread" && (
                    <span className="ml-1 inline-flex h-4 min-w-[16px] items-center justify-center rounded-full bg-teal-600/30 px-1 text-[9px] font-bold text-teal-400">
                      {ctx.totalUnread > 99 ? "99+" : ctx.totalUnread}
                    </span>
                  )}
                </button>
              </div>
            </div>

            {/* Channel list */}
            <div className="flex-1 overflow-y-auto min-h-0">
              {ctx.loading ? (
                <div className="flex flex-col items-center gap-2 py-10">
                  <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                  <p className="text-xs text-muted-foreground">Cargando conversaciones...</p>
                </div>
              ) : filter === "unread" && directChannels.length === 0 && groupChannels.length === 0 && installationChannels.length === 0 ? (
                <div className="flex flex-col items-center gap-2 py-12 text-center px-4">
                  <span className="text-3xl">✓</span>
                  <p className="text-sm font-medium text-muted-foreground">Todo al día</p>
                  <p className="text-[11px] text-muted-foreground/60">No tienes mensajes sin leer</p>
                </div>
              ) : filteredTotal === 0 && filteredUsers.length === 0 ? (
                <div className="flex flex-col items-center gap-1.5 py-10 text-center px-4">
                  <MessageCircle className="h-8 w-8 text-muted-foreground/20" />
                  <p className="text-xs text-muted-foreground">
                    {searchQuery
                      ? "No se encontraron conversaciones"
                      : "No tienes conversaciones aún"}
                  </p>
                  {!searchQuery && (
                    <p className="text-[10px] text-muted-foreground/60">
                      Contacta a un administrador para unirte a un canal
                    </p>
                  )}
                </div>
              ) : (
                <div>
                  {/* Direct Messages */}
                  {directChannels.length > 0 && (
                    <ChannelSection
                      label="Mensajes directos"
                      icon={<MessageCircle className="h-3.5 w-3.5" />}
                      channels={directChannels}
                      collapsed={isSearching || filter === "unread" ? false : !!collapsedSections["direct"]}
                      onToggle={() => toggleSection("direct")}
                      onSelectChannel={ctx.selectChannel}
                      getDisplayName={getChannelDisplayName}
                    />
                  )}

                  {/* Groups */}
                  {groupChannels.length > 0 && (
                    <ChannelSection
                      label="Grupos"
                      icon={<Users className="h-3.5 w-3.5" />}
                      channels={groupChannels}
                      collapsed={isSearching || filter === "unread" ? false : !!collapsedSections["group"]}
                      onToggle={() => toggleSection("group")}
                      onSelectChannel={ctx.selectChannel}
                      getDisplayName={getChannelDisplayName}
                    />
                  )}

                  {/* Installations */}
                  {installationChannels.length > 0 && (
                    <ChannelSection
                      label="Instalaciones"
                      icon={<Building2 className="h-3.5 w-3.5" />}
                      channels={installationChannels}
                      collapsed={isSearching || filter === "unread" ? false : !!collapsedSections["installation"]}
                      onToggle={() => toggleSection("installation")}
                      onSelectChannel={ctx.selectChannel}
                      getDisplayName={getChannelDisplayName}
                      onArchive={(id) => ctx.archiveChannel(id)}
                      canDelete={canDeleteChannels}
                      onDelete={handleDeleteChannel}
                    />
                  )}

                  {/* Prospectos */}
                  {(prospectChannels.length > 0 || !isSearching) && filter !== "unread" && (
                    <ChannelSection
                      label="Prospectos"
                      icon={<Sprout className="h-3.5 w-3.5 text-green-500" />}
                      channels={prospectChannels}
                      collapsed={isSearching ? false : !!collapsedSections["prospects"]}
                      onToggle={() => toggleSection("prospects")}
                      onSelectChannel={ctx.selectChannel}
                      getDisplayName={(ch) => ch.account?.name ?? ch.name}
                      onArchive={(id) => ctx.archiveChannel(id)}
                      canDelete={canDeleteChannels}
                      onDelete={handleDeleteChannel}
                    />
                  )}

                  {/* Clientes */}
                  {(clientChannels.length > 0 || !isSearching) && filter !== "unread" && (
                    <ChannelSection
                      label="Clientes"
                      icon={<Handshake className="h-3.5 w-3.5 text-blue-500" />}
                      channels={clientChannels}
                      collapsed={isSearching ? false : !!collapsedSections["clients"]}
                      onToggle={() => toggleSection("clients")}
                      onSelectChannel={ctx.selectChannel}
                      getDisplayName={(ch) => ch.account?.name ?? ch.name}
                      onArchive={(id) => ctx.archiveChannel(id)}
                      canDelete={canDeleteChannels}
                      onDelete={handleDeleteChannel}
                    />
                  )}

                  {/* Archivados */}
                  {filter !== "unread" && (
                    <ChannelSection
                      label="Archivados"
                      icon={<Archive className="h-3.5 w-3.5 text-muted-foreground" />}
                      channels={ctx.archivedChannels}
                      collapsed={isSearching ? false : !!collapsedSections["archived"]}
                      onToggle={() => {
                        const wasCollapsed = !!collapsedSections["archived"];
                        toggleSection("archived");
                        if (wasCollapsed) ctx.fetchArchivedChannels();
                      }}
                      onSelectChannel={ctx.selectChannel}
                      getDisplayName={(ch) => ch.name}
                      onUnarchive={(id) => ctx.unarchiveChannel(id)}
                      canDelete={canDeleteChannels}
                      onDelete={handleDeleteChannel}
                      isArchivedSection
                    />
                  )}

                  {/* Users (for starting DMs) */}
                  {filteredUsers.length > 0 && filter !== "unread" && (
                    <UserSection
                      users={filteredUsers}
                      collapsed={isSearching ? false : !!collapsedSections["users"]}
                      onToggle={() => toggleSection("users")}
                      onSelectUser={handleStartDm}
                      creatingDmFor={creatingDmFor}
                    />
                  )}
                </div>
              )}
            </div>

            {/* Delete confirmation dialog */}
            <ConfirmDialog
              open={!!channelToDelete}
              onOpenChange={(open) => { if (!open) setChannelToDelete(null); }}
              title="¿Eliminar conversación?"
              description="Esta acción es permanente y no se puede deshacer. Se eliminarán todos los mensajes para todos los participantes."
              confirmLabel="Eliminar permanentemente"
              onConfirm={confirmDelete}
              variant="destructive"
            />
          </>
        )}
      </div>

    </>
  );
}

/* ─── Channel Section ─── */

function ChannelSection({
  label,
  icon,
  channels,
  collapsed,
  onToggle,
  onSelectChannel,
  getDisplayName,
  onArchive,
  onUnarchive,
  canDelete,
  onDelete,
  isArchivedSection,
}: {
  label: string;
  icon: React.ReactNode;
  channels: ChatFloatingChannel[];
  collapsed: boolean;
  onToggle: () => void;
  onSelectChannel: (id: string) => void;
  getDisplayName: (ch: ChatFloatingChannel) => string;
  onArchive?: (channelId: string) => void;
  onUnarchive?: (channelId: string) => void;
  canDelete?: boolean;
  onDelete?: (channelId: string) => void;
  isArchivedSection?: boolean;
}) {
  const sectionUnread = channels.reduce((sum, ch) => sum + ch.unreadCount, 0);

  return (
    <div>
      <button
        type="button"
        onClick={onToggle}
        className="w-full flex items-center gap-2 px-4 py-2 text-xs font-semibold text-muted-foreground uppercase tracking-wider hover:bg-accent/30 transition-colors"
      >
        {collapsed ? (
          <ChevronRight className="h-3 w-3 shrink-0" />
        ) : (
          <ChevronDown className="h-3 w-3 shrink-0" />
        )}
        {icon}
        <span className="flex-1 text-left">{label}</span>
        <span className="text-[10px] font-normal normal-case tracking-normal text-muted-foreground/70">
          {channels.length}
        </span>
        {sectionUnread > 0 && (
          <span className="flex h-4 min-w-[16px] items-center justify-center rounded-full bg-teal-600 px-1 text-[9px] font-bold text-white">
            {sectionUnread > 99 ? "99+" : sectionUnread}
          </span>
        )}
      </button>
      {!collapsed && (
        <div className="divide-y divide-border/20">
          {channels.map((ch) => (
            <div key={ch.id} className="relative group flex items-center">
              <div className="flex-1 min-w-0">
                <ChannelListItem
                  channel={ch}
                  displayName={getDisplayName(ch)}
                  onClick={() => onSelectChannel(ch.id)}
                />
              </div>
              {(onArchive || onUnarchive || (canDelete && onDelete)) && (
                <div className="absolute right-2 top-1/2 -translate-y-1/2 z-10">
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <button
                        type="button"
                        className="opacity-0 group-hover:opacity-100 h-5 w-5 flex shrink-0 items-center justify-center rounded text-muted-foreground hover:text-foreground"
                        onClick={(e) => e.stopPropagation()}
                        aria-label="Más opciones"
                      >
                        <MoreHorizontal className="h-3.5 w-3.5" />
                      </button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" className="w-48">
                      {!isArchivedSection && onArchive && (
                        <DropdownMenuItem
                          onClick={(e) => { e.stopPropagation(); onArchive(ch.id); }}
                        >
                          <Archive className="h-3.5 w-3.5 mr-2" />
                          Archivar conversación
                        </DropdownMenuItem>
                      )}
                      {isArchivedSection && onUnarchive && (
                        <DropdownMenuItem
                          onClick={(e) => { e.stopPropagation(); onUnarchive(ch.id); }}
                        >
                          <ArchiveRestore className="h-3.5 w-3.5 mr-2" />
                          Desarchivar
                        </DropdownMenuItem>
                      )}
                      {canDelete && onDelete && (
                        <>
                          <DropdownMenuSeparator />
                          <DropdownMenuItem
                            className="text-destructive focus:text-destructive"
                            onClick={(e) => { e.stopPropagation(); onDelete(ch.id); }}
                          >
                            <Trash2 className="h-3.5 w-3.5 mr-2" />
                            Eliminar permanentemente
                          </DropdownMenuItem>
                        </>
                      )}
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/* ─── User Section (for starting DMs) ─── */

function UserSection({
  users,
  collapsed,
  onToggle,
  onSelectUser,
  creatingDmFor,
}: {
  users: AdminUser[];
  collapsed: boolean;
  onToggle: () => void;
  onSelectUser: (user: AdminUser) => void;
  creatingDmFor: string | null;
}) {
  return (
    <div>
      <button
        type="button"
        onClick={onToggle}
        className="w-full flex items-center gap-2 px-4 py-2 text-xs font-semibold text-muted-foreground uppercase tracking-wider hover:bg-accent/30 transition-colors"
      >
        {collapsed ? (
          <ChevronRight className="h-3 w-3 shrink-0" />
        ) : (
          <ChevronDown className="h-3 w-3 shrink-0" />
        )}
        <Users className="h-3.5 w-3.5" />
        <span className="flex-1 text-left">Usuarios</span>
        <span className="text-[10px] font-normal normal-case tracking-normal text-muted-foreground/70">
          {users.length}
        </span>
      </button>
      {!collapsed && (
        <div className="divide-y divide-border/20">
          {users.map((user) => (
            <button
              key={user.id}
              type="button"
              onClick={() => onSelectUser(user)}
              disabled={creatingDmFor === user.id}
              className="w-full flex items-center gap-3 px-4 py-2.5 hover:bg-accent/50 transition-colors text-left disabled:opacity-50"
            >
              <div
                className="h-8 w-8 rounded-full flex items-center justify-center shrink-0 text-white text-xs font-bold"
                style={{ backgroundColor: "#0d9488" }}
              >
                {user.name.charAt(0).toUpperCase()}
              </div>
              <div className="flex-1 min-w-0">
                <span className="text-sm font-medium truncate block">{user.name}</span>
                <span className="text-[10px] text-muted-foreground/70 truncate block">{user.email}</span>
              </div>
              {creatingDmFor === user.id && (
                <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground shrink-0" />
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

/* ─── Channel List Item ─── */

function ChannelListItem({
  channel,
  displayName,
  onClick,
}: {
  channel: ChatFloatingChannel;
  displayName: string;
  onClick: () => void;
}) {
  const initial = displayName.charAt(0).toUpperCase();

  // Avatar styling per channel type
  let avatarBg = "#6B7280";
  let avatarStyle: React.CSSProperties = {};
  if (channel.channelType === "DIRECT") {
    avatarBg = "#0d9488"; // teal-600
    avatarStyle = { backgroundColor: avatarBg };
  } else if (channel.channelType === "GROUP") {
    avatarBg = channel.group?.color || "#6B7280";
    avatarStyle = { backgroundColor: avatarBg };
  } else if (channel.channelType === "INSTALLATION") {
    avatarBg = "#4f46e5"; // indigo-600
    avatarStyle = { backgroundColor: avatarBg };
  }

  // Subtitle for installations
  const subtitle =
    channel.channelType === "INSTALLATION"
      ? channel.installation?.account?.name
      : null;

  return (
    <button
      type="button"
      onClick={onClick}
      className="w-full flex items-center gap-3 px-4 py-3 hover:bg-accent/50 transition-colors text-left"
    >
      {/* Avatar */}
      <div
        className="h-8 w-8 rounded-full flex items-center justify-center shrink-0 text-white text-xs font-bold"
        style={avatarStyle}
      >
        {initial}
      </div>

      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium truncate">{displayName}</span>
          {channel.unreadCount > 0 && (
            <span className="flex h-5 min-w-[20px] items-center justify-center rounded-full bg-teal-600 px-1.5 text-[10px] font-bold text-white shrink-0">
              {channel.unreadCount > 99 ? "99+" : channel.unreadCount}
            </span>
          )}
        </div>
        {subtitle && (
          <p className="text-[10px] text-muted-foreground/70 truncate">
            {subtitle}
          </p>
        )}
        {channel.lastMessagePreview && (
          <p className="text-xs text-muted-foreground truncate mt-0.5">
            {channel.lastMessagePreview}
          </p>
        )}
      </div>

      <ArrowLeft className="h-4 w-4 text-muted-foreground/40 rotate-180 shrink-0" />
    </button>
  );
}
