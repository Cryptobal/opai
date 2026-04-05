'use client';

import { usePathname } from 'next/navigation';
import Link from 'next/link';
import Image from 'next/image';
import {
  LayoutDashboard,
  Building2,
  Receipt,
  LogOut,
} from 'lucide-react';

interface PlatformSidebarProps {
  adminName: string;
  adminEmail: string;
}

const navItems = [
  { href: '/platform/dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { href: '/platform/tenants/new', label: 'Nuevo Tenant', icon: Building2 },
  { href: '/platform/billing', label: 'Facturación', icon: Receipt },
];

export function PlatformSidebar({ adminName, adminEmail }: PlatformSidebarProps) {
  const pathname = usePathname();

  const handleLogout = async () => {
    await fetch('/api/platform/auth', { method: 'DELETE' });
    window.location.href = '/platform/login';
  };

  return (
    <aside className="flex h-screen w-64 flex-col bg-[#0a1628] text-white">
      {/* Logo */}
      <div className="flex items-center gap-3 border-b border-white/10 px-5 py-5">
        <Image
          src="/icons/logo-horizontal-white.png"
          alt="OPAI"
          width={100}
          height={28}
          className="h-7 w-auto"
        />
        <span className="rounded-md bg-teal-500/20 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-teal-400">
          Admin
        </span>
      </div>

      {/* Navigation */}
      <nav className="flex-1 space-y-1 px-3 py-4">
        {navItems.map((item) => {
          const isActive =
            pathname === item.href ||
            (item.href !== '/platform/dashboard' && pathname.startsWith(item.href));
          const Icon = item.icon;
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm transition-colors ${
                isActive
                  ? 'bg-teal-500/20 text-teal-400'
                  : 'text-gray-400 hover:bg-white/5 hover:text-white'
              }`}
            >
              <Icon className="h-4 w-4" />
              {item.label}
            </Link>
          );
        })}
      </nav>

      {/* User info + logout */}
      <div className="border-t border-white/10 px-4 py-4">
        <div className="mb-3 px-2">
          <div className="text-sm font-medium text-gray-200">{adminName}</div>
          <div className="text-xs text-gray-500">{adminEmail}</div>
        </div>
        <button
          onClick={handleLogout}
          className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm text-gray-400 transition-colors hover:bg-white/5 hover:text-white"
        >
          <LogOut className="h-4 w-4" />
          Cerrar sesión
        </button>
      </div>
    </aside>
  );
}
