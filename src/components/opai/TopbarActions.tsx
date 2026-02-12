"use client";

import Link from "next/link";
import { LogOut, Settings, User } from "lucide-react";
import { NotificationBell } from "./NotificationBell";
import { Avatar } from "./Avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";

interface TopbarActionsProps {
  userName?: string;
  userEmail?: string;
  userRole?: string;
  className?: string;
}

/**
 * TopbarActions — Acciones globales del usuario en topbar (estilo HubSpot/Salesforce).
 *
 * Muestra:
 * - Campana de notificaciones
 * - Avatar con dropdown: Perfil, Configuración, Cerrar sesión
 *
 * Patrón de apps de nivel mundial: notificaciones + usuario siempre en topbar derecho.
 */
export function TopbarActions({
  userName = "Usuario",
  userEmail,
  userRole,
  className,
}: TopbarActionsProps) {
  return (
    <div className={cn("flex items-center gap-2", className)}>
      {/* Campana de notificaciones */}
      <NotificationBell />

      {/* Avatar + User Menu */}
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
            <Link href="/opai/configuracion" className="cursor-pointer">
              <Settings className="h-4 w-4 mr-2" />
              Configuración
            </Link>
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem asChild>
            <Link
              href="/api/auth/signout?callbackUrl=/opai/login"
              className="cursor-pointer text-destructive focus:text-destructive"
            >
              <LogOut className="h-4 w-4 mr-2" />
              Cerrar sesión
            </Link>
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}
