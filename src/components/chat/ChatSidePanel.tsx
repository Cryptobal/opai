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
  Link2,
  Loader2,
  MessageCircle,
  MoreHorizontal,
  Plus,
  Search,
  Sprout,
  Trash2,
  Unlink,
  Users,
  X,
} from "lucide-react";
import { useSwipeGesture } from "./hooks/useSwipeGesture";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useIsIOS } from "@/hooks/usePlatform";
import { useChatSidePanelContext, type ChatSidePanelChannel, type NotifPreference } from "./ChatFloatingProvider";
import { ChatConversation } from "./ChatConversation";
import { NewExternalChatModal } from "./NewExternalChatModal";
import { ChatNewDmModal } from "./ChatNewDmModal";
import { usePusher } from "./hooks/usePusher";
import { useSlackBridges, type SlackBridgeInfo } from "./useSlackBridges";
import { ChatChannelSlackBridge } from "./ChatChannelSlackBridge";
import { ChatChannelListItem, getChannelDisplayName as sharedDisplayName } from "./ChatChannelListItem";
import type { ChatChannelData } from "@/lib/chat-types";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

type AdminUser = { id: string; name: string; email: string };
type CrmAccountSearchResult = { id: string; name: string; status: string };

/** Control de puentes Slack que baja a cada sección de canales. */
type SlackBridgeCtl = {
  enabled: boolean;
  bridges: Record<string, SlackBridgeInfo>;
  refresh: () => void;
};

function asChannelData(ch: ChatSidePanelChannel): ChatChannelData {
  return {
    id: ch.id,
    tenantId: "",
    channelType: ch.channelType as ChatChannelData["channelType"],
    installationId: ch.installationId,
    subType: ch.subType,
    groupId: ch.groupId,
    name: ch.name,
    isActive: true,
    lastMessageAt: ch.lastMessageAt,
    lastMessagePreview: ch.lastMessagePreview,
    lastMessageSenderName: ch.lastMessageSenderName ?? null,
    messageCount: ch.messageCount,
    createdAt: "",
    updatedAt: "",
    installation: ch.installation,
    group: ch.group,
    dmParticipant: ch.dmParticipant,
    account: ch.account,
    unreadCount: ch.unreadCount,
    notificationPreference: ch.notificationPreference,
    isArchivedByMe: ch.isArchivedByMe,
  };
}

function ambiguousIds(channels: ChatSidePanelChannel[], getName: (ch: ChatSidePanelChannel) => string): Set<string> {
  const counts = new Map<string, number>();
  for (const ch of channels) {
    const n = getName(ch);
    counts.set(n, (counts.get(n) ?? 0) + 1);
  }
  const out = new Set<string>();
  for (const ch of channels) {
    if ((counts.get(getName(ch)) ?? 0) > 1) out.add(ch.id);
  }
  return out;
}

/* ─── Side Panel Component ─── */

