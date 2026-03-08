"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { signOut } from "next-auth/react";
import {
  Activity,
  Bell,
  Building2,
  Clock3,
  Contact,
  FileText,
  LogOut,
  Plus,
  Receipt,
  Settings,
  Shield,
  Ticket,
  TrendingUp,
  User,
  Users,
} from "lucide-react";
import { GlobalSearch } from "@/components/search/GlobalSearch";
import { ThemeToggle } from "./ThemeToggle";
import { RoleSwitcher } from "@/components/navbar/RoleSwitcher";
import { Avatar } from "./Avatar";
import { QuickCreateModal, type QuickCreateType } from "./QuickCreateModal";
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

const QUICK_CREATE_ITEMS: { label: string; type: QuickCreateType; icon: typeof TrendingUp; navigateHref?: string }[] = [
  { label: "Nuevo Lead", type: "lead", icon: TrendingUp },
  { label: "Nueva Cuenta", type: "account", icon: Building2 },
  { label: "Nuevo Contacto", type: "contact", icon: Contact },
  { label: "Nuevo Negocio", type: "deal", icon: Users },
  { label: "Nuevo Ticket", type: "ticket", icon: Ticket },
  { label: "Nueva Rendición", type: null, icon: Receipt, navigateHref: "/finanzas/rendiciones/nueva" },
  { label: "Nuevo Turno Extra", type: null, icon: Clock3, navigateHref: "/ops/turnos-extra?crear=te" },
  { label: "Nuevo Refuerzo", type: null, icon: Shield, navigateHref: "/ops/refuerzos?crear=refuerzo" },
  { label: "Nueva Persona", type: null, icon: Users, navigateHref: "/personas/guardias" },
  { label: "Nuevo Documento", type: null, icon: FileText, navigateHref: "/opai/documentos/nuevo" },
  { label: "Nueva Visita", type: null, icon: Activity, navigateHref: "/ops/supervision/nueva-visita" },
];

export function TopbarActions({
  userName = "Usuario",
  userEmail,
  userRole,
  className,
}: TopbarActionsProps) {
  const [mounted, setMounted] = useState(false);
  const [quickCreateType, setQuickCreateType] = useState<QuickCreateType>(null);
  const router = useRouter();
  useEffect(() => setMounted(true), []);

  return (
    <div className={cn("flex items-center gap-2 w-full", className)}>
      {/* Left: Search */}
      <GlobalSearch compact className="w-72" />

      {/* Quick Create "+" button */}
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button
            type="button"
            className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground transition-colors hover:bg-primary/90"
            aria-label="Crear nuevo"
          >
            <Plus className="h-4 w-4" />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="w-52">
          {QUICK_CREATE_ITEMS.map((item) => {
            const Icon = item.icon;
            return (
              <DropdownMenuItem
                key={item.label}
                onClick={() => {
                  if (item.navigateHref) {
                    router.push(item.navigateHref);
                  } else if (item.type) {
                    setQuickCreateType(item.type);
                  }
                }}
                className="cursor-pointer"
              >
                <Icon className="h-4 w-4 mr-2" />
                {item.label}
              </DropdownMenuItem>
            );
          })}
        </DropdownMenuContent>
      </DropdownMenu>

      {quickCreateType && (
        <QuickCreateModal
          type={quickCreateType}
          onClose={() => setQuickCreateType(null)}
        />
      )}

      {/* Role Switcher a la izquierda (solo owner/admin) */}
      <RoleSwitcher />

      {/* Spacer */}
      <div className="flex-1" />

      {/* Tema + Configuración juntos */}
      <ThemeToggle />
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
