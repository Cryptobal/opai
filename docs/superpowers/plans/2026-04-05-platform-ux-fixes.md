# Platform Admin UX Fixes Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the Platform Admin portal mobile-first with collapsible sidebar, add dark/light theme toggle, and add "Pricing" nav item for the upcoming catalog feature.

**Architecture:** Replace the fixed 264px sidebar with a responsive drawer (hamburger on mobile, collapsible on desktop). Add a theme toggle that persists to localStorage independently from the tenant app's theme. All changes are in the platform layout and sidebar components.

**Tech Stack:** Next.js App Router, Tailwind CSS, lucide-react icons, localStorage for theme persistence.

---

## File Map

| File | Change |
|------|--------|
| `src/components/platform/PlatformSidebar.tsx` | Rewrite: responsive drawer, collapse state, theme toggle, new nav items |
| `src/components/platform/PlatformThemeForcer.tsx` | Rewrite: support light/dark toggle with localStorage persistence |
| `src/app/platform/layout.tsx` | Update: pass theme state, responsive wrapper |

---

### Task 1: Rewrite PlatformThemeForcer with toggle support

**Files:**
- Modify: `src/components/platform/PlatformThemeForcer.tsx`

- [ ] **Step 1: Rewrite PlatformThemeForcer**

Replace the entire file content with:

```tsx
'use client';

import { createContext, useContext, useEffect, useState } from 'react';

type PlatformTheme = 'light' | 'dark';

interface PlatformThemeContextValue {
  theme: PlatformTheme;
  toggleTheme: () => void;
}

const PlatformThemeContext = createContext<PlatformThemeContextValue>({
  theme: 'light',
  toggleTheme: () => {},
});

export function usePlatformTheme() {
  return useContext(PlatformThemeContext);
}

const STORAGE_KEY = 'opai-platform-theme';

/**
 * Manages theme for /platform/* pages independently from the tenant app.
 * Saves preference to localStorage under a separate key.
 * On mount, overrides the root <html> dark class. On unmount, restores it.
 */
export function PlatformThemeForcer({ children }: { children: React.ReactNode }) {
  const [theme, setTheme] = useState<PlatformTheme>('light');
  const [mounted, setMounted] = useState(false);
  const [wasDark, setWasDark] = useState(false);

  // On mount: save original state, apply platform theme
  useEffect(() => {
    const root = document.documentElement;
    setWasDark(root.classList.contains('dark'));

    const saved = localStorage.getItem(STORAGE_KEY) as PlatformTheme | null;
    const initial = saved ?? 'light';
    setTheme(initial);
    setMounted(true);

    return () => {
      // Restore the tenant app's dark mode when leaving platform
      if (root.classList.contains('dark') === false) {
        // Tenant app defaults to dark
        root.classList.add('dark');
      }
    };
  }, []);

  // Apply theme changes
  useEffect(() => {
    if (!mounted) return;
    const root = document.documentElement;
    if (theme === 'dark') {
      root.classList.add('dark');
    } else {
      root.classList.remove('dark');
    }
    localStorage.setItem(STORAGE_KEY, theme);
  }, [theme, mounted]);

  const toggleTheme = () => setTheme((prev) => (prev === 'light' ? 'dark' : 'light'));

  return (
    <PlatformThemeContext.Provider value={{ theme, toggleTheme }}>
      {children}
    </PlatformThemeContext.Provider>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add src/components/platform/PlatformThemeForcer.tsx
git commit -m "feat: add theme toggle support to PlatformThemeForcer"
```

---

### Task 2: Rewrite PlatformSidebar — mobile-first + responsive

**Files:**
- Modify: `src/components/platform/PlatformSidebar.tsx`

- [ ] **Step 1: Rewrite PlatformSidebar**

Replace the entire file content. The new sidebar:
- **Mobile (< lg):** Hidden by default, opens as a full-height drawer overlay with backdrop. Hamburger button in a top bar.
- **Desktop (>= lg):** Collapsible — starts collapsed (icons only, 72px), expands to 256px on hover or click. State persisted to localStorage.
- Theme toggle (sun/moon icon) at the bottom.
- New nav items: Dashboard, Tenants (links to dashboard), Pricing, Facturación.

```tsx
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
  { href: '/platform/pricing', label: 'Pricing', icon: Tag },
  { href: '/platform/billing', label: 'Facturación', icon: Receipt },
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
              <span className="rounded bg-teal-500/20 px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wider text-teal-400">
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
                    ? 'bg-teal-500/20 text-teal-400'
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
        <div className="border-t border-white/10 px-2 py-3 space-y-2">
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
        <span className="rounded bg-teal-500/20 px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wider text-teal-600 dark:text-teal-400">
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
```