export function ChatSidePanel({ userRole }: { userRole?: string }) {
  const ctx = useChatSidePanelContext();
  const pusher = usePusher("/api/chat/pusher/auth");
  const isIOS = useIsIOS();

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
    direct: true,
    group: true,
    installation_reportes: true,
    installation_interno: true,
    prospects: true,
    clients: true,
    archived: true,
  });
  const [channelToDelete, setChannelToDelete] = useState<string | null>(null);
  const [showNewDm, setShowNewDm] = useState(false);
  const [newChatModal, setNewChatModal] = useState<{ open: boolean; defaultStatus?: "prospect" | "client_active"; defaultAccountId?: string }>({ open: false });
  const [searchUsers, setSearchUsers] = useState<AdminUser[]>([]);
  const [searchAccounts, setSearchAccounts] = useState<CrmAccountSearchResult[]>([]);
  const [searchLoading, setSearchLoading] = useState(false);
  const [showInactiveExternal, setShowInactiveExternal] = useState<boolean>(() => {
    if (typeof window === "undefined") return false;
    return localStorage.getItem("opai.chat.showInactiveExternal") === "true";
  });
  const [cleanupTarget, setCleanupTarget] = useState<"prospects" | "clients" | null>(null);
  const [cleanupLoading, setCleanupLoading] = useState(false);
  const [panelEntered, setPanelEntered] = useState(false);
  const [panelClosing, setPanelClosing] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;
    localStorage.setItem("opai.chat.showInactiveExternal", String(showInactiveExternal));
  }, [showInactiveExternal]);

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

  // Lista de canales (sin conversación abierta): cursor en "Buscar conversación…".
  // Hay dos mounts (mobile/desktop); solo enfocar el input visible.
  useEffect(() => {
    if (!ctx.isPanelOpen || ctx.selectedChannelId) return;
    const focusVisibleSearch = () => {
      const inputs = document.querySelectorAll<HTMLInputElement>(
        'input.opai-chat-mobile-search',
      );
      for (const el of inputs) {
        if (el.getClientRects().length === 0) continue;
        el.focus({ preventScroll: true });
        return;
      }
    };
    let timeoutId = 0;
    const raf = requestAnimationFrame(() => {
      focusVisibleSearch();
      timeoutId = window.setTimeout(focusVisibleSearch, 80);
    });
    return () => {
      cancelAnimationFrame(raf);
      if (timeoutId) window.clearTimeout(timeoutId);
    };
  }, [ctx.isPanelOpen, ctx.selectedChannelId]);

  // Debounced universal search for "Iniciar nueva conversación" suggestions
  useEffect(() => {
    const q = searchQuery.trim();
    if (q.length < 2) {
      setSearchUsers([]);
      setSearchAccounts([]);
      return;
    }
    const timer = setTimeout(async () => {
      setSearchLoading(true);
      try {
        const [usersRes, accountsRes] = await Promise.all([
          fetch(`/api/chat/mentions/users?search=${encodeURIComponent(q)}`).then((r) => r.ok ? r.json() : null),
          fetch(`/api/crm/accounts?search=${encodeURIComponent(q)}`).then((r) => r.ok ? r.json() : null),
        ]);
        if (usersRes?.success) setSearchUsers(usersRes.data ?? []);
        if (accountsRes?.success) setSearchAccounts(accountsRes.data ?? []);
      } catch {
        /* ignore */
      } finally {
        setSearchLoading(false);
      }
    }, 300);
    return () => clearTimeout(timer);
  }, [searchQuery]);

  // Derived external channels (with activity filter)
  const isActiveExternal = (c: ChatSidePanelChannel) =>
    (c.messageCount ?? 0) > 0 || c.lastMessageAt != null;

  const allProspectChannels = ctx.channels.filter(
    (c) => c.channelType === "EXTERNAL" && c.account?.status === "prospect"
  );
  const allClientChannels = ctx.channels.filter(
    (c) =>
      c.channelType === "EXTERNAL" &&
      (c.account?.status === "client_active" || c.account?.status === "client_inactive")
  );
  const prospectChannels = showInactiveExternal
    ? allProspectChannels
    : allProspectChannels.filter(isActiveExternal);
  const clientChannels = showInactiveExternal
    ? allClientChannels
    : allClientChannels.filter(isActiveExternal);
  const hiddenProspectCount = allProspectChannels.length - prospectChannels.length;
  const hiddenClientCount = allClientChannels.length - clientChannels.length;

  const canDeleteChannels = userRole === "owner" || userRole === "admin";

  // Puentes Slack (solo admins): mismo gate que requireSlackAdmin en el API.
  const { connected: slackConnected, bridgeByChatChannelId: slackBridges, refresh: refreshSlackBridges } =
    useSlackBridges(canDeleteChannels);
  const slackCtl = useMemo<SlackBridgeCtl>(
    () => ({ enabled: canDeleteChannels && slackConnected, bridges: slackBridges, refresh: refreshSlackBridges }),
    [canDeleteChannels, slackConnected, slackBridges, refreshSlackBridges],
  );

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

  const handleCleanupInactive = useCallback(async () => {
    if (!cleanupTarget) return;
    setCleanupLoading(true);
    try {
      const res = await fetch("/api/chat/channels/cleanup-inactive", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ scope: cleanupTarget }),
      });
      if (res.ok) {
        await ctx.refreshChannels();
      }
    } finally {
      setCleanupLoading(false);
      setCleanupTarget(null);
    }
  }, [cleanupTarget, ctx]);

  const confirmDelete = async () => {
    if (!channelToDelete) return;
    await ctx.deleteChannel(channelToDelete);
    if (ctx.selectedChannelId === channelToDelete) ctx.selectChannel(null);
    setChannelToDelete(null);
  };

  const selectedChannel = ctx.channels.find((ch) => ch.id === ctx.selectedChannelId);

  // Swipe gestures para móvil: derecha = volver a lista, abajo = cerrar panel
  const swipeBackRef = useRef<HTMLDivElement | null>(null);
  const swipeBack = useSwipeGesture({
    onSwipeRight: () => selectedChannel && ctx.selectChannel(null),
    followFinger: true,
    targetRef: swipeBackRef,
    hapticOnComplete: true,
    mobileOnly: true,
    edgeOnly: "left",
    directionLock: true,
  });
  const swipeClose = useSwipeGesture({
    onSwipeDown: handleClosePanel,
    hapticOnComplete: true,
    mobileOnly: true,
  });

  // Derive display name for a channel
  const getChannelDisplayName = useCallback((ch: ChatSidePanelChannel) => {
    return sharedDisplayName(asChannelData(ch));
  }, []);

  // Filter and section channels
  const { directChannels, groupChannels, installationReportesChannels, filteredTotal } = useMemo(() => {
    const q = searchQuery.toLowerCase().trim();
    const filtered = q
      ? ctx.channels.filter((ch) => {
          const displayName = getChannelDisplayName(ch).toLowerCase();
          if (displayName.includes(q)) return true;
          if (ch.channelType === "INSTALLATION" && ch.installation?.account?.name?.toLowerCase().includes(q)) return true;
          return false;
        })
      : ctx.channels;

    const applyUnread = (list: typeof filtered) => filter === "unread" ? list.filter(ch => ch.unreadCount > 0 && ch.notificationPreference !== "MUTED") : list;

    return {
      directChannels: applyUnread(filtered.filter((ch) => ch.channelType === "DIRECT")),
      groupChannels: applyUnread(filtered.filter((ch) => ch.channelType === "GROUP")),
      installationReportesChannels: applyUnread(filtered.filter((ch) => ch.channelType === "INSTALLATION" && ch.subType !== "interno")),
      filteredTotal: filtered.length,
    };
  }, [ctx.channels, searchQuery, getChannelDisplayName, filter]);

  const isSearching = searchQuery.trim().length > 0;

  // Candidates for "Iniciar nueva conversación": filter out users/accounts already with a channel
  const newDmCandidates = useMemo(() => {
    const existingDmUserIds = new Set(
      ctx.channels
        .filter((ch) => ch.channelType === "DIRECT" && ch.dmParticipant)
        .map((ch) => ch.dmParticipant!.id)
    );
    return searchUsers.filter((u) => u.id !== ctx.currentUserId && !existingDmUserIds.has(u.id));
  }, [searchUsers, ctx.channels, ctx.currentUserId]);

  const newExternalCandidates = useMemo(() => {
    const existingAccountIds = new Set(
      ctx.channels
        .filter((ch) => ch.channelType === "EXTERNAL" && ch.account)
        .map((ch) => ch.account!.id)
    );
    return searchAccounts.filter((a) => !existingAccountIds.has(a.id));
  }, [searchAccounts, ctx.channels]);

  const toggleSection = useCallback((key: string) => {
    setCollapsedSections((prev) => ({ ...prev, [key]: !prev[key] }));
  }, []);

  // Start a DM with a user from search suggestions
  const handleStartDmFromSearch = useCallback(async (user: AdminUser) => {
    try {
      const res = await fetch("/api/chat/dms", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ targetAdminId: user.id }),
      });
      if (res.ok) {
        const json = await res.json();
        if (json.success) {
          setSearchQuery("");
          await ctx.refreshChannels();
          ctx.selectChannel(json.data.id);
        }
      }
    } catch (err) {
      console.error("[ChatSidePanel] start DM error:", err);
    }
  }, [ctx]);

  // Open the external chat modal with a pre-selected account
  const handleStartExternalFromSearch = useCallback((account: CrmAccountSearchResult) => {
    const defaultStatus: "prospect" | "client_active" =
      account.status === "prospect" ? "prospect" : "client_active";
    setNewChatModal({ open: true, defaultStatus, defaultAccountId: account.id });
    setSearchQuery("");
  }, []);

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
      {/* Search + segmented filter */}
      <div className="px-3 pt-2 pb-2 border-b border-ds-border-subtle shrink-0 opai-chat-mobile-list-chrome space-y-2">
        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-ds-text-4" />
          <input
            type="text"
            placeholder="Buscar conversación..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full h-9 pl-8 pr-9 text-[13px] rounded-md border border-ds-border-default bg-ds-surface-2 placeholder:text-ds-text-4 focus:outline-none focus:ring-1 focus:ring-status-info-border focus:border-status-info-border opai-chat-mobile-search"
          />
          {searchQuery && (
            <button
              type="button"
              onClick={() => setSearchQuery("")}
              className="absolute right-2 top-1/2 -translate-y-1/2 h-7 w-7 flex items-center justify-center rounded-md text-ds-text-4 hover:text-ds-text-1"
              aria-label="Limpiar búsqueda"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
        <div className="inline-flex rounded-lg border border-ds-border-default bg-ds-surface-2 p-0.5">
          <button
            type="button"
            onClick={() => setFilter("all")}
            className={cn(
              "rounded-md px-3 h-8 text-[13px] font-medium transition-colors opai-chat-mobile-pill",
              filter === "all"
                ? "bg-status-info text-primary-foreground"
                : "text-ds-text-3 hover:text-ds-text-1"
            )}
          >
            Todos
          </button>
          <button
            type="button"
            onClick={() => setFilter("unread")}
            className={cn(
              "rounded-md px-3 h-8 text-[13px] font-medium transition-colors inline-flex items-center gap-1.5 opai-chat-mobile-pill",
              filter === "unread"
                ? "bg-status-info text-primary-foreground"
                : "text-ds-text-3 hover:text-ds-text-1"
            )}
          >
            No leídos
            {ctx.totalUnread > 0 && (
              <span className={cn(
                "inline-flex h-5 min-w-[18px] items-center justify-center rounded-full px-1 text-[12px] font-bold",
                filter === "unread" ? "bg-primary-foreground/20 text-primary-foreground" : "bg-status-info-soft text-status-info-fg"
              )}>
                {ctx.totalUnread > 99 ? "99+" : ctx.totalUnread}
              </span>
            )}
          </button>
        </div>
      </div>

      {/* Channel list */}
      <div className="flex-1 overflow-y-auto min-h-0 opai-chat-mobile-scroll">
        {ctx.loading ? (
          <div className="px-3 py-3 space-y-2" aria-busy="true" aria-label="Cargando conversaciones">
            {[0, 1, 2].map((i) => (
              <div key={i} className="h-[60px] rounded-xl bg-ds-surface-2 animate-pulse" />
            ))}
          </div>
        ) : filter === "unread" &&
          directChannels.filter(c => c.unreadCount > 0).length === 0 &&
          groupChannels.filter(c => c.unreadCount > 0).length === 0 &&
          installationReportesChannels.filter(c => c.unreadCount > 0).length === 0 &&
          prospectChannels.filter(c => c.unreadCount > 0).length === 0 &&
          clientChannels.filter(c => c.unreadCount > 0).length === 0 ? (
          <div className="flex flex-col items-center gap-2 py-12 text-center px-4">
            <span className="text-3xl">✓</span>
            <p className="text-sm font-medium text-muted-foreground">Todo al día</p>
            <p className="text-[12px] text-muted-foreground/60">No tienes mensajes sin leer</p>
          </div>
        ) : filteredTotal === 0 && !(isSearching && (newDmCandidates.length > 0 || newExternalCandidates.length > 0 || searchLoading)) ? (
          <div className="flex flex-col items-center gap-1.5 py-10 text-center px-4">
            <MessageCircle className="h-8 w-8 text-muted-foreground/20" />
            <p className="text-xs text-muted-foreground">
              {searchQuery
                ? "No se encontraron conversaciones"
                : "No tienes conversaciones aún"}
            </p>
            {!searchQuery && (
              <p className="text-[12px] text-muted-foreground/60">
                Contacta a un administrador para unirte a un canal
              </p>
            )}
          </div>
        ) : (
          <div>
            {/* Direct Messages — siempre visible (excepto al buscar/filtrar) para acceder a "+" */}
            {((!isSearching && filter !== "unread") || directChannels.length > 0) && (
              <ChannelSection
                label="Mensajes directos"
                icon={<MessageCircle className="h-3.5 w-3.5 text-status-info-fg" />}
                channels={directChannels}
                collapsed={isSearching ? false : !!collapsedSections["direct"]}
                onToggle={() => toggleSection("direct")}
                onSelectChannel={ctx.selectChannel}
                getDisplayName={getChannelDisplayName}
                onMarkAsRead={ctx.markChannelAsRead}
                onUpdateNotifPref={ctx.updateChannelNotifPref}
                onApplySectionNotifPref={applySectionNotifPref}
                onNewChat={() => setShowNewDm(true)}
                emptyHint="Sin mensajes directos. Toca + para iniciar uno."
              />
            )}

            {/* Groups — con subgrupos y menú de notificaciones por grupo */}
            {groupChannels.length > 0 && (
              <GroupChannelsSection
                groupChannels={groupChannels}
                collapsed={isSearching ? false : !!collapsedSections["group"]}
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
                icon={<Building2 className="h-3.5 w-3.5 text-status-info-fg" />}
                channels={installationReportesChannels}
                collapsed={isSearching ? false : !!collapsedSections["installation_reportes"]}
                onToggle={() => toggleSection("installation_reportes")}
                slack={slackCtl}
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
                icon={<Sprout className="h-3.5 w-3.5 text-status-ok-fg" />}
                channels={filter === "unread" ? prospectChannels.filter(c => c.unreadCount > 0) : prospectChannels}
                collapsed={isSearching ? false : !!collapsedSections["prospects"]}
                onToggle={() => toggleSection("prospects")}
                slack={slackCtl}
                onSelectChannel={ctx.selectChannel}
                getDisplayName={(ch) => ch.account?.name ?? ch.name}
                onArchive={(id) => ctx.archiveChannel(id)}
                canDelete={canDeleteChannels}
                onDelete={handleDeleteChannel}
                onNewChat={() => setNewChatModal({ open: true, defaultStatus: "prospect" })}
                onMarkAsRead={ctx.markChannelAsRead}
                onUpdateNotifPref={ctx.updateChannelNotifPref}
                onApplySectionNotifPref={applySectionNotifPref}
                subtitle={!showInactiveExternal && hiddenProspectCount > 0 ? `(+${hiddenProspectCount} sin actividad)` : undefined}
                extraHeaderActions={canDeleteChannels ? (
                  <CleanupSectionButton onCleanup={() => setCleanupTarget("prospects")} />
                ) : undefined}
              />
            )}

            {/* Clientes */}
            {(filter === "unread" ? clientChannels.some(c => c.unreadCount > 0) : (clientChannels.length > 0 || !isSearching)) && (
              <ChannelSection
                label="Clientes"
                icon={<Handshake className="h-3.5 w-3.5 text-status-info-fg" />}
                channels={filter === "unread" ? clientChannels.filter(c => c.unreadCount > 0) : clientChannels}
                collapsed={isSearching ? false : !!collapsedSections["clients"]}
                onToggle={() => toggleSection("clients")}
                slack={slackCtl}
                onSelectChannel={ctx.selectChannel}
                getDisplayName={(ch) => ch.account?.name ?? ch.name}
                onArchive={(id) => ctx.archiveChannel(id)}
                canDelete={canDeleteChannels}
                onDelete={handleDeleteChannel}
                onNewChat={() => setNewChatModal({ open: true, defaultStatus: "client_active" })}
                onMarkAsRead={ctx.markChannelAsRead}
                onUpdateNotifPref={ctx.updateChannelNotifPref}
                onApplySectionNotifPref={applySectionNotifPref}
                subtitle={!showInactiveExternal && hiddenClientCount > 0 ? `(+${hiddenClientCount} sin actividad)` : undefined}
                extraHeaderActions={canDeleteChannels ? (
                  <CleanupSectionButton onCleanup={() => setCleanupTarget("clients")} />
                ) : undefined}
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
                slack={slackCtl}
                canDelete={canDeleteChannels}
                onDelete={handleDeleteChannel}
                isArchivedSection
              />
            )}

            {/* Iniciar nueva conversación — solo aparece al buscar */}
            {isSearching && (newDmCandidates.length > 0 || newExternalCandidates.length > 0 || searchLoading) && (
              <div className="opai-chat-mobile-section border-t border-border/30 mt-2 pt-2">
                <div className="px-4 py-2 text-[12px] font-bold text-muted-foreground uppercase tracking-wider flex items-center gap-2">
                  Iniciar nueva conversación
                  {searchLoading && <Loader2 className="h-3 w-3 animate-spin" />}
                </div>
                {newDmCandidates.length > 0 && (
                  <div className="mb-2">
                    <div className="px-4 py-1 text-[12px] text-muted-foreground/70 uppercase">Usuarios</div>
                    {newDmCandidates.map((u) => (
                      <button
                        key={u.id}
                        type="button"
                        onClick={() => handleStartDmFromSearch(u)}
                        className="w-full flex items-center gap-3 px-4 py-2.5 hover:bg-accent/50 text-left"
                      >
                        <div className="h-8 w-8 rounded-[10px] flex items-center justify-center shrink-0 text-[13px] font-bold bg-tint-teal text-tint-teal-fg">
                          {u.name.charAt(0).toUpperCase()}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="text-sm truncate">{u.name}</div>
                          <div className="text-[12px] text-muted-foreground/70 truncate">{u.email}</div>
                        </div>
                        <Plus className="h-4 w-4 text-muted-foreground shrink-0" />
                      </button>
                    ))}
                  </div>
                )}
                {newExternalCandidates.length > 0 && (
                  <div>
                    <div className="px-4 py-1 text-[12px] text-muted-foreground/70 uppercase">Cuentas CRM (sin chat)</div>
                    {newExternalCandidates.map((a) => (
                      <button
                        key={a.id}
                        type="button"
                        onClick={() => handleStartExternalFromSearch(a)}
                        className="w-full flex items-center gap-3 px-4 py-2.5 hover:bg-accent/50 text-left"
                      >
                        <div
                          className={cn(
                            "h-8 w-8 rounded-[10px] flex items-center justify-center shrink-0 text-[13px] font-bold",
                            a.status === "prospect"
                              ? "bg-tint-emerald text-tint-emerald-fg"
                              : "bg-tint-sky text-tint-sky-fg",
                          )}
                        >
                          {a.name.charAt(0).toUpperCase()}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="text-sm truncate">{a.name}</div>
                          <div className="text-[12px] text-muted-foreground/70 truncate capitalize">{a.status.replace(/_/g, " ")}</div>
                        </div>
                        <Plus className="h-4 w-4 text-muted-foreground shrink-0" />
                      </button>
                    ))}
                  </div>
                )}
              </div>
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
          className="hidden xl:block fixed inset-0 z-30"
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
              "fixed inset-0 z-50 bg-black/40 xl:hidden transition-opacity duration-300",
              panelEntered && !panelClosing ? "opacity-100" : "opacity-0"
            )}
            onClick={handleClosePanel}
            aria-hidden="true"
          />
          <div
            className={cn(
              "fixed z-50 xl:hidden flex flex-col bg-[hsl(var(--ds-surface-1))] opai-chat-mobile-shell transition-transform duration-300 ease-out",
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
            {/* Mobile/tablet header (channel list only — conversation has its own via ChatPresenceBar) */}
            {!selectedChannel && (
              <div
                className={cn(
                  "shrink-0 flex flex-col border-b border-ds-border-subtle opai-chat-mobile-topbar",
                  isIOS ? "bg-transparent" : "bg-[hsl(var(--ds-surface-2))]",
                )}
                {...swipeClose}
              >
                <div className="flex justify-center pt-2 pb-1">
                  <div className="w-10 h-1 rounded-full bg-ds-text-4/40" aria-hidden />
                </div>
                <div className="flex items-center justify-between h-12 px-4 pb-2 gap-1">
                  <div className="flex items-center gap-2 min-w-0">
                    <MessageCircle className="h-4 w-4 text-status-info-fg shrink-0" />
                    <h3 className="text-sm font-semibold text-ds-text-1">Chat</h3>
                    {ctx.totalUnread > 0 && (
                      <span className="inline-flex h-5 min-w-[20px] items-center justify-center rounded-full bg-status-info px-1.5 text-[12px] font-bold text-primary-foreground">
                        {ctx.totalUnread > 99 ? "99+" : ctx.totalUnread}
                      </span>
                    )}
                  </div>
                  <div className="flex items-center shrink-0">
                    <button type="button" onClick={() => setShowNewDm(true)} className="p-2 text-ds-text-3 hover:text-ds-text-1" aria-label="Nueva conversación">
                      <Plus className="h-5 w-5" />
                    </button>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <button type="button" className="p-2 text-ds-text-3 hover:text-ds-text-1" aria-label="Más opciones del chat">
                          <MoreHorizontal className="h-5 w-5" />
                        </button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end" className="z-[70] w-56">
                        <DropdownMenuItem
                          disabled={ctx.markAllChannelsAsReadLoading || ctx.totalUnread === 0}
                          onClick={() => ctx.markAllChannelsAsRead()}
                        >
                          <CheckCheck className="mr-2 h-4 w-4" />
                          Marcar todo como leído
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={() => setShowInactiveExternal((v) => !v)}>
                          <Archive className="mr-2 h-4 w-4" />
                          {showInactiveExternal ? "Ocultar canales inactivos" : "Mostrar canales inactivos"}
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          onClick={() => {
                            setCollapsedSections((prev) => ({ ...prev, archived: false }));
                            ctx.fetchArchivedChannels();
                          }}
                        >
                          <ArchiveRestore className="mr-2 h-4 w-4" />
                          Ver archivados
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                    <button type="button" onClick={handleClosePanel} className="p-2 text-ds-text-3 hover:text-ds-text-1" aria-label="Cerrar panel">
                      <X className="h-5 w-5" />
                    </button>
                  </div>
                </div>
              </div>
            )}

            {/* Mobile content area */}
            <div className="relative flex-1 min-h-0 overflow-hidden">
              {/* Channel list layer */}
              <div className={cn(
                "absolute inset-0 flex flex-col opai-chat-mobile-shell",
                isIOS ? "bg-transparent" : "bg-[hsl(var(--ds-surface-1))]",
                selectedChannel ? "hidden" : "flex"
              )}>
                {channelListContent}
              </div>

              {/* Conversation layer (slides in from right) — swipe right para volver */}
              <div
                ref={swipeBackRef}
                className={cn(
                  "absolute inset-0 flex flex-col opai-chat-mobile-shell transition-transform duration-[250ms] ease-out",
                  isIOS ? "bg-transparent" : "bg-[hsl(var(--ds-surface-1))]",
                  selectedChannel ? "translate-x-0" : "translate-x-full",
                )}
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
                    onChannelSummaryChanged={ctx.updateChannelSummary}
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
          "hidden xl:flex fixed top-0 right-0 h-full w-[400px] z-40 flex-col",
          isIOS
            ? "opai-ios-surface-sheet-side"
            : "bg-[hsl(var(--ds-surface-1))] border-l border-ds-border-default shadow-xl",
          "transition-transform duration-300 ease-out",
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
              onChannelSummaryChanged={ctx.updateChannelSummary}
            />
          </div>
        ) : (
          /* ── Desktop channel list view ── */
          <>
            {/* Desktop header */}
            <div
              className={cn(
                "flex items-center gap-2 px-4 h-[54px] border-b border-ds-border-subtle shrink-0",
                isIOS ? "bg-transparent" : "bg-[hsl(var(--ds-surface-2))]",
              )}
            >
              <MessageCircle className="h-4 w-4 text-status-info-fg shrink-0" />
              <div className="flex-1 min-w-0 flex items-center gap-2">
                <h2 className="text-sm font-semibold truncate">Chat</h2>
                {ctx.totalUnread > 0 && (
                  <span className="inline-flex h-5 min-w-[20px] items-center justify-center rounded-full bg-status-info px-1.5 text-[12px] font-bold text-primary-foreground">
                    {ctx.totalUnread > 99 ? "99+" : ctx.totalUnread}
                  </span>
                )}
              </div>
              <Button
                variant="ghost"
                size="icon"
                className="h-9 w-9 shrink-0"
                onClick={() => setShowNewDm(true)}
                aria-label="Nueva conversación"
              >
                <Plus className="h-4 w-4" />
              </Button>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" size="icon" className="h-9 w-9 shrink-0" aria-label="Más opciones del chat">
                    <MoreHorizontal className="h-4 w-4" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="z-[70] w-56">
                  <DropdownMenuItem
                    disabled={ctx.markAllChannelsAsReadLoading || ctx.totalUnread === 0}
                    onClick={() => ctx.markAllChannelsAsRead()}
                  >
                    <CheckCheck className="mr-2 h-4 w-4" />
                    Marcar todo como leído
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => setShowInactiveExternal((v) => !v)}>
                    <Archive className="mr-2 h-4 w-4" />
                    {showInactiveExternal ? "Ocultar canales inactivos" : "Mostrar canales inactivos"}
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    onClick={() => {
                      setCollapsedSections((prev) => ({ ...prev, archived: false }));
                      ctx.fetchArchivedChannels();
                    }}
                  >
                    <ArchiveRestore className="mr-2 h-4 w-4" />
                    Ver archivados
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
              <Button
                variant="ghost"
                size="icon"
                className="h-9 w-9 shrink-0"
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

      <ConfirmDialog
        open={!!cleanupTarget}
        onOpenChange={(open) => { if (!open && !cleanupLoading) setCleanupTarget(null); }}
        title="¿Eliminar canales sin actividad?"
        description={`Esta acción eliminará permanentemente todos los canales de ${
          cleanupTarget === "prospects" ? "prospectos" : "clientes"
        } que no tienen mensajes. Las cuentas y contactos CRM no se verán afectados.`}
        confirmLabel={cleanupLoading ? "Eliminando..." : "Eliminar canales sin actividad"}
        onConfirm={handleCleanupInactive}
        variant="destructive"
      />

      <NewExternalChatModal
        open={newChatModal.open}
        defaultStatus={newChatModal.defaultStatus}
        defaultAccountId={newChatModal.defaultAccountId}
        onClose={() => setNewChatModal({ open: false })}
        onCreated={(channelId) => {
          ctx.refreshChannels();
          ctx.selectChannel(channelId);
        }}
      />

      {showNewDm && (
        <ChatNewDmModal
          onClose={() => setShowNewDm(false)}
          onSelectDm={(channelId) => {
            setShowNewDm(false);
            ctx.refreshChannels();
            ctx.selectChannel(channelId);
          }}
        />
      )}
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
      const color = first?.group?.color ?? "";
      result.push({ key: gid, label, color, channels });
    });
    if (noGroup.length > 0) {
      result.push({ key: "_none", label: "Otros", color: "", channels: noGroup });
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

  // Collapse state per subgroup. Subgroups with >5 channels are collapsed by default.
  const [subgroupCollapsed, setSubgroupCollapsed] = useState<Record<string, boolean>>({});
  useEffect(() => {
    setSubgroupCollapsed((prev) => {
      const next = { ...prev };
      for (const g of groups) {
        if (next[g.key] === undefined) {
          next[g.key] = g.channels.length > 5;
        }
      }
      return next;
    });
  }, [groups]);

  const toggleSubgroup = useCallback((key: string) => {
    setSubgroupCollapsed((prev) => ({ ...prev, [key]: !prev[key] }));
  }, []);

  return (
    <div className="opai-chat-mobile-section">
      <div
        className="sticky top-0 z-10 flex items-center w-full group/section gap-1 h-[30px] px-2 opai-chat-mobile-section-header cursor-pointer bg-[hsl(var(--ds-surface-1)/0.92)] backdrop-blur-md border-b border-ds-border-subtle"
        onClick={onToggle}
        aria-expanded={!collapsed}
      >
        <button
          type="button"
          onClick={(e) => { e.stopPropagation(); onToggle(); }}
          className="flex-1 min-w-0 flex items-center gap-2 px-0 py-0 text-xs font-semibold text-muted-foreground uppercase tracking-wider transition-colors text-left"
        >
          {collapsed ? (
            <ChevronRight className="h-3 w-3 shrink-0" />
          ) : (
            <ChevronDown className="h-3 w-3 shrink-0" />
          )}
          <Users className="h-3.5 w-3.5 text-status-warn-fg shrink-0" />
          <span className="text-[13px] font-semibold text-ds-text-2 normal-case tracking-normal">Grupos</span>
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
          <span className="w-5 text-right text-[12px] font-normal tabular-nums text-muted-foreground/70">
            {groupChannels.length}
          </span>
          {sectionUnread > 0 ? (
            <span className="flex h-4 min-w-[18px] items-center justify-center rounded-full bg-status-info px-1.5 text-[12px] font-bold text-white">
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
                  className="hidden lg:flex h-6 w-6 shrink-0 items-center justify-center rounded text-muted-foreground hover:bg-accent hover:text-foreground opacity-0 group-hover/section:opacity-100 transition-opacity"
                  onClick={(e) => e.stopPropagation()}
                  aria-label="Notificaciones de la sección Grupos"
                >
                  <MoreHorizontal className="h-3.5 w-3.5" />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="z-[70] w-52">
                <div className="px-2 py-1.5 text-[12px] font-medium text-muted-foreground uppercase tracking-wider">
                  Notificaciones para todos los grupos ({groupChannels.length} canales)
                </div>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={() => onApplySectionNotifPref!(groupChannels.map((c) => c.id), "ALL")}>
                  <Bell className="h-3.5 w-3.5 mr-2" />
                  Notificar todo
                  {sectionPref === "ALL" && <span className="ml-auto text-status-info-fg text-xs">✓</span>}
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => onApplySectionNotifPref!(groupChannels.map((c) => c.id), "MENTIONS_ONLY")}>
                  <AtSign className="h-3.5 w-3.5 mr-2" />
                  Solo menciones
                  {sectionPref === "MENTIONS_ONLY" && <span className="ml-auto text-status-info-fg text-xs">✓</span>}
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => onApplySectionNotifPref!(groupChannels.map((c) => c.id), "MUTED")}>
                  <BellOff className="h-3.5 w-3.5 mr-2" />
                  Silenciar
                  {sectionPref === "MUTED" && <span className="ml-auto text-status-info-fg text-xs">✓</span>}
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          )}
        </div>
      </div>
      {!collapsed && (
        <div className="divide-y divide-border/20 opai-chat-mobile-channel-stack opai-chat-mobile-section-body">
          {groups.map((grp) => {
            const isCollapsible = grp.channels.length > 5;
            const isSingle = grp.channels.length === 1;
            const isCollapsed = isCollapsible && (subgroupCollapsed[grp.key] ?? true);
            const subUnread = grp.channels.reduce((s, c) => s + (c.notificationPreference === "ALL" ? c.unreadCount : 0), 0);
            return (
            <div key={grp.key}>
              <div
                className={cn(
                  "flex items-center group/sub",
                  (isCollapsible || isSingle) && "cursor-pointer hover:bg-accent/30"
                )}
                onClick={() => {
                  if (isSingle) onSelectChannel(grp.channels[0].id);
                  else if (isCollapsible) toggleSubgroup(grp.key);
                }}
              >
                <div className="flex-1 flex items-center gap-2 px-4 py-2 pl-6 text-[12px] font-medium text-muted-foreground/80">
                  <div
                    className="h-2.5 w-2.5 rounded-full shrink-0 ring-1 ring-border/40"
                    style={{ backgroundColor: grp.color }}
                  />
                  <span className="capitalize truncate">{grp.label}</span>
                  <span className="text-[12px] text-muted-foreground/60 tabular-nums">({grp.channels.length})</span>
                  {subUnread > 0 && (
                    <span className="flex h-4 min-w-[16px] items-center justify-center rounded-full bg-status-info px-1 text-[12px] font-bold text-white">
                      {subUnread > 99 ? "99+" : subUnread}
                    </span>
                  )}
                  {isCollapsible && (
                    isCollapsed
                      ? <ChevronRight className="h-3 w-3 text-muted-foreground ml-auto" />
                      : <ChevronDown className="h-3 w-3 text-muted-foreground ml-auto" />
                  )}
                </div>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <button
                      type="button"
                      className="hidden lg:flex opacity-0 group-hover/sub:opacity-100 mr-2 h-6 w-6 shrink-0 items-center justify-center rounded text-muted-foreground hover:text-foreground"
                      onClick={(e) => e.stopPropagation()}
                      aria-label="Notificaciones del grupo"
                    >
                      <MoreHorizontal className="h-3.5 w-3.5" />
                    </button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="z-[70] w-52">
                    <div className="px-2 py-1.5 text-[12px] font-medium text-muted-foreground uppercase tracking-wider">
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
              {!isCollapsed && !isSingle && (
                <div className="opai-chat-mobile-channel-stack opai-chat-mobile-section-body px-1">
                  {grp.channels.map((ch) => (
                    <ChatChannelListItem
                      key={ch.id}
                      channel={asChannelData(ch)}
                      isSelected={false}
                      unreadCount={ch.notificationPreference === "MUTED" ? 0 : ch.unreadCount}
                      notifPreference={ch.notificationPreference}
                      ambiguous={ambiguousIds(grp.channels, getDisplayName).has(ch.id)}
                      onClick={() => onSelectChannel(ch.id)}
                      onMarkAsRead={onMarkAsRead ? () => onMarkAsRead(ch.id) : undefined}
                      onChangeNotifPreference={onUpdateNotifPref ? (pref) => onUpdateNotifPref(ch.id, pref) : undefined}
                    />
                  ))}
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
  emptyHint,
  subtitle,
  extraHeaderActions,
  slack,
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
  slack?: SlackBridgeCtl;
  onDelete?: (channelId: string) => void;
  isArchivedSection?: boolean;
  onNewChat?: () => void;
  onMarkAsRead?: (channelId: string) => void;
  onUpdateNotifPref?: (channelId: string, pref: NotifPreference) => void;
  onApplySectionNotifPref?: (channelIds: string[], preference: NotifPreference) => Promise<void>;
  emptyHint?: string;
  subtitle?: React.ReactNode;
  extraHeaderActions?: React.ReactNode;
}) {
  const sectionUnread = channels.reduce((sum, ch) => sum + (ch.notificationPreference === 'ALL' ? ch.unreadCount : 0), 0);
  const sectionPref = sectionNotifMode(channels);
  const showSectionNotifMenu = onApplySectionNotifPref && !isArchivedSection && channels.length > 0;
  const [slackFor, setSlackFor] = useState<{ channel: ChatSidePanelChannel; mode: "connect" | "disconnect" } | null>(null);
  const ambiguous = ambiguousIds(channels, getDisplayName);

  return (
    <div className="opai-chat-mobile-section">
      <div
        className="sticky top-0 z-10 flex items-center w-full group/section gap-1 h-[30px] px-2 opai-chat-mobile-section-header cursor-pointer bg-[hsl(var(--ds-surface-1)/0.92)] backdrop-blur-md border-b border-ds-border-subtle"
        onClick={onToggle}
      >
        <button
          type="button"
          onClick={(e) => { e.stopPropagation(); onToggle(); }}
          className="flex-1 min-w-0 flex items-center gap-2 px-0 py-0 text-xs font-semibold text-muted-foreground uppercase tracking-wider transition-colors text-left"
        >
          {collapsed ? (
            <ChevronRight className="h-3 w-3 shrink-0" />
          ) : (
            <ChevronDown className="h-3 w-3 shrink-0" />
          )}
          {icon}
          <span className="text-[13px] font-semibold text-ds-text-2 normal-case tracking-normal">{label}</span>
          <span className="text-[12px] font-normal tabular-nums text-ds-text-4">
            {channels.length}
          </span>
          {sectionUnread > 0 && (
            <span className="flex h-5 min-w-[18px] items-center justify-center rounded-full bg-status-info px-1.5 text-[12px] font-bold text-primary-foreground">
              {sectionUnread > 99 ? "99+" : sectionUnread}
            </span>
          )}
          {subtitle && (
            <span className="text-[12px] font-normal text-ds-text-4 normal-case tracking-normal ml-1 min-w-0 truncate">
              {subtitle}
            </span>
          )}
        </button>
        <div className="flex shrink-0 items-center gap-1 pr-1">
          {showSectionNotifMenu && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button
                  type="button"
                  className="hidden lg:flex h-7 w-7 shrink-0 items-center justify-center rounded text-ds-text-3 hover:bg-ds-surface-3 hover:text-ds-text-1 opacity-0 group-hover/section:opacity-100 transition-opacity"
                  onClick={(e) => e.stopPropagation()}
                  aria-label="Notificaciones de la sección"
                  aria-expanded={!collapsed}
                >
                  <MoreHorizontal className="h-3.5 w-3.5" />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="z-[70] w-52">
                <div className="px-2 py-1.5 text-[12px] font-medium text-muted-foreground uppercase tracking-wider">
                  Notificaciones para {channels.length} canal{channels.length !== 1 ? "es" : ""}
                </div>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={() => onApplySectionNotifPref!(channels.map((c) => c.id), "ALL")}>
                  <Bell className="h-3.5 w-3.5 mr-2" />
                  Notificar todo
                  {sectionPref === "ALL" && <span className="ml-auto text-status-info-fg text-xs">✓</span>}
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => onApplySectionNotifPref!(channels.map((c) => c.id), "MENTIONS_ONLY")}>
                  <AtSign className="h-3.5 w-3.5 mr-2" />
                  Solo menciones
                  {sectionPref === "MENTIONS_ONLY" && <span className="ml-auto text-status-info-fg text-xs">✓</span>}
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => onApplySectionNotifPref!(channels.map((c) => c.id), "MUTED")}>
                  <BellOff className="h-3.5 w-3.5 mr-2" />
                  Silenciar
                  {sectionPref === "MUTED" && <span className="ml-auto text-status-info-fg text-xs">✓</span>}
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          )}
          {extraHeaderActions}
          {onNewChat && (
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); onNewChat(); }}
              className="h-7 w-7 flex shrink-0 items-center justify-center rounded text-ds-text-3 hover:bg-ds-surface-3 hover:text-ds-text-1 opacity-0 group-hover/section:opacity-100 transition-opacity"
              aria-label="Nuevo chat"
            >
              <Plus className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
      </div>
      {!collapsed && channels.length === 0 && emptyHint && (
        <div className="px-4 py-3 text-[12px] text-muted-foreground/60 opai-chat-mobile-section-body">
          {emptyHint}
        </div>
      )}
      {!collapsed && channels.length > 0 && (
        <div className="opai-chat-mobile-channel-stack opai-chat-mobile-section-body px-1">
          {channels.map((ch) => {
            const slackBridge = slack?.bridges[ch.id] ?? null;
            const canSlack = Boolean(slack?.enabled) && ch.channelType !== "DIRECT";
            return (
              <ChatChannelListItem
                key={ch.id}
                channel={asChannelData(ch)}
                isSelected={false}
                unreadCount={ch.notificationPreference === "MUTED" ? 0 : ch.unreadCount}
                notifPreference={ch.notificationPreference}
                ambiguous={ambiguous.has(ch.id)}
                onClick={() => onSelectChannel(ch.id)}
                onArchive={!isArchivedSection && onArchive ? () => onArchive(ch.id) : undefined}
                onUnarchive={isArchivedSection && onUnarchive ? () => onUnarchive(ch.id) : undefined}
                onDelete={canDelete && onDelete ? () => onDelete(ch.id) : undefined}
                canDelete={Boolean(canDelete && onDelete)}
                isArchived={isArchivedSection}
                onMarkAsRead={onMarkAsRead ? () => onMarkAsRead(ch.id) : undefined}
                onChangeNotifPreference={onUpdateNotifPref ? (pref) => onUpdateNotifPref(ch.id, pref) : undefined}
                canManageSlack={canSlack}
                slackBridgeName={slackBridge?.slackChannelName ?? null}
                onSlackConnect={() => setSlackFor({ channel: ch, mode: "connect" })}
                onSlackDisconnect={() => setSlackFor({ channel: ch, mode: "disconnect" })}
              />
            );
          })}
        </div>
      )}
      {slack && slackFor && (
        <ChatChannelSlackBridge
          open
          mode={slackFor.mode}
          chatChannelId={slackFor.channel.id}
          channelName={getDisplayName(slackFor.channel)}
          bridge={slack.bridges[slackFor.channel.id] ?? null}
          onClose={() => setSlackFor(null)}
          onChanged={() => { slack.refresh(); setSlackFor(null); }}
        />
      )}
    </div>
  );
}

/* ─── Cleanup section button (dropdown) ─── */

function CleanupSectionButton({ onCleanup }: { onCleanup: () => void }) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          className="h-6 w-6 flex shrink-0 items-center justify-center rounded text-muted-foreground hover:bg-accent hover:text-foreground"
          onClick={(e) => e.stopPropagation()}
          aria-label="Más acciones de la sección"
        >
          <MoreHorizontal className="h-3.5 w-3.5" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="z-[70] w-52">
        <DropdownMenuItem
          className="text-destructive focus:text-destructive"
          onClick={(e) => { e.stopPropagation(); onCleanup(); }}
        >
          <Trash2 className="mr-2 h-3.5 w-3.5" />
          Limpiar inactivos
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

