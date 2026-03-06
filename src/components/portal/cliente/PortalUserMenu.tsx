"use client";

import { useEffect, useRef, useState } from "react";
import { Bell, ChevronDown, LogOut, Sun, Moon } from "lucide-react";
import { ClienteSession } from "@/lib/portal-cliente-types";
import { useTheme } from "@/components/opai/ThemeProvider";
import { cn } from "@/lib/utils";

interface Props {
  session: ClienteSession;
  onNotificaciones: () => void;
  onLogout: () => void;
}

export function PortalUserMenu({ session, onNotificaciones, onLogout }: Props) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const { theme, toggleTheme } = useTheme();

  // Cerrar al hacer clic fuera
  useEffect(() => {
    if (!open) return;
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [open]);

  const initials = `${session.firstName.charAt(0)}${session.lastName.charAt(0)}`.toUpperCase();
  const shortName = `${session.firstName} ${session.lastName.charAt(0)}.`;

  return (
    <div ref={ref} className="relative flex items-center gap-1">
      {/* Theme toggle button — always visible */}
      <button
        onClick={toggleTheme}
        className="h-8 w-8 flex items-center justify-center rounded-lg hover:bg-black/5 dark:hover:bg-white/5 transition-colors"
        title={theme === "dark" ? "Modo día" : "Modo noche"}
      >
        {theme === "dark" ? (
          <Sun className="h-4 w-4 text-amber-400" />
        ) : (
          <Moon className="h-4 w-4 text-zinc-500" />
        )}
      </button>

      <button
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-1.5 h-8 px-2 rounded-lg hover:bg-black/5 dark:hover:bg-white/5 transition-colors"
      >
        <div className="h-6 w-6 rounded-full bg-teal-500/20 text-teal-400 text-[10px] font-semibold flex items-center justify-center shrink-0">
          {initials}
        </div>
        <span className="text-xs text-zinc-600 dark:text-zinc-300 max-w-[90px] truncate hidden sm:block">{shortName}</span>
        <ChevronDown className={cn("h-3.5 w-3.5 text-zinc-500 transition-transform", open && "rotate-180")} />
      </button>

      {open && (
        <div className="absolute right-0 top-10 bg-white dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-xl shadow-xl py-1.5 min-w-[180px] z-50">
          <button
            onClick={() => { setOpen(false); onNotificaciones(); }}
            className="flex items-center gap-3 w-full px-4 py-2.5 text-sm text-zinc-700 dark:text-zinc-200 hover:bg-zinc-100 dark:hover:bg-zinc-700 transition-colors"
          >
            <Bell className="h-4 w-4 text-zinc-400" />
            Notificaciones
          </button>
          <div className="my-1 border-t border-zinc-200 dark:border-zinc-700" />
          <button
            onClick={() => { setOpen(false); onLogout(); }}
            className="flex items-center gap-3 w-full px-4 py-2.5 text-sm text-red-500 dark:text-red-400 hover:bg-zinc-100 dark:hover:bg-zinc-700 transition-colors"
          >
            <LogOut className="h-4 w-4" />
            Salir
          </button>
        </div>
      )}
    </div>
  );
}
