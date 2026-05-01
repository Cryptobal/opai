'use client';

import { useState, useEffect } from 'react';
import { usePathname } from 'next/navigation';
import Link from 'next/link';
import Image from 'next/image';
import {
  LayoutDashboard,
  Building2,
  Receipt,
  Tag,
  Brain,
  MessageSquare,
  BookOpen,
  LogOut,
  Menu,
  X,
  Sun,
  Moon,
  ChevronLeft,
  ChevronRight,
} from 'lucide-react';
import { usePlatformTheme } from './PlatformThemeForcer';

interface PlatformSidebarProps {
  adminName: string;
  adminEmail: string;
}

const navItems = [
  { href: '/platform/dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { href: '/platform/tenants/new', label: 'Nuevo Tenant', icon: Building2 },
  { href: '/platform/ai', label: 'IA / Providers', icon: Brain },
  { href: '/platform/pricing', label: 'Pricing', icon: Tag },
  { href: '/platform/billing', label: 'Facturación', icon: Receipt },
  { href: '/platform/knowledge', label: 'Base de Conocimiento', icon: BookOpen },
  { href: '/platform/marketing', label: 'Marketing Chat', icon: MessageSquare },
];

const COLLAPSED_KEY = 'opai-platform-sidebar-collapsed';

export function PlatformSidebar({ adminName, adminEmail }: PlatformSidebarProps) {
  const pathname = usePathname();
  const { theme, toggleTheme } = usePlatformTheme();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(true);

  useEffect(() => {
    const saved = localStorage.getItem(COLLAPSED_KEY);
    if (saved !== null) setCollapsed(saved === 'true');
  }, []);

  const toggleCollapsed = () => {
    const next = !collapsed;
    setCollapsed(next);
    localStorage.setItem(COLLAPSED_KEY, String(next));
  };

  const handleLogout = async () => {
    await fetch('/api/platform/auth', { method: 'DELETE' });
    window.location.href = '/platform/login';
  };

  // Close mobile menu on route change
  useEffect(() => {
    setMobileOpen(false);
  }, [pathname]);

  const sidebarContent = (isMobile: boolean) => {
    const expanded = isMobile || !collapsed;
    return (
      <aside
        className={`flex h-full flex-col bg-[#0a1628] text-white transition-all duration-200 ${
          expanded ? 'w-64' : 'w-[72px]'
        }`}
      >
        {/* Logo */}
        <div className="flex items-center justify-between border-b border-white/10 px-4 py-4">
          {expanded ? (
            <div className="flex items-center gap-2">
              <Image
                src="/icons/logo-horizontal-white.png"
                alt="OPAI"
                width={90}
                height={24}
                className="h-6 w-auto"
              />
              <span className="rounded bg-teal-500/20 px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wider text-status-info-fg">
                Admin
              </span>
            </div>
          ) : (
            <Image
              src="/icons/favicon-32x32.png"
              alt="O"
              width={32}
              height={32}
              className="mx-auto"
            />
          )}
          {isMobile && (
            <button onClick={() => setMobileOpen(false)} className="p-1 text-gray-400 hover:text-white">
              <X className="h-5 w-5" />
            </button>
          )}
        </div>

        {/* Navigation */}
        <nav className="flex-1 space-y-1 px-2 py-3">
          {navItems.map((item) => {
            const isActive =
              pathname === item.href ||
              (item.href !== '/platform/dashboard' && pathname.startsWith(item.href));
            const Icon = item.icon;
            return (
              <Link
                key={item.href}
                href={item.href}
                title={collapsed && !isMobile ? item.label : undefined}
                className={`flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm transition-colors ${
                  isActive
                    ? 'bg-teal-500/20 text-status-info-fg'
                    : 'text-gray-400 hover:bg-white/5 hover:text-white'
                } ${!expanded ? 'justify-center' : ''}`}
              >
                <Icon className="h-4 w-4 shrink-0" />
                {expanded && <span>{item.label}</span>}
              </Link>
            );
          })}
        </nav>

        {/* Bottom section */}
        <div className="space-y-1 border-t border-white/10 px-2 py-3">
          {/* Theme toggle */}
          <button
            onClick={toggleTheme}
            title={theme === 'light' ? 'Modo oscuro' : 'Modo claro'}
            className={`flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm text-gray-400 transition-colors hover:bg-white/5 hover:text-white ${
              !expanded ? 'justify-center' : ''
            }`}
          >
            {theme === 'light' ? <Moon className="h-4 w-4 shrink-0" /> : <Sun className="h-4 w-4 shrink-0" />}
            {expanded && <span>{theme === 'light' ? 'Modo oscuro' : 'Modo claro'}</span>}
          </button>

          {/* User info */}
          {expanded && (
            <div className="px-3 py-1">
              <div className="truncate text-sm font-medium text-gray-200">{adminName}</div>
              <div className="truncate text-xs text-gray-500">{adminEmail}</div>
            </div>
          )}

          {/* Logout */}
          <button
            onClick={handleLogout}
            title={!expanded ? 'Cerrar sesión' : undefined}
            className={`flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm text-gray-400 transition-colors hover:bg-white/5 hover:text-white ${
              !expanded ? 'justify-center' : ''
            }`}
          >
            <LogOut className="h-4 w-4 shrink-0" />
            {expanded && <span>Cerrar sesión</span>}
          </button>

          {/* Collapse toggle (desktop only) */}
          {!isMobile && (
            <button
              onClick={toggleCollapsed}
              className="flex w-full items-center justify-center rounded-lg p-2 text-gray-500 transition-colors hover:bg-white/5 hover:text-white"
            >
              {collapsed ? <ChevronRight className="h-4 w-4" /> : <ChevronLeft className="h-4 w-4" />}
            </button>
          )}
        </div>
      </aside>
    );
  };

  return (
    <>
      {/* Mobile: top bar with hamburger */}
      <div className="fixed left-0 right-0 top-0 z-40 flex h-14 items-center gap-3 border-b border-gray-200 bg-white px-4 dark:border-gray-800 dark:bg-[#0a1628] lg:hidden">
        <button onClick={() => setMobileOpen(true)} className="p-1 text-gray-600 dark:text-gray-300">
          <Menu className="h-5 w-5" />
        </button>
        <Image
          src="/icons/logo-horizontal-dark.png"
          alt="OPAI"
          width={80}
          height={22}
          className="h-5 w-auto dark:hidden"
        />
        <Image
          src="/icons/logo-horizontal-white.png"
          alt="OPAI"
          width={80}
          height={22}
          className="hidden h-5 w-auto dark:block"
        />
        <span className="rounded bg-teal-500/20 px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wider text-teal-600 dark:text-status-info-fg">
          Admin
        </span>
      </div>

      {/* Mobile: drawer overlay */}
      {mobileOpen && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <div className="absolute inset-0 bg-black/50" onClick={() => setMobileOpen(false)} />
          <div className="relative h-full w-64">{sidebarContent(true)}</div>
        </div>
      )}

      {/* Desktop: sidebar */}
      <div className="hidden lg:block lg:shrink-0">{sidebarContent(false)}</div>
    </>
  );
}
