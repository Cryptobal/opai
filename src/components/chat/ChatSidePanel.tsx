"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Archive,
  ArchiveRestore,
  Bell,
  BellOff,
  AtSign,
  Building2,
  CheckCheck,
  ChevronDown,
  ChevronRight,
  Handshake,
  Loader2,
  MessageCircle,
  MoreHorizontal,
  Plus,
  Search,
  Sprout,
  Trash2,
  Users,
  X,
} from "lucide-react";
import { useSwipeGesture } from "./hooks/useSwipeGesture";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useChatSidePanelContext, type ChatSidePanelChannel, type NotifPreference } from "./ChatFloatingProvider";
import { ChatConversation } from "./ChatConversation";
import { NewExternalChatModal } from "./NewExternalChatModal";
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

/* ─── Side Panel Component ─── */

export function ChatSidePanel({ userRole }: { userRole?: string }) {
  const ctx = useChatSidePanelContext();
  const pusher = usePusher("/api/chat/pusher/auth");

  // Track whether auto-context was injected for this panel session
  const [contextInjected, setContextInjected] = useState(false);

  // Reset context injection when panel closes
  useEffect(() => {
    if (!ctx.isPanelOpen) setContextInjected(false);
  }, [ctx.isPanelOpen]);

  // Close on Escape
  useEffect(() => {
    if (!ctx.isPanelOpen) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") ctx.closePanel();
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [ctx.isPanelOpen, ctx]);

  // Lock body scroll ONLY on mobile (< lg) when open
  useEffect(() => {
    if (!ctx.isPanelOpen) return;
    const mq = window.matchMedia("(min-width: 1024px)");
    if (mq.matches) return; // desktop — no scroll lock
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

  const [searchQuery, setSearchQuery] = useState("");
  const [filter, setFilter] = useState<"all" | "unread">("all");
  const [collapsedSections, setCollapsedSections] = useState<Record<string, boolean>>({
    direct: false,
    group: true,
    installation_reportes: true,
    installation_interno: true,
    users: true,
    prospects: false,
    clients: false,
    archived: true,
  });
  const [channelToDelete, setChannelToDelete] = useState<string | null>(null);
  const [allUsers, setAllUsers] = useState<AdminUser[]>([]);
  const [creatingDmFor, setCreatingDmFor] = useState<string | null>(null);
  const [newChatModal, setNewChatModal] = useState<{ open: boolean; defaultStatus?: "prospect" | "client_active" }>({ open: false });
  const [panelEntered, setPanelEntered] = useState(false);
  const [panelClosing, setPanelClosing] = useState(false);

  // Animación de entrada del panel móvil
  useEffect(() => {
    if (ctx.isPanelOpen) {
      setPanelClosing(false);
      const id = requestAnimationFrame(() => setPanelEntered(true));
      return () => cancelAnimationFrame(id);
    } else {
      setPanelEntered(false);
    }
  }, [ctx.isPanelOpen]);

  const handleClosePanel = useCallback(() => {
    if (panelClosing) return;
    setPanelClosing(true);
    setTimeout(() => {
      ctx.closePanel();
      setPanelClosing(false);
    }, 280);
  }, [ctx, panelClosing]);

  // When panel opens: default to "unread" if there are unread messages
  const prevPanelOpen = useRef(false);
  useEffect(() => {
    if (ctx.isPanelOpen && !prevPanelOpen.current) {
      setFilter(ctx.totalUnread > 0 ? "unread" : "all");
      setSearchQuery("");
    }
    prevPanelOpen.current = ctx.isPanelOpen;
  }, [ctx.isPanelOpen, ctx.totalUnread]);

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

  const applySectionNotifPref = useCallback(
    async (channelIds: string[], preference: NotifPreference) => {
      if (channelIds.length === 0) return;
      try {
        const res = await fetch("/api/chat/channels/notification-preference-bulk", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ channelIds, preference }),
        });
        if (res.ok) await ctx.refreshChannels();
      } catch {
        /* ignore */
      }
    },
    [ctx]
  );

  const confirmDelete = async () => {
    if (!channelToDelete) return;
    await ctx.deleteChannel(channelToDelete);
    if (ctx.selectedChannelId === channelToDelete) ctx.selectChannel(null);
    setChannelToDelete(null);
  };

  const selectedChannel = ctx.channels.find((ch) => ch.id === ctx.selectedChannelId);

  // Swipe gestures para móvil: derecha = volver a lista, abajo = cerrar panel
  const swipeBack = useSwipeGesture({
    onSwipeRight: () => selectedChannel && ctx.selectChannel(null),
    followFinger: true,
    hapticOnComplete: true,
    mobileOnly: true,
  });
  const swipeClose = useSwipeGesture({
    onSwipeDown: handleClosePanel,
    hapticOnComplete: true,
    mobileOnly: true,
  });

  // Derive display name for a channel
  const getChannelDisplayName = useCallback((ch: ChatSidePanelChannel) => {
    if (ch.channelType === "DIRECT") return ch.dmParticipant?.name ?? ch.name;
    if (ch.channelType === "INSTALLATION") return ch.installation?.name ?? ch.name;
    return ch.name;
  }, []);

  // Filter and section channels + users
  const { directChannels, groupChannels, installationReportesChannels, installationInternoChannels, filteredUsers, filteredTotal } = useMemo(() => {
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

    const applyUnread = (list: typeof filtered) => filter === "unread" ? list.filter(ch => ch.unreadCount > 0 && ch.notificationPreference !== "MUTED") : list;

    return {
      directChannels: applyUnread(filtered.filter((ch) => ch.channelType === "DIRECT")),
      groupChannels: applyUnread(filtered.filter((ch) => ch.channelType === "GROUP")),
      installationReportesChannels: applyUnread(filtered.filter((ch) => ch.channelType === "INSTALLATION" && ch.subType !== "interno")),
      installationInternoChannels: applyUnread(filtered.filter((ch) => ch.channelType === "INSTALLATION" && ch.subType === "interno")),
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
      console.error("[ChatSidePanel] create DM error:", err);
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

  /* ── Shared channel list content (used by both mobile and desktop) ── */
  const channelListContent = (
    <>
      {/* Search bar */}
      <div className="px-3 pt-2 border-b border-[rgba(255,255,255,0.04)] shrink-0">
        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground/60" />
          <input
            type="text"
            placeholder="Buscar conversación..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full h-8 pl-8 pr-3 text-xs rounded-md border border-[rgba(255,255,255,0.06)] bg-muted/40 placeholder:text-muted-foreground/50 focus:outline-none focus:ring-1 focus:ring-teal-600/50 focus:border-teal-600/50"
          />
        </div>
        {/* Filtros + Marcar todos leídos */}
        <div className="px-0 pb-2 pt-2 space-y-2 shrink-0">
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={() => setFilter("all")}
              className={cn(
                "rounded-full px-3 py-1.5 text-[11px] font-medium transition-colors",
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
                "rounded-full px-3 py-1.5 text-[11px] font-medium transition-colors",
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
          <button
            type="button"
            onClick={() => ctx.markAllChannelsAsRead()}
            disabled={ctx.markAllChannelsAsReadLoading || ctx.totalUnread === 0}
            className={cn(
              "w-full flex items-center justify-center gap-2 rounded-lg px-3 py-2 text-[11px] font-medium transition-colors",
              ctx.totalUnread > 0
                ? "bg-teal-600/15 text-teal-400 hover:bg-teal-600/25 border border-teal-600/30"
                : "bg-muted/30 text-muted-foreground border border-transparent cursor-default",
              "disabled:opacity-60 disabled:cursor-not-allowed"
            )}
          >
            {ctx.markAllChannelsAsReadLoading ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <CheckCheck className="h-3.5 w-3.5" />
            )}
            {ctx.markAllChannelsAsReadLoading ? "Marcando..." : ctx.totalUnread > 0 ? "Marcar todos como leídos" : "Todo leído"}
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
        ) : filter === "unread" &&
          directChannels.filter(c => c.unreadCount > 0).length === 0 &&
          groupChannels.filter(c => c.unreadCount > 0).length === 0 &&
          installationReportesChannels.filter(c => c.unreadCount > 0).length === 0 &&
          installationInternoChannels.filter(c => c.unreadCount > 0).length === 0 &&
          prospectChannels.filter(c => c.unreadCount > 0).length === 0 &&
          clientChannels.filter(c => c.unreadCount > 0).length === 0 ? (
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
                icon={<MessageCircle className="h-3.5 w-3.5 text-teal-500" />}
                channels={directChannels}
                collapsed={isSearching || filter === "unread" ? false : !!collapsedSections["direct"]}
                onToggle={() => toggleSection("direct")}
                onSelectChannel={ctx.selectChannel}
                getDisplayName={getChannelDisplayName}
                onMarkAsRead={ctx.markChannelAsRead}
                onUpdateNotifPref={ctx.updateChannelNotifPref}
                onApplySectionNotifPref={applySectionNotifPref}
              />
            )}

            {/* Groups — con subgrupos y menú de notificaciones por grupo */}
            {groupChannels.length > 0 && (
              <GroupChannelsSection
                groupChannels={groupChannels}
                collapsed={isSearching || filter === "unread" ? false : !!collapsedSections["group"]}
                onToggle={() => toggleSection("group")}
                onSelectChannel={ctx.selectChannel}
                getDisplayName={getChannelDisplayName}
                onBulkNotifPref={ctx.refreshChannels}
                onApplySectionNotifPref={applySectionNotifPref}
                onMarkAsRead={ctx.markChannelAsRead}
                onUpdateNotifPref={ctx.updateChannelNotifPref}
              />
            )}

            {/* Instalaciones - Reportes */}
            {installationReportesChannels.length > 0 && (
              <ChannelSection
                label="Instalaciones - Reportes"
                icon={<Building2 className="h-3.5 w-3.5 text-indigo-500" />}
                channels={installationReportesChannels}
                collapsed={isSearching || filter === "unread" ? false : !!collapsedSections["installation_reportes"]}
                onToggle={() => toggleSection("installation_reportes")}
                onSelectChannel={ctx.selectChannel}
                getDisplayName={getChannelDisplayName}
                onArchive={(id) => ctx.archiveChannel(id)}
                canDelete={canDeleteChannels}
                onDelete={handleDeleteChannel}
                onMarkAsRead={ctx.markChannelAsRead}
                onUpdateNotifPref={ctx.updateChannelNotifPref}
                onApplySectionNotifPref={applySectionNotifPref}
              />
            )}

            {/* Instalaciones - Interno */}
            {installationInternoChannels.length > 0 && (
              <ChannelSection
                label="Instalaciones - Interno"
                icon={<Building2 className="h-3.5 w-3.5 text-indigo-400" />}
                channels={installationInternoChannels}
                collapsed={isSearching || filter === "unread" ? false : !!collapsedSections["installation_interno"]}
                onToggle={() => toggleSection("installation_interno")}
                onSelectChannel={ctx.selectChannel}
                getDisplayName={getChannelDisplayName}
                onArchive={(id) => ctx.archiveChannel(id)}
                canDelete={canDeleteChannels}
                onDelete={handleDeleteChannel}
                onMarkAsRead={ctx.markChannelAsRead}
                onUpdateNotifPref={ctx.updateChannelNotifPref}
                onApplySectionNotifPref={applySectionNotifPref}
              />
            )}

            {/* Prospectos */}
            {(filter === "unread" ? prospectChannels.some(c => c.unreadCount > 0) : (prospectChannels.length > 0 || !isSearching)) && (
              <ChannelSection
                label="Prospectos"
                icon={<Sprout className="h-3.5 w-3.5 text-green-500" />}
                channels={filter === "unread" ? prospectChannels.filter(c => c.unreadCount > 0) : prospectChannels}
                collapsed={isSearching || filter === "unread" ? false : !!collapsedSections["prospects"]}
                onToggle={() => toggleSection("prospects")}
                onSelectChannel={ctx.selectChannel}
                getDisplayName={(ch) => ch.account?.name ?? ch.name}
                onArchive={(id) => ctx.archiveChannel(id)}
                canDelete={canDeleteChannels}
                onDelete={handleDeleteChannel}
                onNewChat={() => setNewChatModal({ open: true, defaultStatus: "prospect" })}
                onMarkAsRead={ctx.markChannelAsRead}
                onUpdateNotifPref={ctx.updateChannelNotifPref}
                onApplySectionNotifPref={applySectionNotifPref}
              />
            )}

            {/* Clientes */}
            {(filter === "unread" ? clientChannels.some(c => c.unreadCount > 0) : (clientChannels.length > 0 || !isSearching)) && (
              <ChannelSection
                label="Clientes"
                icon={<Handshake className="h-3.5 w-3.5 text-blue-500" />}
                channels={filter === "unread" ? clientChannels.filter(c => c.unreadCount > 0) : clientChannels}
                collapsed={isSearching || filter === "unread" ? false : !!collapsedSections["clients"]}
                onToggle={() => toggleSection("clients")}
                onSelectChannel={ctx.selectChannel}
                getDisplayName={(ch) => ch.account?.name ?? ch.name}
                onArchive={(id) => ctx.archiveChannel(id)}
                canDelete={canDeleteChannels}
                onDelete={handleDeleteChannel}
                onNewChat={() => setNewChatModal({ open: true, defaultStatus: "client_active" })}
                onMarkAsRead={ctx.markChannelAsRead}
                onUpdateNotifPref={ctx.updateChannelNotifPref}
                onApplySectionNotifPref={applySectionNotifPref}
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
    </>
  );

  return (
    <>
      {/* ══════════════════════════════════════════════
          DESKTOP: Backdrop (>= lg) — click outside to close
         ══════════════════════════════════════════════ */}
      {ctx.isPanelOpen && (
        <div
          className="hidden lg:block fixed inset-0 z-30"
          onClick={ctx.closePanel}
          aria-hidden="true"
        />
      )}

      {/* ══════════════════════════════════════════════
          MOBILE: Full-screen overlay (< lg / 1024px)
         ══════════════════════════════════════════════ */}
      {ctx.isPanelOpen && (
        <>
          {/* Mobile backdrop */}
          <div
            className={cn(
              "fixed inset-0 z-50 bg-black/40 lg:hidden transition-opacity duration-300",
              panelEntered && !panelClosing ? "opacity-100" : "opacity-0"
            )}
            onClick={handleClosePanel}
            aria-hidden="true"
          />
          <div
            className={cn(
              "fixed z-50 lg:hidden flex flex-col bg-[#0a0e17] transition-transform duration-300 ease-out",
              panelEntered && !panelClosing ? "translate-x-0" : "translate-x-full"
            )}
            style={{
              top: 0,
              left: 0,
              right: 0,
              // Use 100dvh so iOS resizes correctly when the soft keyboard
              // opens / the address bar collapses.
              height: "calc(100dvh - var(--bottom-nav-height, 0px))",
              paddingTop: "env(safe-area-inset-top)",
            }}
            role="dialog"
            aria-label="Panel de chat"
          >
            {/* Mobile header (channel list only — conversation has its own via ChatPresenceBar) */}
            {!selectedChannel && (
              <div
                className="shrink-0 flex flex-col border-b border-[rgba(255,255,255,0.06)] bg-[#0d1220]"
                {...swipeClose}
              >
                <div className="flex justify-center pt-2 pb-1">
                  <div className="w-10 h-1 rounded-full bg-[rgba(255,255,255,0.2)]" aria-hidden />
                </div>
                <div className="flex items-center justify-between h-12 px-4 pb-2">
                  <div className="flex items-center gap-2">
                    <MessageCircle className="h-4 w-4 text-teal-600 shrink-0" />
                    <h3 className="text-sm font-semibold text-[rgba(255,255,255,0.88)]">Chat</h3>
                  </div>
                  <button onClick={handleClosePanel} className="p-2 text-zinc-400 hover:text-zinc-200 transition-colors">
                    <X className="h-5 w-5" />
                  </button>
                </div>
              </div>
            )}

            {/* Mobile content area */}
            <div className="relative flex-1 min-h-0 overflow-hidden">
              {/* Channel list layer */}
              <div className={cn(
                "absolute inset-0 bg-[#0a0e17] flex flex-col",
                selectedChannel ? "hidden" : "flex"
              )}>
                {channelListContent}
              </div>

              {/* Conversation layer (slides in from right) — swipe right para volver */}
              <div
                className={cn(
                  "absolute inset-0 bg-[#0a0e17] flex flex-col",
                  selectedChannel ? "translate-x-0" : "translate-x-full",
                  swipeBack.translateX != null ? "" : "transition-transform duration-[250ms] ease-out"
                )}
                style={
                  swipeBack.translateX != null
                    ? { transform: `translateX(${swipeBack.translateX}px)` }
                    : undefined
                }
                {...(selectedChannel ? { onTouchStart: swipeBack.onTouchStart, onTouchMove: swipeBack.onTouchMove, onTouchEnd: swipeBack.onTouchEnd } : {})}
              >
                {ctx.selectedChannelId && selectedChannel && (
                  <ChatConversation
                    channelId={ctx.selectedChannelId}
                    channelName={selectedChannelName}
                    pusher={pusher}
                    onBack={() => ctx.selectChannel(null)}
                    autoContextPrefix={getAutoContextPrefix}
                    currentUserId={ctx.currentUserId}
                    userRole={userRole}
                    onClose={handleClosePanel}
                    onSwipeDownToClose={handleClosePanel}
                  />
                )}
              </div>
            </div>
          </div>
        </>
      )}

      {/* ══════════════════════════════════════════════
          DESKTOP: Right side panel (>= lg / 1024px)
         ══════════════════════════════════════════════ */}
      <div
        className={cn(
          "hidden lg:flex fixed top-0 right-0 h-full w-[400px] z-40",
          "flex-col bg-[#0a0e17] border-l border-[rgba(255,255,255,0.08)]",
          "transition-transform duration-300 ease-out",
          "shadow-[-8px_0_30px_-12px_rgba(0,0,0,0.25)]",
          ctx.isPanelOpen ? "translate-x-0" : "translate-x-full pointer-events-none"
        )}
        role="dialog"
        aria-label="Panel de chat"
      >
        {ctx.selectedChannelId && selectedChannel ? (
          /* ── Desktop conversation view ── */
          <div className="flex flex-col h-full min-h-0">
            <ChatConversation
              channelId={ctx.selectedChannelId}
              channelName={selectedChannelName}
              pusher={pusher}
              onBack={() => ctx.selectChannel(null)}
              autoContextPrefix={getAutoContextPrefix}
              currentUserId={ctx.currentUserId}
              userRole={userRole}
            />
          </div>
        ) : (
          /* ── Desktop channel list view ── */
          <>
            {/* Desktop header */}
            <div className="flex items-center gap-2 px-4 h-12 border-b border-[rgba(255,255,255,0.06)] bg-[#0d1220] shrink-0">
              <MessageCircle className="h-4 w-4 text-teal-600 shrink-0" />
              <div className="flex-1 min-w-0">
                <h2 className="text-sm font-semibold truncate">Chat</h2>
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

            {channelListContent}
          </>
        )}
      </div>

      {/* ── Shared dialogs ── */}
      <ConfirmDialog
        open={!!channelToDelete}
        onOpenChange={(open) => { if (!open) setChannelToDelete(null); }}
        title="¿Eliminar conversación?"
        description="Esta acción es permanente y no se puede deshacer. Se eliminarán todos los mensajes para todos los participantes."
        confirmLabel="Eliminar permanentemente"
        onConfirm={confirmDelete}
        variant="destructive"
      />

      <NewExternalChatModal
        open={newChatModal.open}
        defaultStatus={newChatModal.defaultStatus}
        onClose={() => setNewChatModal({ open: false })}
        onCreated={(channelId) => {
          ctx.refreshChannels();
          ctx.selectChannel(channelId);
        }}
      />
    </>
  );
}

/* ─── Group Channels Section (con subgrupos y notificaciones por grupo) ─── */

function GroupChannelsSection({
  groupChannels,
  collapsed,
  onToggle,
  onSelectChannel,
  getDisplayName,
  onBulkNotifPref,
  onApplySectionNotifPref,
  onMarkAsRead,
  onUpdateNotifPref,
}: {
  groupChannels: ChatSidePanelChannel[];
  collapsed: boolean;
  onToggle: () => void;
  onSelectChannel: (id: string) => void;
  getDisplayName: (ch: ChatSidePanelChannel) => string;
  onBulkNotifPref?: () => void;
  onApplySectionNotifPref?: (channelIds: string[], preference: NotifPreference) => Promise<void>;
  onMarkAsRead?: (channelId: string) => void;
  onUpdateNotifPref?: (channelId: string, pref: NotifPreference) => void;
}) {
  const sectionUnread = groupChannels.reduce((sum, ch) => sum + (ch.notificationPreference === 'ALL' ? ch.unreadCount : 0), 0);
  const sectionPref = sectionNotifMode(groupChannels);
  const showSectionNotifMenu = onApplySectionNotifPref && groupChannels.length > 0;

  // Agrupar por groupId (channels con mismo group.id)
  const groups = useMemo(() => {
    const byGroup = new Map<string, ChatSidePanelChannel[]>();
    const noGroup: ChatSidePanelChannel[] = [];
    for (const ch of groupChannels) {
      const gid = ch.groupId ?? ch.group?.id ?? "";
      if (gid) {
        if (!byGroup.has(gid)) byGroup.set(gid, []);
        byGroup.get(gid)!.push(ch);
      } else {
        noGroup.push(ch);
      }
    }
    const result: { key: string; label: string; color: string; channels: ChatSidePanelChannel[] }[] = [];
    byGroup.forEach((channels, gid) => {
      const first = channels[0];
      const label = first?.group?.slug
        ? first.group.slug.charAt(0).toUpperCase() + first.group.slug.slice(1).replace(/-/g, " ")
        : first?.name ?? "Grupo";
      const color = first?.group?.color ?? "#6B7280";
      result.push({ key: gid, label, color, channels });
    });
    if (noGroup.length > 0) {
      result.push({ key: "_none", label: "Otros", color: "#6B7280", channels: noGroup });
    }
    return result;
  }, [groupChannels]);

  const applyBulkPref = useCallback(
    async (channelIds: string[], preference: NotifPreference) => {
      try {
        const res = await fetch("/api/chat/channels/notification-preference-bulk", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ channelIds, preference }),
        });
        if (res.ok) onBulkNotifPref?.();
      } catch {
        /* ignore */
      }
    },
    [onBulkNotifPref]
  );

  return (
    <div>
      <div className="flex items-center w-full group/section gap-1">
        <button
          type="button"
          onClick={onToggle}
          className="flex-1 min-w-0 flex items-center gap-2 px-4 py-2 text-xs font-semibold text-muted-foreground uppercase tracking-wider hover:bg-accent/30 transition-colors text-left"
        >
          {collapsed ? (
            <ChevronRight className="h-3 w-3 shrink-0" />
          ) : (
            <ChevronDown className="h-3 w-3 shrink-0" />
          )}
          <Users className="h-3.5 w-3.5 text-amber-500 shrink-0" />
          <span className="truncate">Grupos</span>
        </button>
        <div className="flex shrink-0 items-center gap-1 pr-2">
          {showSectionNotifMenu && (
            <span className="w-4 h-4 flex items-center justify-center text-muted-foreground/60" title={
              sectionPref === "ALL" ? "Notificar todo" : sectionPref === "MENTIONS_ONLY" ? "Solo menciones" : "Silenciado"
            }>
              {sectionPref === "MUTED" && <BellOff className="h-3 w-3" />}
              {sectionPref === "MENTIONS_ONLY" && <AtSign className="h-3 w-3" />}
              {sectionPref === "ALL" && <Bell className="h-3 w-3" />}
            </span>
          )}
          <span className="w-5 text-right text-[10px] font-normal tabular-nums text-muted-foreground/70">
            {groupChannels.length}
          </span>
          {sectionUnread > 0 ? (
            <span className="flex h-4 min-w-[18px] items-center justify-center rounded-full bg-teal-600 px-1.5 text-[9px] font-bold text-white">
              {sectionUnread > 99 ? "99+" : sectionUnread}
            </span>
          ) : (
            <span className="w-[18px]" />
          )}
          {showSectionNotifMenu && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button
                  type="button"
                  className="h-6 w-6 flex shrink-0 items-center justify-center rounded text-muted-foreground hover:bg-accent hover:text-foreground opacity-0 group-hover/section:opacity-100 transition-opacity"
                  onClick={(e) => e.stopPropagation()}
                  aria-label="Notificaciones de la sección Grupos"
                >
                  <MoreHorizontal className="h-3.5 w-3.5" />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="z-[70] w-52">
                <div className="px-2 py-1.5 text-[10px] font-medium text-muted-foreground uppercase tracking-wider">
                  Notificaciones para todos los grupos ({groupChannels.length} canales)
                </div>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={() => onApplySectionNotifPref!(groupChannels.map((c) => c.id), "ALL")}>
                  <Bell className="h-3.5 w-3.5 mr-2" />
                  Notificar todo
                  {sectionPref === "ALL" && <span className="ml-auto text-teal-400 text-xs">✓</span>}
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => onApplySectionNotifPref!(groupChannels.map((c) => c.id), "MENTIONS_ONLY")}>
                  <AtSign className="h-3.5 w-3.5 mr-2" />
                  Solo menciones
                  {sectionPref === "MENTIONS_ONLY" && <span className="ml-auto text-teal-400 text-xs">✓</span>}
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => onApplySectionNotifPref!(groupChannels.map((c) => c.id), "MUTED")}>
                  <BellOff className="h-3.5 w-3.5 mr-2" />
                  Silenciar
                  {sectionPref === "MUTED" && <span className="ml-auto text-teal-400 text-xs">✓</span>}
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          )}
        </div>
      </div>
      {!collapsed && (
        <div className="divide-y divide-border/20">
          {groups.map((grp) => (
            <div key={grp.key}>
              <div className="flex items-center group/sub">
                <div className="flex-1 flex items-center gap-2 px-4 py-2 pl-6 text-[11px] font-medium text-muted-foreground/80">
                  <div
                    className="h-2 w-2 rounded-full shrink-0"
                    style={{ backgroundColor: grp.color }}
                  />
                  <span className="capitalize">{grp.label}</span>
                  <span className="text-[10px] text-muted-foreground/60">({grp.channels.length})</span>
                </div>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <button
                      type="button"
                      className="opacity-0 group-hover/sub:opacity-100 mr-2 h-6 w-6 flex shrink-0 items-center justify-center rounded text-muted-foreground hover:text-foreground"
                      onClick={(e) => e.stopPropagation()}
                      aria-label="Notificaciones del grupo"
                    >
                      <MoreHorizontal className="h-3.5 w-3.5" />
                    </button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="z-[70] w-52">
                    <div className="px-2 py-1.5 text-[10px] font-medium text-muted-foreground uppercase tracking-wider">
                      Notificaciones para {grp.channels.length} canal{grp.channels.length !== 1 ? "es" : ""}
                    </div>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem onClick={() => applyBulkPref(grp.channels.map((c) => c.id), "ALL")}>
                      <Bell className="h-3.5 w-3.5 mr-2" />
                      Notificar todo
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => applyBulkPref(grp.channels.map((c) => c.id), "MENTIONS_ONLY")}>
                      <AtSign className="h-3.5 w-3.5 mr-2" />
                      Solo menciones
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => applyBulkPref(grp.channels.map((c) => c.id), "MUTED")}>
                      <BellOff className="h-3.5 w-3.5 mr-2" />
                      Silenciar
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
              <div className="divide-y divide-border/20">
                {grp.channels.map((ch) => (
                  <div key={ch.id} className="relative group flex items-center">
                    <div className="flex-1 min-w-0">
                      <ChannelListItem
                        channel={ch}
                        displayName={getDisplayName(ch)}
                        onClick={() => onSelectChannel(ch.id)}
                      />
                    </div>
                    {(onMarkAsRead || onUpdateNotifPref) && (
                      <div className="absolute right-3 top-1/2 -translate-y-1/2 z-10 pl-2">
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <button
                              type="button"
                              className="opacity-0 group-hover:opacity-100 h-8 w-8 flex shrink-0 items-center justify-center rounded text-muted-foreground hover:text-foreground hover:bg-accent/50"
                              onClick={(e) => e.stopPropagation()}
                              aria-label="Más opciones"
                            >
                              <MoreHorizontal className="h-3.5 w-3.5" />
                            </button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end" className="z-[70] w-52">
                            {onMarkAsRead && ch.unreadCount > 0 && (
                              <DropdownMenuItem onClick={(e) => { e.stopPropagation(); onMarkAsRead(ch.id); }}>
                                <CheckCheck className="h-3.5 w-3.5 mr-2" />
                                Marcar como leído
                              </DropdownMenuItem>
                            )}
                            {onUpdateNotifPref && (
                              <>
                                {(onMarkAsRead && ch.unreadCount > 0) && <DropdownMenuSeparator />}
                                <div className="px-2 py-1.5 text-[10px] font-medium text-muted-foreground uppercase tracking-wider">
                                  Notificaciones
                                </div>
                                <DropdownMenuItem onClick={(e) => { e.stopPropagation(); onUpdateNotifPref(ch.id, "ALL"); }}>
                                  <Bell className="h-3.5 w-3.5 mr-2" />
                                  Notificar todo
                                  {ch.notificationPreference === "ALL" && <span className="ml-auto text-teal-400 text-xs">✓</span>}
                                </DropdownMenuItem>
                                <DropdownMenuItem onClick={(e) => { e.stopPropagation(); onUpdateNotifPref(ch.id, "MENTIONS_ONLY"); }}>
                                  <AtSign className="h-3.5 w-3.5 mr-2" />
                                  Solo menciones
                                  {ch.notificationPreference === "MENTIONS_ONLY" && <span className="ml-auto text-teal-400 text-xs">✓</span>}
                                </DropdownMenuItem>
                                <DropdownMenuItem onClick={(e) => { e.stopPropagation(); onUpdateNotifPref(ch.id, "MUTED"); }}>
                                  <BellOff className="h-3.5 w-3.5 mr-2" />
                                  Silenciar
                                  {ch.notificationPreference === "MUTED" && <span className="ml-auto text-teal-400 text-xs">✓</span>}
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
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/* ─── Channel Section ─── */

function sectionNotifMode(channels: ChatSidePanelChannel[]): NotifPreference {
  if (channels.length === 0) return "ALL";
  const counts: Record<NotifPreference, number> = { ALL: 0, MENTIONS_ONLY: 0, MUTED: 0 };
  for (const ch of channels) {
    counts[ch.notificationPreference] = (counts[ch.notificationPreference] ?? 0) + 1;
  }
  const max = Math.max(counts.ALL, counts.MENTIONS_ONLY, counts.MUTED);
  if (max === counts.MUTED) return "MUTED";
  if (max === counts.MENTIONS_ONLY) return "MENTIONS_ONLY";
  return "ALL";
}

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
  onNewChat,
  onMarkAsRead,
  onUpdateNotifPref,
  onApplySectionNotifPref,
}: {
  label: string;
  icon: React.ReactNode;
  channels: ChatSidePanelChannel[];
  collapsed: boolean;
  onToggle: () => void;
  onSelectChannel: (id: string) => void;
  getDisplayName: (ch: ChatSidePanelChannel) => string;
  onArchive?: (channelId: string) => void;
  onUnarchive?: (channelId: string) => void;
  canDelete?: boolean;
  onDelete?: (channelId: string) => void;
  isArchivedSection?: boolean;
  onNewChat?: () => void;
  onMarkAsRead?: (channelId: string) => void;
  onUpdateNotifPref?: (channelId: string, pref: NotifPreference) => void;
  onApplySectionNotifPref?: (channelIds: string[], preference: NotifPreference) => Promise<void>;
}) {
  const sectionUnread = channels.reduce((sum, ch) => sum + (ch.notificationPreference === 'ALL' ? ch.unreadCount : 0), 0);
  const sectionPref = sectionNotifMode(channels);
  const showSectionNotifMenu = onApplySectionNotifPref && !isArchivedSection && channels.length > 0;

  return (
    <div>
      <div className="flex items-center w-full group/section gap-1">
        <button
          type="button"
          onClick={onToggle}
          className="flex-1 min-w-0 flex items-center gap-2 px-4 py-2 text-xs font-semibold text-muted-foreground uppercase tracking-wider hover:bg-accent/30 transition-colors text-left"
        >
          {collapsed ? (
            <ChevronRight className="h-3 w-3 shrink-0" />
          ) : (
            <ChevronDown className="h-3 w-3 shrink-0" />
          )}
          {icon}
          <span className="truncate">{label}</span>
        </button>
        {/* Columna derecha alineada: notif | count | badge | menu | plus */}
        <div className="flex shrink-0 items-center gap-1 pr-2">
          <span className="w-4 h-4 flex shrink-0 items-center justify-center text-muted-foreground/60" title={
            showSectionNotifMenu ? (sectionPref === "ALL" ? "Notificar todo" : sectionPref === "MENTIONS_ONLY" ? "Solo menciones" : "Silenciado") : undefined
          }>
            {showSectionNotifMenu ? (
              <>
                {sectionPref === "MUTED" ? <BellOff className="h-3 w-3" /> : null}
                {sectionPref === "MENTIONS_ONLY" ? <AtSign className="h-3 w-3" /> : null}
                {sectionPref === "ALL" ? <Bell className="h-3 w-3" /> : null}
              </>
            ) : null}
          </span>
          <span className="w-5 text-right text-[10px] font-normal tabular-nums text-muted-foreground/70">
            {channels.length}
          </span>
          {sectionUnread > 0 ? (
            <span className="flex h-4 min-w-[18px] items-center justify-center rounded-full bg-teal-600 px-1.5 text-[9px] font-bold text-white">
              {sectionUnread > 99 ? "99+" : sectionUnread}
            </span>
          ) : (
            <span className="w-[18px]" />
          )}
          {showSectionNotifMenu && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button
                  type="button"
                  className="h-6 w-6 flex shrink-0 items-center justify-center rounded text-muted-foreground hover:bg-accent hover:text-foreground opacity-0 group-hover/section:opacity-100 transition-opacity"
                  onClick={(e) => e.stopPropagation()}
                  aria-label="Notificaciones de la sección"
                >
                  <MoreHorizontal className="h-3.5 w-3.5" />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="z-[70] w-52">
                <div className="px-2 py-1.5 text-[10px] font-medium text-muted-foreground uppercase tracking-wider">
                  Notificaciones para {channels.length} canal{channels.length !== 1 ? "es" : ""}
                </div>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={() => onApplySectionNotifPref!(channels.map((c) => c.id), "ALL")}>
                  <Bell className="h-3.5 w-3.5 mr-2" />
                  Notificar todo
                  {sectionPref === "ALL" && <span className="ml-auto text-teal-400 text-xs">✓</span>}
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => onApplySectionNotifPref!(channels.map((c) => c.id), "MENTIONS_ONLY")}>
                  <AtSign className="h-3.5 w-3.5 mr-2" />
                  Solo menciones
                  {sectionPref === "MENTIONS_ONLY" && <span className="ml-auto text-teal-400 text-xs">✓</span>}
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => onApplySectionNotifPref!(channels.map((c) => c.id), "MUTED")}>
                  <BellOff className="h-3.5 w-3.5 mr-2" />
                  Silenciar
                  {sectionPref === "MUTED" && <span className="ml-auto text-teal-400 text-xs">✓</span>}
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          )}
          {onNewChat && (
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); onNewChat(); }}
              className="h-6 w-6 flex shrink-0 items-center justify-center rounded text-muted-foreground hover:bg-accent hover:text-foreground"
              aria-label="Nuevo chat"
            >
              <Plus className="h-3 w-3" />
            </button>
          )}
        </div>
      </div>
      {!collapsed && (
        <div className="divide-y divide-border/20">
          {channels.map((ch) => {
            const hasMenu = onArchive || onUnarchive || (canDelete && onDelete) || onMarkAsRead || onUpdateNotifPref;
            return (
              <div key={ch.id} className="relative group flex items-center">
                <div className="flex-1 min-w-0">
                  <ChannelListItem
                    channel={ch}
                    displayName={getDisplayName(ch)}
                    onClick={() => onSelectChannel(ch.id)}
                  />
                </div>
                {hasMenu && (
                  <div className="absolute right-3 top-1/2 -translate-y-1/2 z-10 pl-2">
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <button
                          type="button"
                          className="opacity-0 group-hover:opacity-100 h-8 w-8 flex shrink-0 items-center justify-center rounded text-muted-foreground hover:text-foreground hover:bg-accent/50"
                          onClick={(e) => e.stopPropagation()}
                          aria-label="Más opciones"
                        >
                          <MoreHorizontal className="h-3.5 w-3.5" />
                        </button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end" className="z-[70] w-52">
                        {onMarkAsRead && ch.unreadCount > 0 && (
                          <DropdownMenuItem onClick={(e) => { e.stopPropagation(); onMarkAsRead(ch.id); }}>
                            <CheckCheck className="h-3.5 w-3.5 mr-2" />
                            Marcar como leído
                          </DropdownMenuItem>
                        )}
                        {onUpdateNotifPref && (
                          <>
                            {(onMarkAsRead && ch.unreadCount > 0) && <DropdownMenuSeparator />}
                            <div className="px-2 py-1.5 text-[10px] font-medium text-muted-foreground uppercase tracking-wider">
                              Notificaciones
                            </div>
                            <DropdownMenuItem onClick={(e) => { e.stopPropagation(); onUpdateNotifPref(ch.id, "ALL"); }}>
                              <Bell className="h-3.5 w-3.5 mr-2" />
                              Notificar todo
                              {ch.notificationPreference === "ALL" && <span className="ml-auto text-teal-400 text-xs">✓</span>}
                            </DropdownMenuItem>
                            <DropdownMenuItem onClick={(e) => { e.stopPropagation(); onUpdateNotifPref(ch.id, "MENTIONS_ONLY"); }}>
                              <AtSign className="h-3.5 w-3.5 mr-2" />
                              Solo menciones
                              {ch.notificationPreference === "MENTIONS_ONLY" && <span className="ml-auto text-teal-400 text-xs">✓</span>}
                            </DropdownMenuItem>
                            <DropdownMenuItem onClick={(e) => { e.stopPropagation(); onUpdateNotifPref(ch.id, "MUTED"); }}>
                              <BellOff className="h-3.5 w-3.5 mr-2" />
                              Silenciar
                              {ch.notificationPreference === "MUTED" && <span className="ml-auto text-teal-400 text-xs">✓</span>}
                            </DropdownMenuItem>
                          </>
                        )}
                        {(onArchive || onUnarchive || (canDelete && onDelete)) && (
                          <>
                            <DropdownMenuSeparator />
                            {!isArchivedSection && onArchive && (
                              <DropdownMenuItem onClick={(e) => { e.stopPropagation(); onArchive(ch.id); }}>
                                <Archive className="h-3.5 w-3.5 mr-2" />
                                Archivar conversación
                              </DropdownMenuItem>
                            )}
                            {isArchivedSection && onUnarchive && (
                              <DropdownMenuItem onClick={(e) => { e.stopPropagation(); onUnarchive(ch.id); }}>
                                <ArchiveRestore className="h-3.5 w-3.5 mr-2" />
                                Desarchivar
                              </DropdownMenuItem>
                            )}
                            {canDelete && onDelete && (
                              <DropdownMenuItem
                                className="text-destructive focus:text-destructive"
                                onClick={(e) => { e.stopPropagation(); onDelete(ch.id); }}
                              >
                                <Trash2 className="h-3.5 w-3.5 mr-2" />
                                Eliminar permanentemente
                              </DropdownMenuItem>
                            )}
                          </>
                        )}
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>
                )}
              </div>
            );
          })}
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
      <div className="flex items-center w-full gap-1">
        <button
          type="button"
          onClick={onToggle}
          className="flex-1 min-w-0 flex items-center gap-2 px-4 py-2 text-xs font-semibold text-muted-foreground uppercase tracking-wider hover:bg-accent/30 transition-colors text-left"
        >
          {collapsed ? (
            <ChevronRight className="h-3 w-3 shrink-0" />
          ) : (
            <ChevronDown className="h-3 w-3 shrink-0" />
          )}
          <Users className="h-3.5 w-3.5 shrink-0" />
          <span className="truncate">Usuarios</span>
        </button>
        <div className="flex shrink-0 items-center gap-1 pr-2">
          <span className="w-4" />
          <span className="w-5 text-right text-[10px] font-normal tabular-nums text-muted-foreground/70">
            {users.length}
          </span>
          <span className="w-[18px]" />
        </div>
      </div>
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
  channel: ChatSidePanelChannel;
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
        <div className="flex items-center gap-1.5">
          <span className="text-sm font-medium truncate">{displayName}</span>
          {channel.notificationPreference === "MENTIONS_ONLY" && (
            <AtSign className="h-3 w-3 shrink-0 text-muted-foreground/50" />
          )}
          {channel.notificationPreference === "MUTED" && (
            <BellOff className="h-3 w-3 shrink-0 text-muted-foreground/50" />
          )}
          {channel.unreadCount > 0 && channel.notificationPreference !== "MUTED" && (
            <span className={cn(
              "flex h-5 min-w-[20px] items-center justify-center rounded-full px-1.5 text-[10px] font-bold shrink-0",
              channel.notificationPreference === "MENTIONS_ONLY"
                ? "bg-zinc-600 text-zinc-300"
                : "bg-teal-600 text-white"
            )}>
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
    </button>
  );
}
