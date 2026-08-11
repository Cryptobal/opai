"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Bell, ChevronUp, LogOut, User } from "lucide-react";
import { Avatar, Tag } from "@/components/opai-ds";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useNotifications } from "@/contexts/NotificationContext";
import { cn } from "@/lib/utils";
import { ThemeToggle } from "./ThemeToggle";
import { SignOutDialog } from "./SignOutDialog";

export type SidebarUserMenuProps = {
  userName?: string;
  userEmail?: string;
  userRole?: string;
  /** URL pública de la foto de perfil del Admin (R2). */
  userPhotoUrl?: string | null;
  collapsed?: boolean;
  onNavigate?: () => void;
  tenantName?: string;
  notificationsCount?: number;
};

export function SidebarUserMenu({
  userName,
  userEmail,
  userRole,
  userPhotoUrl,
  collapsed = false,
  onNavigate,
  tenantName,
  notificationsCount,
}: SidebarUserMenuProps) {
  const [open, setOpen] = useState(false);
  const [showSignOut, setShowSignOut] = useState(false);
  const { unreadCount } = useNotifications();
  const notifCount = notificationsCount ?? unreadCount;

  const displayName = userName || userEmail || "Usuario";
  const secondary = userRole
    ? tenantName
      ? `${userRole} · ${tenantName}`
      : userRole
    : userEmail || "";

  // Al colapsar/expandir, cerrar para no dejar el popover desanclado.
  useEffect(() => {
    setOpen(false);
  }, [collapsed]);

  if (!userName && !userEmail) return null;

  return (
    <>
      <DropdownMenu open={open} onOpenChange={setOpen}>
        <DropdownMenuTrigger asChild>
          <button
            type="button"
            title={collapsed ? displayName : undefined}
            aria-label="Menú de usuario"
            aria-expanded={open}
            className={cn(
              "flex w-full rounded-md transition-colors hover:bg-accent focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-primary",
              collapsed
                ? "justify-center p-2 mb-1"
                : "items-center gap-2.5 px-2 py-1.5 mb-2 min-h-11",
            )}
          >
            <Avatar name={displayName} photoUrl={userPhotoUrl} size="sm" />
            {!collapsed && (
              <>
                <span className="min-w-0 flex-1 text-left">
                  <span className="block truncate text-xs font-medium text-foreground" title={displayName}>
                    {displayName}
                  </span>
                  {secondary && (
                    <span className="block truncate text-xs text-muted-foreground">{secondary}</span>
                  )}
                </span>
                <ChevronUp
                  className={cn(
                    "h-3.5 w-3.5 shrink-0 text-muted-foreground transition-transform",
                    open ? "rotate-0" : "rotate-180",
                  )}
                />
              </>
            )}
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent
          side={collapsed ? "right" : "top"}
          align={collapsed ? "end" : "start"}
          sideOffset={8}
          collisionPadding={12}
          className="w-64"
        >
          <div className="flex items-start gap-3 px-2 py-2">
            <Avatar name={displayName} photoUrl={userPhotoUrl} size="md" />
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium text-foreground">{displayName}</p>
              {userEmail && (
                <p className="truncate text-[12px] text-ds-text-3">{userEmail}</p>
              )}
              {userRole && (
                <Tag variant="neutral" size="sm" className="mt-1.5">
                  {userRole}
                </Tag>
              )}
            </div>
          </div>
          <DropdownMenuSeparator />
          <DropdownMenuItem asChild>
            <Link
              href="/opai/perfil"
              className="cursor-pointer"
              onClick={() => {
                setOpen(false);
                onNavigate?.();
              }}
            >
              <User className="mr-2 h-4 w-4" />
              Mi perfil
            </Link>
          </DropdownMenuItem>
          <DropdownMenuItem asChild>
            <Link
              href="/opai/perfil/notificaciones"
              className="cursor-pointer"
              onClick={() => {
                setOpen(false);
                onNavigate?.();
              }}
            >
              <Bell className="mr-2 h-4 w-4" />
              <span className="flex-1">Mis notificaciones</span>
              {notifCount > 0 && (
                <span className="ml-2 rounded-full bg-status-danger px-1.5 text-[12px] font-medium text-primary-foreground tabular-nums">
                  {notifCount > 9 ? "9+" : notifCount}
                </span>
              )}
            </Link>
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <div
            className="flex items-center justify-between gap-2 px-2 py-1.5"
            onPointerDown={(e) => e.preventDefault()}
          >
            <span className="text-sm text-foreground">Tema</span>
            <ThemeToggle compact />
          </div>
          <DropdownMenuSeparator />
          <DropdownMenuItem
            className="cursor-pointer text-destructive focus:text-destructive"
            onSelect={(e) => {
              e.preventDefault();
              setOpen(false);
              setShowSignOut(true);
            }}
          >
            <LogOut className="mr-2 h-4 w-4" />
            Cerrar sesión
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      <SignOutDialog open={showSignOut} onOpenChange={setShowSignOut} />
    </>
  );
}