- [ ] **Step 2: Commit**

```bash
git add src/components/platform/PlatformSidebar.tsx
git commit -m "feat: mobile-first responsive sidebar with theme toggle"
```

---

### Task 3: Update layout for mobile support

**Files:**
- Modify: `src/app/platform/layout.tsx`

- [ ] **Step 1: Update layout**

Replace entire file:

```tsx
import { getPlatformSession } from '@/lib/platform-auth';
import { PlatformSidebar } from '@/components/platform/PlatformSidebar';
import { PlatformThemeForcer } from '@/components/platform/PlatformThemeForcer';

export const dynamic = 'force-dynamic';

export default async function PlatformLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await getPlatformSession();

  if (!session) {
    return (
      <PlatformThemeForcer>
        {children}
      </PlatformThemeForcer>
    );
  }

  return (
    <PlatformThemeForcer>
      <div className="flex h-screen bg-gray-100 dark:bg-gray-950">
        <PlatformSidebar adminName={session.name} adminEmail={session.email} />
        {/* pt-14 on mobile for the fixed top bar, lg:pt-0 on desktop */}
        <main className="flex-1 overflow-y-auto pt-14 lg:pt-0">
          <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6 sm:py-8">{children}</div>
        </main>
      </div>
    </PlatformThemeForcer>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add src/app/platform/layout.tsx
git commit -m "feat: update platform layout for mobile-first responsive design"
```

---

### Task 4: Add dark mode support to platform pages

**Files:**
- Modify: `src/app/platform/dashboard/page.tsx`
- Modify: `src/components/platform/PlatformKpiCard.tsx`
- Modify: `src/components/platform/TenantTable.tsx`
- Modify: `src/components/platform/TenantDetailTabs.tsx`
- Modify: `src/components/platform/CreateTenantForm.tsx`
- Modify: `src/app/platform/billing/page.tsx`

All platform pages use hardcoded light colors (`text-gray-900`, `bg-white`, `border-gray-200`). Add `dark:` variants so the theme toggle works.

- [ ] **Step 1: Update PlatformKpiCard**

Replace entire file:

