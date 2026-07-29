"use client";

import { useEffect, useRef, useState } from "react";
import { Bell, MessageCircle, Search } from "lucide-react";
import { useChatSidePanelContext } from "@/components/chat/ChatFloatingProvider";
import { useNotificationSidePanelContext } from "@/components/notifications/NotificationSidePanelContext";
import { useNotifications } from "@/contexts/NotificationContext";
import {
  useIslandSearchOpenListener,
  useModuleSurface,
} from "@/components/opai-ds";
import { Badge } from "@/components/ui/badge";
import { TopbarIconButton } from "./TopbarIconButton";
import { RoleSwitcher } from "@/components/navbar/RoleSwitcher";
import { ModuleSearchOverlay } from "./ModuleSearchOverlay";
import { cn } from "@/lib/utils";
import { FiscalizacionDTButton } from "./FiscalizacionDTButton";

interface TopbarActionsProps {
  userRole?: string;
  onSearch?: () => void;
  className?: string;
}

/**
 * Acciones globales del topbar: rol, fiscalización, buscar, chat y campana.
 * Identidad, tema y configuración viven en SidebarUserMenu.
 */
export function TopbarActions({
  userRole,
  onSearch,
  className,
}: TopbarActionsProps) {
  const chatCtx = useChatSidePanelContext();
  const notifCtx = useNotificationSidePanelContext();
  const { unreadCount: notifUnreadCount } = useNotifications();
  const { search } = useModuleSurface();
  const [moduleSearchOpen, setModuleSearchOpen] = useState(false);
  const searchBtnWrapRef = useRef<HTMLDivElement | null>(null);
  const hasModuleSearch = search !== null;
  const activeQuery = search?.value.trim() ?? "";

  useIslandSearchOpenListener(() => {
    if (hasModuleSearch) setModuleSearchOpen(true);
  });

  useEffect(() => {
    if (!hasModuleSearch) setModuleSearchOpen(false);
  }, [hasModuleSearch]);

  const handleToggleChat = () => {
    if (!chatCtx.isPanelOpen) notifCtx.closePanel();
    chatCtx.togglePanel();
  };
  const handleToggleNotifications = () => {
    if (!notifCtx.isPanelOpen) chatCtx.closePanel();
    notifCtx.togglePanel();
  };

  const searchLabel = hasModuleSearch
    ? activeQuery
      ? `Buscar en el módulo — filtro activo: ${activeQuery}`
      : "Buscar en el módulo"
    : "Buscar";

  return (
    <div className={cn("flex items-center gap-2 shrink-0 min-w-0", className)}>
      <RoleSwitcher />

      <FiscalizacionDTButton userRole={userRole} />

      <div
        className="flex items-center gap-0.5 rounded-lg border border-ds-border-subtle/70 bg-ds-surface-1/40 p-0.5"
        role="group"
        aria-label="Acciones rápidas"
      >
        {onSearch && (
          <div ref={searchBtnWrapRef} className="contents">
            <TopbarIconButton
              icon={Search}
              label={searchLabel}
              className={cn(activeQuery && hasModuleSearch && "text-primary")}
              onClick={
                hasModuleSearch
                  ? () => setModuleSearchOpen(true)
                  : onSearch
              }
            >
              {hasModuleSearch && activeQuery ? (
                <span className="absolute right-1 top-1 h-2 w-2 rounded-full bg-primary ring-2 ring-background" />
              ) : null}
            </TopbarIconButton>
          </div>
        )}
        <TopbarIconButton
          icon={MessageCircle}
          label="Abrir chat"
          onClick={handleToggleChat}
        >
          {chatCtx.totalUnread > 0 && (
            <span className="absolute right-1 top-1 h-2 w-2 rounded-full bg-status-danger ring-2 ring-background" />
          )}
        </TopbarIconButton>
        <TopbarIconButton
          icon={Bell}
          label="Notificaciones"
          onClick={handleToggleNotifications}
        >
          {notifUnreadCount > 0 && (
            <Badge
              variant="destructive"
              className="absolute -right-0.5 -top-0.5 h-4 min-w-4 rounded-full px-1 text-[12px] leading-none flex items-center justify-center"
            >
              {notifUnreadCount > 9 ? "9+" : notifUnreadCount}
            </Badge>
          )}
        </TopbarIconButton>
      </div>

      {hasModuleSearch && search && moduleSearchOpen && (
        <ModuleSearchOverlay
          open
          onClose={() => setModuleSearchOpen(false)}
          search={search}
          returnFocusRef={searchBtnWrapRef}
        />
      )}
    </div>
  );
}
