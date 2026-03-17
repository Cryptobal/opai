"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { signOut } from "next-auth/react";
import { Bell, LogOut, Settings, User } from "lucide-react";
import { MessageCircle } from "lucide-react";
import { useChatSidePanelContext } from "@/components/chat/ChatFloatingProvider";
import { NotificationPopover } from "./NotificationPopover";
import { ThemeToggle } from "./ThemeToggle";
import { RoleSwitcher } from "@/components/navbar/RoleSwitcher";
import { Avatar } from "./Avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import { FiscalizacionDTButton } from "./FiscalizacionDTButton";

interface TopbarActionsProps {
  userName?: string;
  userEmail?: string;
  userRole?: string;
  className?: string;
}

export function TopbarActions({
  userName = "Usuario",
  userEmail,
  userRole,
  className,
}: TopbarActionsProps) {
  const [mounted, setMounted] = useState(false);
  const chatCtx = useChatSidePanelContext();
  useEffect(() => setMounted(true), []);

  return (
    <div className={cn("flex items-center gap-2 w-full", className)}>
      {/* Role Switcher (solo owner/admin) */}
      <RoleSwitcher />

      {/* Botón Fiscalización DT — Resolución N°38 */}
      <FiscalizacionDTButton userRole={userRole} />

      {/* Spacer */}
      <div className="flex-1" />

      {/* Right icons: Theme → Chat → Notifications → Settings */}
      <ThemeToggle />
      <button
        type="button"
        className="relative inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
        onClick={chatCtx.togglePanel}
        aria-label="Abrir chat"
      >
        <MessageCircle className="h-4 w-4" />
        {chatCtx.totalUnread > 0 && (
          <span className="absolute -right-0.5 -top-0.5 h-2.5 w-2.5 rounded-full bg-red-500 ring-2 ring-background" />
        )}
      </button>
      <NotificationPopover />
      <Link
        href="/opai/configuracion"
        className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
        aria-label="Configuración"
      >
        <Settings className="h-4 w-4" />
      </Link>

      {/* Avatar + User Menu */}
      {!mounted ? (
        <button
          type="button"
          className="flex items-center gap-2 rounded-lg px-2 py-1.5 transition-colors"
          aria-label="Menú de usuario"
        >
          <Avatar name={userName} size="sm" />
          <span className="hidden xl:inline text-sm font-medium truncate max-w-[120px]">
            {userName}
          </span>
        </button>
      ) : (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              type="button"
              className="flex items-center gap-2 rounded-lg px-2 py-1.5 transition-colors hover:bg-accent"
              aria-label="Menú de usuario"
            >
              <Avatar name={userName} size="sm" />
              <span className="hidden xl:inline text-sm font-medium truncate max-w-[120px]">
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
                  <p className="text-xs text-muted-foreground truncate">{userEmail}</p>
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