```tsx
interface PlatformKpiCardProps {
  label: string;
  value: string | number;
  trend?: { value: string; positive: boolean };
  warning?: boolean;
}

export function PlatformKpiCard({ label, value, trend, warning }: PlatformKpiCardProps) {
  return (
    <div
      className={`rounded-xl border p-6 shadow-sm ${
        warning
          ? 'border-amber-200 bg-amber-50 dark:border-amber-800 dark:bg-amber-950'
          : 'border-gray-200 bg-white dark:border-gray-800 dark:bg-gray-900'
      }`}
    >
      <div className="text-sm font-medium text-gray-500 dark:text-gray-400">{label}</div>
      <div className="mt-2 text-3xl font-bold text-gray-900 dark:text-gray-100">{value}</div>
      {trend && (
        <div
          className={`mt-2 text-sm font-medium ${
            trend.positive ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-600 dark:text-red-400'
          }`}
        >
          {trend.value}
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Add dark variants to dashboard page**

In `src/app/platform/dashboard/page.tsx`, make these replacements (use replace_all where applicable):

- `text-gray-900` → `text-gray-900 dark:text-gray-100`
- `bg-gray-200` → `bg-gray-200 dark:bg-gray-800` (skeleton states)
- `border-gray-200 bg-white` → `border-gray-200 bg-white dark:border-gray-800 dark:bg-gray-900`

- [ ] **Step 3: Add dark variants to TenantTable**

In `src/components/platform/TenantTable.tsx`, add dark variants:
- Table container: `border-gray-200 bg-white` → add `dark:border-gray-800 dark:bg-gray-900`
- Table header: `border-gray-200 bg-gray-50` → add `dark:border-gray-700 dark:bg-gray-800`
- Header text: `text-gray-500` → add `dark:text-gray-400`
- Row text: `text-gray-900` → add `dark:text-gray-100`
- Row hover: `hover:bg-gray-50` → add `dark:hover:bg-gray-800`
- Divider: `divide-gray-100` → add `dark:divide-gray-800`
- Filter buttons active: `bg-gray-900 text-white` → add `dark:bg-gray-100 dark:text-gray-900`
- Filter buttons inactive: `bg-gray-100 text-gray-600` → add `dark:bg-gray-800 dark:text-gray-400`
- Slug text: `text-gray-500` → add `dark:text-gray-400`
- Pagination: same pattern as filter buttons

- [ ] **Step 4: Add dark variants to TenantDetailTabs**

In `src/components/platform/TenantDetailTabs.tsx`, add dark variants:
- Card containers: `border-gray-200 bg-white` → add `dark:border-gray-800 dark:bg-gray-900`
- Tab active: `border-teal-500 text-teal-600` → add `dark:text-teal-400`
- Tab inactive: `text-gray-500` → add `dark:text-gray-400`
- Labels: `text-gray-500` → add `dark:text-gray-400`
- Values: `text-gray-900` → add `dark:text-gray-100`
- Input fields: add `dark:bg-gray-800 dark:border-gray-700 dark:text-gray-100`
- Table: same dark patterns as TenantTable

- [ ] **Step 5: Add dark variants to CreateTenantForm**

In `src/components/platform/CreateTenantForm.tsx`:
- Fieldset: `border-gray-200 bg-white` → add `dark:border-gray-800 dark:bg-gray-900`
- Labels: `text-gray-700` → add `dark:text-gray-300`
- Inputs: `border-gray-300` → add `dark:border-gray-700 dark:bg-gray-800 dark:text-gray-100`
- Error: `bg-red-50 text-red-600` → add `dark:bg-red-950 dark:text-red-400`

- [ ] **Step 6: Add dark variants to billing page**

In `src/app/platform/billing/page.tsx`:
- Same table dark patterns
- Footer: `border-gray-300 bg-gray-50` → add `dark:border-gray-700 dark:bg-gray-800`

- [ ] **Step 7: Commit**

```bash
git add src/components/platform/ src/app/platform/
git commit -m "feat: add dark mode support to all platform pages"
```

---

### Task 5: Add placeholder pricing page

**Files:**
- Create: `src/app/platform/pricing/page.tsx`

- [ ] **Step 1: Create placeholder page**

```tsx
export default function PricingPage() {
  return (
    <div>
      <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">Pricing</h1>
      <p className="mt-2 text-sm text-gray-500 dark:text-gray-400">
        Catálogo de planes, add-ons y packs. Próximamente.
      </p>
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add src/app/platform/pricing/
git commit -m "feat: add placeholder pricing page with nav link"
```

---

### Task 6: Update login page for dark mode support

**Files:**
- Modify: `src/app/platform/login/page.tsx`

- [ ] **Step 1: Replace inline styles with Tailwind classes**

The login page currently uses inline `style=` attributes to avoid dark mode interference. Now that the theme forcer supports both modes, replace inline styles with Tailwind + dark variants. The login page should always appear on the dark navy background regardless of theme.

The login page sits outside the sidebar layout (no session), so it doesn't get theme-affected content. Keep the dark background via `bg-[#0a1628]` (hardcoded, not via dark: prefix). But the form card should use proper classes:

- Form card: `bg-white dark:bg-gray-900`
- Labels: `text-gray-700 dark:text-gray-300`
- Inputs: `border-gray-300 text-gray-900 bg-white dark:border-gray-700 dark:text-gray-100 dark:bg-gray-800`
- Divider text: `text-gray-500 bg-white dark:text-gray-400 dark:bg-gray-900`
- Google button border: `border-gray-300 text-gray-700 dark:border-gray-600 dark:text-gray-300`

Since the login page always has a dark navy background, the `PlatformThemeForcer` should NOT affect it. The login uses the `no session` path in layout.tsx which still wraps in `PlatformThemeForcer` — this is fine since the login page uses hardcoded colors that work in both modes.

- [ ] **Step 2: Commit**

```bash
git add src/app/platform/login/page.tsx
git commit -m "feat: update login page with proper Tailwind dark mode classes"
```

---

### Task 7: Verify responsive behavior

- [ ] **Step 1: Test mobile layout**

Open DevTools, toggle mobile viewport (375px width):
1. Verify hamburger icon appears in top bar
2. Click hamburger — drawer opens with full navigation
3. Click a nav item — drawer closes, page navigates
4. Click backdrop — drawer closes

- [ ] **Step 2: Test desktop layout**

At desktop width (>1024px):
1. Sidebar starts collapsed (icons only, 72px)
2. Click chevron → sidebar expands to 256px with labels
3. Click chevron again → collapses
4. Refresh → collapse state persists

- [ ] **Step 3: Test theme toggle**

1. Click moon icon → page switches to dark mode
2. Refresh → dark mode persists
3. Click sun icon → back to light mode
4. Navigate to `/opai/login` (tenant app) → dark mode restored for tenant app

- [ ] **Step 4: Commit any fixes**

```bash
git add -A && git commit -m "fix: responsive and theme adjustments"
```
