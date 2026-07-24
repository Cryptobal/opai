"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { signOut } from "next-auth/react";
import { Bell, LogOut, MessageCircle, Search, Settings, User } from "lucide-react";
import { useChatSidePanelContext } from "@/components/chat/ChatFloatingProvider";
import { useNotificationSidePanelContext } from "@/components/notifications/NotificationSidePanelContext";
import { useNotifications } from "@/contexts/NotificationContext";
import { Badge } from "@/components/ui/badge";
import { ThemeToggle } from "./ThemeToggle";
import { TopbarIconButton } from "./TopbarIconButton";
import { RoleSwitcher } from "@/components/navbar/RoleSwitcher";
import { Avatar } from "@/components/opai-ds";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import { FiscalizacionDTButton } from "./FiscalizacionDTButton";
import { useHasModuleAccess } from "@/lib/permissions-context";

interface TopbarActionsProps {
  userName?: string;
  userEmail?: string;
  userRole?: string;
  onSearch?: () => void;
  className?: string;
}

export function TopbarActions({
  userName = "Usuario",
  userEmail,
  userRole,
  onSearch,
  className,
}: TopbarActionsProps) {
  const [mounted, setMounted] = useState(false);
  const chatCtx = useChatSidePanelContext();
  const notifCtx = useNotificationSidePanelContext();
  const { unreadCount: notifUnreadCount } = useNotifications();
  const hasConfigAccess = useHasModuleAccess("config");
  useEffect(() => setMounted(true), []);

  const handleToggleChat = () => {
    if (!chatCtx.isPanelOpen) notifCtx.closePanel();
    chatCtx.togglePanel();
  };
  const handleToggleNotifications = () => {
    if (!notifCtx.isPanelOpen) chatCtx.closePanel();
    notifCtx.togglePanel();
  };

  return (
    <div className={cn("flex items-center gap-2 shrink-0 min-w-0", className)}>
      <RoleSwitcher />

      <FiscalizacionDTButton userRole={userRole} />

      {/* Utilidades: mismo alto/alineación que el resto del topbar */}
      <div
        className="flex items-center gap-0.5 rounded-lg border border-ds-border-subtle/70 bg-ds-surface-1/40 p-0.5"
        role="group"
        aria-label="Acciones rápidas"
      >
        {onSearch && (
          <TopbarIconButton icon={Search} label="Buscar" onClick={onSearch} />
        )}
        <ThemeToggle compact />
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
        {hasConfigAccess && (
          <TopbarIconButton
            icon={Settings}
            label="Configuración"
            href="/opai/configuracion"
          />
        )}
      </div>

      {/* Menú de usuario — avatar compacto en lg, nombre solo en pantallas amplias */}
      {!mounted ? (
        <button
          type="button"
          className="inline-flex h-8 max-w-[9rem] items-center gap-2 rounded-lg px-1.5 transition-colors hover:bg-ds-surface-2"
          aria-label="Menú de usuario"
        >
          <Avatar name={userName} size="sm" />
          <span className="hidden 2xl:inline text-sm font-medium truncate">
            {userName}
          </span>
        </button>
      ) : (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              type="button"
              className="inline-flex h-8 max-w-[9rem] items-center gap-2 rounded-lg px-1.5 transition-colors hover:bg-ds-surface-2 focus-visible:outline-2 focus-visible:outline-primary focus-visible:outline-offset-1"
              aria-label="Menú de usuario"
            >
              <Avatar name={userName} size="sm" />
              <span className="hidden 2xl:inline text-sm font-medium truncate">
                {userName}
              </span>
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-56">
            <div className="flex items-center gap-2 px-2 py-1.5">
              <Avatar name={userName} size="sm" />
              <div className="flex flex-col min-w-0">
                <p className="text-sm font-medium truncate">{userName}</p>
                {userEmail && (
                  <p className="text-xs text-ds-text-3 truncate">{userEmail}</p>
                )}
              </div>
            </div>
            <DropdownMenuSeparator />
            <DropdownMenuItem asChild>
              <Link href="/opai/perfil" className="cursor-pointer">
                <User className="h-4 w-4 mr-2" />
                Mi perfil
              </Link>
            </DropdownMenuItem>
            <DropdownMenuItem asChild>
              <Link href="/opai/perfil/notificaciones" className="cursor-pointer">
                <Bell className="h-4 w-4 mr-2" />
                Mis notificaciones
              </Link>
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              onClick={() => signOut({ callbackUrl: '/opai/login' })}
              className="cursor-pointer text-destructive focus:text-destructive"
            >
              <LogOut className="h-4 w-4 mr-2" />
              Cerrar sesión
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      )}
    </div>
  );
}
