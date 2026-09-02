"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation";
import {
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  LogOut,
  Menu,
  Plus,
  X,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Avatar } from "@/components/opai-ds";
import { Button } from "@/components/ui/button";
import {
  PLATFORM_NAV,
  isPlatformNavActive,
  type PlatformNavItem,
} from "@/lib/platform/nav";
import { PLATFORM_ROLE_LABEL, platformRoleTitle } from "@/lib/platform/roles";
import { usePlatformUi } from "./PlatformUiProvider";

const STORAGE_KEY = "opai-platform-nav";
const XL = 1280;

interface StoredNav {
  collapsed: boolean;
  toolsOpen: boolean;
}

function readStored(): StoredNav {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return JSON.parse(raw) as StoredNav;
  } catch {
    /* ignore */
  }
  return { collapsed: typeof window !== "undefined" ? window.innerWidth < XL : true, toolsOpen: true };
}

export function PlatformSidebar() {
  const pathname = usePathname();
  const { adminName, role, can, openCreateTenant } = usePlatformUi();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(true);
  const [toolsOpen, setToolsOpen] = useState(true);

  useEffect(() => {
    const stored = readStored();
    setCollapsed(stored.collapsed);
    setToolsOpen(stored.toolsOpen);
  }, []);

  useEffect(() => {
    setMobileOpen(false);
  }, [pathname]);

  const persist = (next: Partial<StoredNav>) => {
    const cur = { collapsed, toolsOpen, ...next };
    setCollapsed(cur.collapsed);
    setToolsOpen(cur.toolsOpen);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(cur));
  };

  const logout = async () => {
    await fetch("/api/platform/auth", { method: "DELETE" });
    window.location.href = "/platform/login";
  };

  const negocio = PLATFORM_NAV.filter((i) => i.group === "negocio");
  const herramientas = PLATFORM_NAV.filter((i) => i.group === "herramientas");

  const renderItem = (item: PlatformNavItem, expanded: boolean) => {
    const active = isPlatformNavActive(pathname, item);
    const locked = item.minRole ? !can(item.minRole) : false;
    const Icon = item.icon;
    const className = cn(
      "flex items-center gap-3 rounded-lg px-3 h-11 text-[13px] transition-colors",
      !expanded && "justify-center px-0",
      active
        ? "bg-ds-surface-3 text-ds-text-1"
        : "text-ds-text-3 hover:bg-ds-surface-2 hover:text-ds-text-1",
      locked && "opacity-40 cursor-not-allowed hover:bg-transparent",
    );
    const inner = (
      <>
        <Icon className="h-4 w-4 shrink-0" />
        {expanded && <span className="truncate">{item.label}</span>}
      </>
    );
    if (locked) {
      return (
        <span key={item.href} className={className} title={platformRoleTitle(item.minRole!)}>
          {inner}
        </span>
      );
    }
    return (
      <Link key={item.href} href={item.href} title={!expanded ? item.label : undefined} className={className}>
        {inner}
      </Link>
    );
  };

  const sidebar = (expanded: boolean, mobile: boolean) => (
    <aside
      className={cn(
        "flex h-full flex-col border-r border-ds-border-subtle bg-ds-surface-1",
        expanded ? "w-[240px]" : "w-16",
      )}
    >
      <div className="flex h-14 items-center justify-between border-b border-ds-border-subtle px-3">
        {expanded ? (
          <Image src="/icons/logo-horizontal-white.png" alt="OPAI" width={90} height={24} className="h-6 w-auto" />
        ) : (
          <Image src="/icons/favicon-32x32.png" alt="O" width={28} height={28} className="mx-auto" />
        )}
        {mobile && (
          <button type="button" onClick={() => setMobileOpen(false)} className="p-2 text-ds-text-3" aria-label="Cerrar">
            <X className="h-5 w-5" />
          </button>
        )}
      </div>

      <div className="px-2 pt-3">
        <Button
          type="button"
          variant="primary"
          disabled={!can("admin")}
          title={!can("admin") ? platformRoleTitle("admin") : undefined}
          onClick={() => can("admin") && openCreateTenant()}
          className={cn("w-full h-10 sm:h-9", !expanded && "px-0")}
        >
          <Plus className="h-4 w-4" />
          {expanded && "Nuevo tenant"}
        </Button>
      </div>

      <nav className="flex-1 space-y-4 overflow-y-auto px-2 py-3">
        <div className="space-y-1">
          {expanded && (
            <p className="px-3 text-[12px] font-mono uppercase tracking-wide text-ds-text-4">Negocio</p>
          )}
          {negocio.map((item) => renderItem(item, expanded))}
        </div>
        <div className="space-y-1">
          {expanded ? (
            <button
              type="button"
              onClick={() => persist({ toolsOpen: !toolsOpen })}
              className="flex w-full items-center justify-between px-3 text-[12px] font-mono uppercase tracking-wide text-ds-text-4"
            >
              Herramientas
              <ChevronDown className={cn("h-3.5 w-3.5 transition-transform", !toolsOpen && "-rotate-90")} />
            </button>
          ) : (
            <div className="mx-auto h-px w-6 bg-ds-border-subtle" />
          )}
          {(expanded ? toolsOpen : true) && herramientas.map((item) => renderItem(item, expanded))}
        </div>
      </nav>

      <div className="border-t border-ds-border-subtle p-2 space-y-1">
        {expanded && (
          <div className="flex items-center gap-2 px-2 py-2">
            <Avatar name={adminName} size="sm" variant="brand" />
            <div className="min-w-0">
              <p className="truncate text-[13px] text-ds-text-1">{adminName}</p>
              <p className="truncate font-mono text-[12px] text-ds-text-4">{PLATFORM_ROLE_LABEL[role]}</p>
            </div>
          </div>
        )}
        <button
          type="button"
          onClick={logout}
          title="Salir"
          className={cn(
            "flex h-11 w-full items-center gap-3 rounded-lg px-3 text-[13px] text-ds-text-3 hover:bg-ds-surface-2 hover:text-ds-text-1",
            !expanded && "justify-center px-0",
          )}
        >
          <LogOut className="h-4 w-4" />
          {expanded && "Salir"}
        </button>
        {!mobile && (
          <button
            type="button"
            onClick={() => persist({ collapsed: !collapsed })}
            className="flex h-11 w-full items-center justify-center rounded-lg text-ds-text-4 hover:bg-ds-surface-2 hover:text-ds-text-1"
            aria-label={collapsed ? "Expandir" : "Colapsar"}
          >
            {collapsed ? <ChevronRight className="h-4 w-4" /> : <ChevronLeft className="h-4 w-4" />}
          </button>
        )}
      </div>
    </aside>
  );

  return (
    <>
      <div className="fixed inset-x-0 top-0 z-40 flex h-14 items-center gap-3 border-b border-ds-border-subtle bg-ds-surface-1 px-4 lg:hidden">
        <button type="button" onClick={() => setMobileOpen(true)} className="p-2 text-ds-text-2" aria-label="Menú">
          <Menu className="h-5 w-5" />
        </button>
        <Image src="/icons/logo-horizontal-white.png" alt="OPAI" width={80} height={22} className="h-5 w-auto" />
        <span className="font-mono text-[12px] uppercase tracking-wide text-ds-text-4">Platform</span>
      </div>
      {mobileOpen && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <div className="absolute inset-0 bg-black/35" onClick={() => setMobileOpen(false)} />
          <div className="relative h-full w-[240px]">{sidebar(true, true)}</div>
        </div>
      )}
      <div className="hidden lg:block lg:shrink-0">{sidebar(!collapsed, false)}</div>
    </>
  );
}
