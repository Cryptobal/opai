# Platform Admin Portal — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a separate admin portal at `/platform/*` for managing all OPAI tenants, with its own JWT auth, dashboard, tenant CRUD, billing view, and impersonate functionality.

**Architecture:** Completely separate auth system (manual JWT via `jose`) coexisting with tenant NextAuth sessions. Dedicated layout and components under `/platform/*`. API routes under `/api/platform/*` all gated by `requirePlatformAuth()`. Impersonate uses NextAuth `signIn()` server-side (Option A) with `impersonating` flag in JWT.

**Tech Stack:** Next.js 16 App Router, TypeScript, Prisma 6, jose (JWT), bcryptjs, Tailwind CSS, shadcn/ui components, lucide-react icons.

**Spec:** `docs/superpowers/specs/2026-04-05-platform-admin-portal-design.md`

---

## File Map

### New Files
| File | Responsibility |
|------|---------------|
| `src/lib/platform-auth.ts` | JWT cookie auth: login, session read, logout |
| `src/lib/platform-api-auth.ts` | `requirePlatformAuth()` helper for API routes |
| `src/middleware.ts` | Cookie-presence check for `/platform/*` routes |
| `src/app/platform/layout.tsx` | Server layout with session check + sidebar |
| `src/app/platform/page.tsx` | Redirect to `/platform/dashboard` |
| `src/app/platform/login/page.tsx` | Login form (client component) |
| `src/app/platform/dashboard/page.tsx` | KPIs + tenant table |
| `src/app/platform/tenants/new/page.tsx` | Create tenant form |
| `src/app/platform/tenants/[tenantId]/page.tsx` | Tenant detail with tabs |
| `src/app/platform/billing/page.tsx` | Global billing table |
| `src/app/api/platform/auth/route.ts` | POST login / DELETE logout |
| `src/app/api/platform/dashboard/route.ts` | GET KPIs + tenant list |
| `src/app/api/platform/tenants/route.ts` | GET list / POST create |
| `src/app/api/platform/tenants/[id]/route.ts` | GET detail / PATCH update |
| `src/app/api/platform/tenants/[id]/plan/route.ts` | PATCH plan/limits |
| `src/app/api/platform/tenants/[id]/modules/route.ts` | PATCH toggle module |
| `src/app/api/platform/tenants/[id]/suspend/route.ts` | POST suspend / DELETE reactivate |
| `src/app/api/platform/tenants/[id]/impersonate/route.ts` | POST create impersonate session |
| `src/app/api/platform/impersonate/route.ts` | DELETE end impersonate |
| `src/components/platform/PlatformSidebar.tsx` | Navy sidebar with nav |
| `src/components/platform/PlatformKpiCard.tsx` | KPI card component |
| `src/components/platform/TenantTable.tsx` | Sortable/filterable tenant table |
| `src/components/platform/TenantDetailTabs.tsx` | Tabbed detail view |
| `src/components/platform/CreateTenantForm.tsx` | Tenant creation form |
| `src/components/platform/ImpersonateBanner.tsx` | Amber banner for impersonate mode |

### Modified Files
| File | Change |
|------|--------|
| `prisma/schema.prisma` | Add `PlatformAdmin` model + 7 fields to `Tenant` |
| `prisma/seed.ts` | Append platform admin upsert |
| `src/lib/auth.ts` | Add `impersonating`/`impersonatingFrom` to JWT type, impersonate flow in authorize |
| `src/app/(app)/layout.tsx` | Add `ImpersonateBanner` |

---

## Task 1: Schema + Migration + Seed

**Files:**
- Modify: `prisma/schema.prisma:12-68` (Tenant model) and end of file (new PlatformAdmin)
- Modify: `prisma/seed.ts:136-137` (before "Seeding completed" log)

- [ ] **Step 1: Add PlatformAdmin model to schema**

Add at the end of `prisma/schema.prisma`, before any `@@schema` that isn't `"public"` — place it right after the `TenantPlan` model (after line 112):

```prisma
model PlatformAdmin {
  id          String    @id @default(cuid())
  email       String    @unique
  password    String
  name        String
  status      String    @default("active")
  createdAt   DateTime  @default(now()) @map("created_at")
  updatedAt   DateTime  @updatedAt @map("updated_at")
  lastLoginAt DateTime? @map("last_login_at")

  @@index([email])
  @@map("platform_admins")
  @@schema("public")
}
```

- [ ] **Step 2: Add fields to Tenant model**

In the `Tenant` model (lines 12-68), add these fields before the relations (before line 19 `admins`):

```prisma
  billingEmail     String?   @map("billing_email")
  supportEmail     String?   @map("support_email")
  notes            String?
  suspendedAt      DateTime? @map("suspended_at")
  suspendedReason  String?   @map("suspended_reason")
  onboardedBy      String?   @map("onboarded_by")
  lastActivityAt   DateTime? @map("last_activity_at")
```

- [ ] **Step 3: Run migration**

```bash
npx prisma migrate dev --name add-platform-admin
```

Expected: Migration created and applied successfully. Prisma Client regenerated.

- [ ] **Step 4: Add platform admin seed**

In `prisma/seed.ts`, add import at top (after bcryptjs import, line 10):

```typescript
// (no new import needed — bcrypt is already imported)
```

Add before the `console.log('🎉 Seeding completed!')` line (line 137):

```typescript
  // 14. Platform Admin
  const platformPassword = await bcrypt.hash('OpaiPlatform2026!', 12);
  const platformAdmin = await prisma.platformAdmin.upsert({
    where: { email: 'carlos.irigoyen@opai.cl' },
    update: {},
    create: {
      email: 'carlos.irigoyen@opai.cl',
      password: platformPassword,
      name: 'Carlos Irigoyen',
      status: 'active',
    },
  });
  console.log('✅ Platform Admin ready:', platformAdmin.email);
```

- [ ] **Step 5: Run seed to verify**

```bash
npx prisma db seed
```

Expected: All existing seeds pass + "Platform Admin ready: carlos.irigoyen@opai.cl"

- [ ] **Step 6: Commit**

```bash
git add prisma/schema.prisma prisma/seed.ts prisma/migrations/
git commit -m "feat: add PlatformAdmin model and extend Tenant with billing/support fields"
```

---

## Task 2: Platform Auth (JWT Cookie)

**Files:**
- Create: `src/lib/platform-auth.ts`
- Create: `src/lib/platform-api-auth.ts`

- [ ] **Step 1: Create platform-auth.ts**

```typescript
import { SignJWT, jwtVerify } from 'jose';
import { cookies } from 'next/headers';
import * as bcrypt from 'bcryptjs';

const COOKIE_NAME = 'platform-session';
const EXPIRY_SECONDS = 24 * 60 * 60; // 24 hours

function getSecret(): Uint8Array {
  const secret = process.env.PLATFORM_JWT_SECRET || process.env.AUTH_SECRET || process.env.NEXTAUTH_SECRET;
  if (!secret) throw new Error('PLATFORM_JWT_SECRET is not set');
  return new TextEncoder().encode(secret);
}

export interface PlatformSession {
  platformAdminId: string;
  email: string;
  name: string;
}

export async function platformLogin(
  email: string,
  password: string,
): Promise<{ success: true; session: PlatformSession } | { success: false; error: string }> {
  const { prisma } = await import('@/lib/prisma');

  const admin = await prisma.platformAdmin.findUnique({
    where: { email: email.trim().toLowerCase() },
  });

  if (!admin || admin.status !== 'active') {
    return { success: false, error: 'Credenciales inválidas' };
  }

  const valid = await bcrypt.compare(password, admin.password);
  if (!valid) {
    return { success: false, error: 'Credenciales inválidas' };
  }

  // Update last login
  await prisma.platformAdmin.update({
    where: { id: admin.id },
    data: { lastLoginAt: new Date() },
  });

  const session: PlatformSession = {
    platformAdminId: admin.id,
    email: admin.email,
    name: admin.name,
  };

  // Sign JWT
  const token = await new SignJWT({ ...session })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime(`${EXPIRY_SECONDS}s`)
    .sign(getSecret());

  // Set cookie
  const cookieStore = await cookies();
  cookieStore.set(COOKIE_NAME, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: EXPIRY_SECONDS,
  });

  return { success: true, session };
}

export async function getPlatformSession(): Promise<PlatformSession | null> {
  try {
    const cookieStore = await cookies();
    const token = cookieStore.get(COOKIE_NAME)?.value;
    if (!token) return null;

    const { payload } = await jwtVerify(token, getSecret());
    return {
      platformAdminId: payload.platformAdminId as string,
      email: payload.email as string,
      name: payload.name as string,
    };
  } catch {
    return null;
  }
}

export async function platformLogout(): Promise<void> {
  const cookieStore = await cookies();
  cookieStore.set(COOKIE_NAME, '', {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: 0,
  });
}
```

- [ ] **Step 2: Create platform-api-auth.ts**

```typescript
import { getPlatformSession, type PlatformSession } from './platform-auth';
import { NextResponse } from 'next/server';

export type PlatformAuthContext = PlatformSession;

export async function requirePlatformAuth(): Promise<PlatformAuthContext | null> {
  const session = await getPlatformSession();
  if (!session) return null;
  return session;
}

export function platformUnauthorized() {
  return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
}
```

- [ ] **Step 3: Add env var to .env.local**

Generate a secret and add to `.env.local`:

```bash
echo "PLATFORM_JWT_SECRET=$(openssl rand -hex 32)" >> .env.local
echo "PLATFORM_IMPERSONATE_SECRET=$(openssl rand -hex 32)" >> .env.local
```

- [ ] **Step 4: Commit**

```bash
git add src/lib/platform-auth.ts src/lib/platform-api-auth.ts
git commit -m "feat: add platform auth with JWT cookie session"
```

---

## Task 3: Auth API Route

**Files:**
- Create: `src/app/api/platform/auth/route.ts`

- [ ] **Step 1: Create auth route**

```typescript
import { NextRequest, NextResponse } from 'next/server';
import { platformLogin, platformLogout } from '@/lib/platform-auth';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { email, password } = body;

    if (!email || !password) {
      return NextResponse.json(
        { error: 'Email y contraseña son requeridos' },
        { status: 400 },
      );
    }

    const result = await platformLogin(email, password);

    if (!result.success) {
      return NextResponse.json({ error: result.error }, { status: 401 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('[platform-auth] Login error:', error);
    return NextResponse.json(
      { error: 'Error interno del servidor' },
      { status: 500 },
    );
  }
}

export async function DELETE() {
  await platformLogout();
  return NextResponse.json({ success: true });
}
```

- [ ] **Step 2: Commit**

```bash
git add src/app/api/platform/auth/route.ts
git commit -m "feat: add platform auth API route (login/logout)"
```

---

## Task 4: Middleware

**Files:**
- Create: `src/middleware.ts`

- [ ] **Step 1: Create middleware**

```typescript
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Platform routes protection (except login page)
  if (pathname.startsWith('/platform') && !pathname.startsWith('/platform/login')) {
    const platformSession = request.cookies.get('platform-session');
    if (!platformSession?.value) {
      return NextResponse.redirect(new URL('/platform/login', request.url));
    }
  }

  return NextResponse.next();
}

export const config = {
  matcher: ['/platform/:path*'],
};
```

- [ ] **Step 2: Commit**

```bash
git add src/middleware.ts
git commit -m "feat: add middleware for /platform/* route protection"
```

---

## Task 5: Platform UI Components

**Files:**
- Create: `src/components/platform/PlatformSidebar.tsx`
- Create: `src/components/platform/PlatformKpiCard.tsx`

- [ ] **Step 1: Create PlatformSidebar**

```tsx
'use client';

import { usePathname } from 'next/navigation';
import Link from 'next/link';
import {
  LayoutDashboard,
  Building2,
  Receipt,
  Settings,
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
      <div className="flex items-center gap-2 border-b border-white/10 px-6 py-5">
        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-teal-500 text-sm font-bold">
          O
        </div>
        <div>
          <div className="text-sm font-semibold">OPAI</div>
          <div className="text-xs text-teal-400">Platform Admin</div>
        </div>
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
```

- [ ] **Step 2: Create PlatformKpiCard**

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
      className={`rounded-xl border bg-white p-6 shadow-sm ${
        warning ? 'border-amber-200 bg-amber-50' : 'border-gray-200'
      }`}
    >
      <div className="text-sm font-medium text-gray-500">{label}</div>
      <div className="mt-2 text-3xl font-bold text-gray-900">{value}</div>
      {trend && (
        <div
          className={`mt-2 text-sm font-medium ${
            trend.positive ? 'text-emerald-600' : 'text-red-600'
          }`}
        >
          {trend.value}
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 3: Commit**

```bash
git add src/components/platform/PlatformSidebar.tsx src/components/platform/PlatformKpiCard.tsx
git commit -m "feat: add PlatformSidebar and PlatformKpiCard components"
```

---

## Task 6: Platform Layout + Login Page

**Files:**
- Create: `src/app/platform/layout.tsx`
- Create: `src/app/platform/page.tsx`
- Create: `src/app/platform/login/page.tsx`

- [ ] **Step 1: Create platform layout**

```tsx
import { redirect } from 'next/navigation';
import { getPlatformSession } from '@/lib/platform-auth';
import { PlatformSidebar } from '@/components/platform/PlatformSidebar';

export const dynamic = 'force-dynamic';

export default async function PlatformLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await getPlatformSession();

  // Login page doesn't need the sidebar layout
  // The middleware already handles redirects, but we need session for sidebar
  if (!session) {
    // If no session, just render children (login page)
    return <>{children}</>;
  }

  return (
    <div className="flex h-screen bg-gray-50">
      <PlatformSidebar adminName={session.name} adminEmail={session.email} />
      <main className="flex-1 overflow-y-auto">
        <div className="mx-auto max-w-7xl px-6 py-8">{children}</div>
      </main>
    </div>
  );
}
```

- [ ] **Step 2: Create redirect page**

`src/app/platform/page.tsx`:

```tsx
import { redirect } from 'next/navigation';

export default function PlatformPage() {
  redirect('/platform/dashboard');
}
```

- [ ] **Step 3: Create login page**

```tsx
'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

export default function PlatformLoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      const res = await fetch('/api/platform/auth', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.error || 'Error al iniciar sesión');
        return;
      }

      router.push('/platform/dashboard');
    } catch {
      setError('Error de conexión');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-[#0a1628]">
      <div className="w-full max-w-sm">
        {/* Logo */}
        <div className="mb-8 text-center">
          <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-xl bg-teal-500 text-lg font-bold text-white">
            O
          </div>
          <h1 className="text-2xl font-bold text-white">OPAI</h1>
          <p className="text-sm text-teal-400">Platform Admin</p>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="rounded-xl bg-white p-6 shadow-lg">
          <div className="space-y-4">
            <div>
              <label htmlFor="email" className="mb-1 block text-sm font-medium text-gray-700">
                Email
              </label>
              <input
                id="email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-teal-500 focus:outline-none focus:ring-1 focus:ring-teal-500"
                placeholder="admin@opai.cl"
                required
              />
            </div>
            <div>
              <label htmlFor="password" className="mb-1 block text-sm font-medium text-gray-700">
                Contraseña
              </label>
              <input
                id="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-teal-500 focus:outline-none focus:ring-1 focus:ring-teal-500"
                required
              />
            </div>
          </div>

          {error && (
            <div className="mt-4 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            className="mt-6 w-full rounded-lg bg-teal-500 px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-teal-600 disabled:opacity-50"
          >
            {loading ? 'Ingresando...' : 'Ingresar'}
          </button>
        </form>
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Verify login flow manually**

```bash
npm run dev
```

Open `http://localhost:3000/platform/login`, verify:
1. Page renders with OPAI logo and form
2. Wrong credentials show error
3. Correct credentials (`carlos.irigoyen@opai.cl` / `OpaiPlatform2026!`) redirect to `/platform/dashboard` (404 is fine — dashboard page not created yet)
4. Existing app routes (`/opai/login`, `/hub`) still work

- [ ] **Step 5: Commit**

```bash
git add src/app/platform/
git commit -m "feat: add platform layout, login page, and redirect"
```

---

## Task 7: Dashboard API Route

**Files:**
- Create: `src/app/api/platform/dashboard/route.ts`

- [ ] **Step 1: Create dashboard API**

```typescript
import { NextResponse } from 'next/server';
import { requirePlatformAuth, platformUnauthorized } from '@/lib/platform-api-auth';
import { prisma } from '@/lib/prisma';

export async function GET() {
  const ctx = await requirePlatformAuth();
  if (!ctx) return platformUnauthorized();

  const now = new Date();
  const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
  const startOfLastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  const sevenDaysFromNow = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);

  // Fetch all tenants with their plans and modules
  const tenants = await prisma.tenant.findMany({
    include: {
      plan: true,
      modules: { where: { enabled: true } },
      admins: {
        select: { id: true, lastLoginAt: true },
        where: { status: 'active' },
      },
    },
    orderBy: { createdAt: 'desc' },
  });

  // Count guards per tenant
  const guardCounts = await prisma.opsGuardia.groupBy({
    by: ['tenantId'],
    where: { status: 'active' },
    _count: { id: true },
  });
  const guardMap = new Map(guardCounts.map((g) => [g.tenantId, g._count.id]));

  // Guards last month for growth calc
  const guardsLastMonth = await prisma.opsGuardia.count({
    where: {
      status: 'active',
      hiredAt: { lt: startOfMonth },
    },
  });
  const totalGuardsNow = guardCounts.reduce((sum, g) => sum + g._count.id, 0);

  // KPIs
  const activeTenants = tenants.filter((t) => t.active);
  const newThisMonth = tenants.filter(
    (t) => t.active && t.createdAt >= startOfMonth,
  ).length;

  const guardsGrowthPct =
    guardsLastMonth > 0
      ? Math.round(((totalGuardsNow - guardsLastMonth) / guardsLastMonth) * 100)
      : 0;

  // MRR calculation
  let estimatedMrr = 0;
  for (const t of activeTenants) {
    if (t.plan && t.plan.billingStatus !== 'trial') {
      const guards = guardMap.get(t.id) || 0;
      estimatedMrr +=
        Number(t.plan.basePrice) + Number(t.plan.pricePerGuard) * guards;
    }
  }

  // Expiring trials
  const expiringTrials = tenants.filter(
    (t) =>
      t.plan?.billingStatus === 'trial' &&
      t.plan?.trialEndsAt &&
      t.plan.trialEndsAt <= sevenDaysFromNow &&
      t.plan.trialEndsAt > now,
  ).length;

  // Build tenant list
  const tenantList = tenants.map((t) => {
    const activeGuards = guardMap.get(t.id) || 0;
    const lastLogin = t.admins.reduce<Date | null>((latest, a) => {
      if (!a.lastLoginAt) return latest;
      if (!latest || a.lastLoginAt > latest) return a.lastLoginAt;
      return latest;
    }, null);

    // Determine status
    let status: string;
    if (!t.active) {
      status = 'suspended';
    } else if (t.plan?.billingStatus === 'trial') {
      status = 'trial';
    } else {
      status = 'active';
    }

    return {
      id: t.id,
      name: t.name,
      slug: t.slug,
      plan: t.plan?.plan || 'trial',
      billingStatus: t.plan?.billingStatus || 'trial',
      status,
      activeGuards,
      adminCount: t.admins.length,
      lastLoginAt: lastLogin?.toISOString() || null,
      createdAt: t.createdAt.toISOString(),
      trialEndsAt: t.plan?.trialEndsAt?.toISOString() || null,
      enabledModules: t.modules.length,
      // usagePct will be calculated in a separate query if needed
      usagePct: 0,
    };
  });

  return NextResponse.json({
    kpis: {
      activeTenants: activeTenants.length,
      activeTenantsGrowth: newThisMonth,
      totalGuards: totalGuardsNow,
      totalGuardsGrowthPct: guardsGrowthPct,
      estimatedMrr: Math.round(estimatedMrr * 100) / 100,
      expiringTrials,
    },
    tenants: tenantList,
  });
}
```

- [ ] **Step 2: Commit**

```bash
git add src/app/api/platform/dashboard/route.ts
git commit -m "feat: add platform dashboard API with KPIs and tenant list"
```

---

## Task 8: Tenants CRUD API

**Files:**
- Create: `src/app/api/platform/tenants/route.ts`
- Create: `src/app/api/platform/tenants/[id]/route.ts`

- [ ] **Step 1: Create tenants list + create route**

```typescript
import { NextRequest, NextResponse } from 'next/server';
import { requirePlatformAuth, platformUnauthorized } from '@/lib/platform-api-auth';
import { prisma } from '@/lib/prisma';
import { provisionTenant } from '@/lib/tenant-provisioning';

export async function GET(request: NextRequest) {
  const ctx = await requirePlatformAuth();
  if (!ctx) return platformUnauthorized();

  const { searchParams } = request.nextUrl;
  const status = searchParams.get('status');
  const sort = searchParams.get('sort') || 'createdAt';
  const order = (searchParams.get('order') || 'desc') as 'asc' | 'desc';
  const page = Math.max(1, parseInt(searchParams.get('page') || '1'));
  const limit = Math.min(50, Math.max(1, parseInt(searchParams.get('limit') || '20')));

  // Build where clause
  const where: Record<string, unknown> = {};
  if (status === 'active') where.active = true;
  if (status === 'suspended') where.active = false;
  if (status === 'trial') {
    where.active = true;
    where.plan = { billingStatus: 'trial' };
  }

  const [tenants, total] = await Promise.all([
    prisma.tenant.findMany({
      where,
      include: {
        plan: true,
        admins: {
          select: { id: true, lastLoginAt: true },
          where: { status: 'active' },
        },
      },
      orderBy: sort === 'name' ? { name: order } : { createdAt: order },
      skip: (page - 1) * limit,
      take: limit,
    }),
    prisma.tenant.count({ where }),
  ]);

  // Get guard counts for these tenants
  const tenantIds = tenants.map((t) => t.id);
  const guardCounts = await prisma.opsGuardia.groupBy({
    by: ['tenantId'],
    where: { tenantId: { in: tenantIds }, status: 'active' },
    _count: { id: true },
  });
  const guardMap = new Map(guardCounts.map((g) => [g.tenantId, g._count.id]));

  const tenantList = tenants.map((t) => ({
    id: t.id,
    name: t.name,
    slug: t.slug,
    active: t.active,
    plan: t.plan?.plan || 'trial',
    billingStatus: t.plan?.billingStatus || 'trial',
    activeGuards: guardMap.get(t.id) || 0,
    adminCount: t.admins.length,
    lastLoginAt: t.admins.reduce<string | null>((latest, a) => {
      if (!a.lastLoginAt) return latest;
      const iso = a.lastLoginAt.toISOString();
      if (!latest || iso > latest) return iso;
      return latest;
    }, null),
    createdAt: t.createdAt.toISOString(),
    trialEndsAt: t.plan?.trialEndsAt?.toISOString() || null,
  }));

  return NextResponse.json({
    tenants: tenantList,
    total,
    page,
    pages: Math.ceil(total / limit),
  });
}

export async function POST(request: NextRequest) {
  const ctx = await requirePlatformAuth();
  if (!ctx) return platformUnauthorized();

  try {
    const body = await request.json();
    const { name, slug, companyRut, ownerName, ownerEmail, ownerPassword, plan, trialDays } = body;

    if (!name || !slug || !ownerName || !ownerEmail || !ownerPassword || !plan) {
      return NextResponse.json(
        { error: 'Campos requeridos: name, slug, ownerName, ownerEmail, ownerPassword, plan' },
        { status: 400 },
      );
    }

    const result = await provisionTenant({
      name,
      slug,
      companyRut,
      ownerName,
      ownerEmail,
      ownerPassword,
      plan,
      trialDays,
    });

    // Set onboardedBy
    await prisma.tenant.update({
      where: { id: result.tenant.id },
      data: { onboardedBy: ctx.email },
    });

    return NextResponse.json(result, { status: 201 });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Error al crear tenant';
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
```

- [ ] **Step 2: Create tenant detail route**

```typescript
import { NextRequest, NextResponse } from 'next/server';
import { requirePlatformAuth, platformUnauthorized } from '@/lib/platform-api-auth';
import { prisma } from '@/lib/prisma';

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const ctx = await requirePlatformAuth();
  if (!ctx) return platformUnauthorized();

  const { id } = await params;

  const tenant = await prisma.tenant.findUnique({
    where: { id },
    include: {
      plan: true,
      modules: true,
      admins: {
        select: {
          id: true,
          name: true,
          email: true,
          role: true,
          status: true,
          lastLoginAt: true,
        },
      },
    },
  });

  if (!tenant) {
    return NextResponse.json({ error: 'Tenant no encontrado' }, { status: 404 });
  }

  const now = new Date();
  const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

  // Metrics
  const [activeGuards, totalGuards, marcaciones30d, documentos30d, rondas30d] =
    await Promise.all([
      prisma.opsGuardia.count({
        where: { tenantId: id, status: 'active' },
      }),
      prisma.opsGuardia.count({
        where: { tenantId: id },
      }),
      prisma.opsMarcacion.count({
        where: { tenantId: id, timestamp: { gte: thirtyDaysAgo } },
      }),
      prisma.document.count({
        where: { tenantId: id, createdAt: { gte: thirtyDaysAgo } },
      }),
      prisma.opsRondaEjecucion.count({
        where: { tenantId: id, startedAt: { gte: thirtyDaysAgo } },
      }),
    ]);

  // Count active puestos
  const activePuestos = await prisma.opsPuesto.count({
    where: { tenantId: id, active: true },
  });

  return NextResponse.json({
    tenant: {
      id: tenant.id,
      name: tenant.name,
      slug: tenant.slug,
      active: tenant.active,
      createdAt: tenant.createdAt.toISOString(),
      billingEmail: tenant.billingEmail,
      supportEmail: tenant.supportEmail,
      notes: tenant.notes,
      suspendedAt: tenant.suspendedAt?.toISOString() || null,
      suspendedReason: tenant.suspendedReason,
      onboardedBy: tenant.onboardedBy,
      lastActivityAt: tenant.lastActivityAt?.toISOString() || null,
    },
    plan: tenant.plan
      ? {
          plan: tenant.plan.plan,
          maxGuards: tenant.plan.maxGuards,
          maxAdmins: tenant.plan.maxAdmins,
          maxStorageMb: tenant.plan.maxStorageMb,
          basePrice: Number(tenant.plan.basePrice),
          pricePerGuard: Number(tenant.plan.pricePerGuard),
          currency: tenant.plan.currency,
          billingStatus: tenant.plan.billingStatus,
          trialEndsAt: tenant.plan.trialEndsAt?.toISOString() || null,
        }
      : null,
    modules: tenant.modules.map((m) => ({
      module: m.module,
      enabled: m.enabled,
    })),
    admins: tenant.admins.map((a) => ({
      id: a.id,
      name: a.name,
      email: a.email,
      role: a.role,
      status: a.status,
      lastLoginAt: a.lastLoginAt?.toISOString() || null,
    })),
    metrics: {
      activeGuards,
      totalGuards,
      activePuestos,
      marcaciones30d,
      documentos30d,
      rondas30d,
    },
  });
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const ctx = await requirePlatformAuth();
  if (!ctx) return platformUnauthorized();

  const { id } = await params;
  const body = await request.json();

  const allowedFields = ['name', 'billingEmail', 'supportEmail', 'notes', 'active'];
  const data: Record<string, unknown> = {};
  for (const field of allowedFields) {
    if (field in body) {
      data[field] = body[field];
    }
  }

  if (Object.keys(data).length === 0) {
    return NextResponse.json({ error: 'No hay campos para actualizar' }, { status: 400 });
  }

  await prisma.tenant.update({
    where: { id },
    data,
  });

  return NextResponse.json({ success: true });
}
```

- [ ] **Step 3: Commit**

```bash
git add src/app/api/platform/tenants/
git commit -m "feat: add platform tenants CRUD API routes"
```

---

## Task 9: Plan, Modules, Suspend API Routes

**Files:**
- Create: `src/app/api/platform/tenants/[id]/plan/route.ts`
- Create: `src/app/api/platform/tenants/[id]/modules/route.ts`
- Create: `src/app/api/platform/tenants/[id]/suspend/route.ts`

- [ ] **Step 1: Create plan update route**

```typescript
import { NextRequest, NextResponse } from 'next/server';
import { requirePlatformAuth, platformUnauthorized } from '@/lib/platform-api-auth';
import { prisma } from '@/lib/prisma';
import { PLAN_MODULES } from '@/lib/tenant-modules';

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const ctx = await requirePlatformAuth();
  if (!ctx) return platformUnauthorized();

  const { id } = await params;
  const body = await request.json();

  const existingPlan = await prisma.tenantPlan.findUnique({
    where: { tenantId: id },
  });

  if (!existingPlan) {
    return NextResponse.json({ error: 'Plan no encontrado' }, { status: 404 });
  }

  // Build update data
  const data: Record<string, unknown> = {};
  const fields = [
    'plan', 'maxGuards', 'maxAdmins', 'maxStorageMb',
    'basePrice', 'pricePerGuard', 'currency', 'billingStatus', 'trialEndsAt',
  ];
  for (const field of fields) {
    if (field in body) {
      data[field] = body[field];
    }
  }

  // If plan changed, auto-update modules
  if (body.plan && body.plan !== existingPlan.plan) {
    const newModules = PLAN_MODULES[body.plan] || [];

    // Disable all modules first
    await prisma.tenantModule.updateMany({
      where: { tenantId: id },
      data: { enabled: false },
    });

    // Enable modules for the new plan
    for (const mod of newModules) {
      await prisma.tenantModule.upsert({
        where: { tenantId_module: { tenantId: id, module: mod } },
        update: { enabled: true },
        create: { tenantId: id, module: mod, enabled: true },
      });
    }
  }

  const updated = await prisma.tenantPlan.update({
    where: { tenantId: id },
    data,
  });

  return NextResponse.json({
    success: true,
    plan: {
      plan: updated.plan,
      maxGuards: updated.maxGuards,
      maxAdmins: updated.maxAdmins,
      maxStorageMb: updated.maxStorageMb,
      basePrice: Number(updated.basePrice),
      pricePerGuard: Number(updated.pricePerGuard),
      currency: updated.currency,
      billingStatus: updated.billingStatus,
      trialEndsAt: updated.trialEndsAt?.toISOString() || null,
    },
  });
}
```

- [ ] **Step 2: Create modules toggle route**

```typescript
import { NextRequest, NextResponse } from 'next/server';
import { requirePlatformAuth, platformUnauthorized } from '@/lib/platform-api-auth';
import { prisma } from '@/lib/prisma';
import { clearTenantModuleCache } from '@/lib/tenant-modules';

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const ctx = await requirePlatformAuth();
  if (!ctx) return platformUnauthorized();

  const { id } = await params;
  const body = await request.json();
  const { module, enabled } = body;

  if (!module || typeof enabled !== 'boolean') {
    return NextResponse.json(
      { error: 'Se requiere module (string) y enabled (boolean)' },
      { status: 400 },
    );
  }

  await prisma.tenantModule.upsert({
    where: { tenantId_module: { tenantId: id, module } },
    update: { enabled },
    create: { tenantId: id, module, enabled },
  });

  // Invalidate cache
  clearTenantModuleCache(id);

  return NextResponse.json({ success: true });
}
```

- [ ] **Step 3: Create suspend/reactivate route**

```typescript
import { NextRequest, NextResponse } from 'next/server';
import { requirePlatformAuth, platformUnauthorized } from '@/lib/platform-api-auth';
import { prisma } from '@/lib/prisma';

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const ctx = await requirePlatformAuth();
  if (!ctx) return platformUnauthorized();

  const { id } = await params;
  const body = await request.json();
  const { reason } = body;

  if (!reason) {
    return NextResponse.json({ error: 'Se requiere una razón' }, { status: 400 });
  }

  await prisma.tenant.update({
    where: { id },
    data: {
      active: false,
      suspendedAt: new Date(),
      suspendedReason: reason,
    },
  });

  return NextResponse.json({ success: true });
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const ctx = await requirePlatformAuth();
  if (!ctx) return platformUnauthorized();

  const { id } = await params;

  await prisma.tenant.update({
    where: { id },
    data: {
      active: true,
      suspendedAt: null,
      suspendedReason: null,
    },
  });

  return NextResponse.json({ success: true });
}
```

- [ ] **Step 4: Commit**

```bash
git add src/app/api/platform/tenants/
git commit -m "feat: add platform API routes for plan, modules, and suspend"
```

---

## Task 10: Billing API Route

**Files:**
- Create: `src/app/api/platform/billing/route.ts`

- [ ] **Step 1: Create billing route**

```typescript
import { NextResponse } from 'next/server';
import { requirePlatformAuth, platformUnauthorized } from '@/lib/platform-api-auth';
import { prisma } from '@/lib/prisma';

export async function GET() {
  const ctx = await requirePlatformAuth();
  if (!ctx) return platformUnauthorized();

  const tenants = await prisma.tenant.findMany({
    where: { active: true },
    include: {
      plan: true,
    },
    orderBy: { name: 'asc' },
  });

  const tenantIds = tenants.map((t) => t.id);
  const guardCounts = await prisma.opsGuardia.groupBy({
    by: ['tenantId'],
    where: { tenantId: { in: tenantIds }, status: 'active' },
    _count: { id: true },
  });
  const guardMap = new Map(guardCounts.map((g) => [g.tenantId, g._count.id]));

  let mrr = 0;
  let totalGuards = 0;

  const billingTenants = tenants.map((t) => {
    const guards = guardMap.get(t.id) || 0;
    const basePrice = Number(t.plan?.basePrice || 0);
    const pricePerGuard = Number(t.plan?.pricePerGuard || 0);
    const monthlyTotal = basePrice + pricePerGuard * guards;

    if (t.plan?.billingStatus !== 'trial') {
      mrr += monthlyTotal;
    }
    totalGuards += guards;

    return {
      id: t.id,
      name: t.name,
      slug: t.slug,
      plan: t.plan?.plan || 'trial',
      billingStatus: t.plan?.billingStatus || 'trial',
      basePrice,
      pricePerGuard,
      activeGuards: guards,
      monthlyTotal: Math.round(monthlyTotal * 100) / 100,
      trialEndsAt: t.plan?.trialEndsAt?.toISOString() || null,
    };
  });

  return NextResponse.json({
    tenants: billingTenants,
    totals: {
      mrr: Math.round(mrr * 100) / 100,
      totalGuards,
      activeTenants: tenants.length,
    },
  });
}
```

- [ ] **Step 2: Commit**

```bash
git add src/app/api/platform/billing/route.ts
git commit -m "feat: add platform billing API route"
```

---

## Task 11: Dashboard Page

**Files:**
- Create: `src/components/platform/TenantTable.tsx`
- Create: `src/app/platform/dashboard/page.tsx`

- [ ] **Step 1: Create TenantTable component**

```tsx
'use client';

import { useState, useMemo } from 'react';
import Link from 'next/link';
import { Badge } from '@/components/ui/badge';

interface TenantRow {
  id: string;
  name: string;
  slug: string;
  plan: string;
  billingStatus: string;
  status: string;
  activeGuards: number;
  adminCount: number;
  lastLoginAt: string | null;
  createdAt: string;
  trialEndsAt: string | null;
  enabledModules: number;
  usagePct: number;
}

interface TenantTableProps {
  tenants: TenantRow[];
  onImpersonate: (tenantId: string) => void;
}

type SortKey = 'name' | 'plan' | 'status' | 'activeGuards' | 'lastLoginAt' | 'createdAt';

const planBadgeVariant: Record<string, string> = {
  trial: 'bg-amber-100 text-amber-700',
  essential: 'bg-gray-100 text-gray-700',
  professional: 'bg-blue-100 text-blue-700',
  enterprise: 'bg-purple-100 text-purple-700',
};

const statusBadgeVariant: Record<string, string> = {
  active: 'bg-emerald-100 text-emerald-700',
  trial: 'bg-amber-100 text-amber-700',
  suspended: 'bg-red-100 text-red-700',
};

function timeAgo(dateStr: string | null): string {
  if (!dateStr) return '—';
  const diff = Date.now() - new Date(dateStr).getTime();
  const hours = Math.floor(diff / (1000 * 60 * 60));
  if (hours < 1) return 'Hace menos de 1h';
  if (hours < 24) return `Hace ${hours}h`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `Hace ${days}d`;
  return `Hace ${Math.floor(days / 30)}m`;
}

function trialDaysLeft(trialEndsAt: string | null): string {
  if (!trialEndsAt) return '';
  const days = Math.ceil((new Date(trialEndsAt).getTime() - Date.now()) / (1000 * 60 * 60 * 24));
  if (days < 0) return '(vencido)';
  return `(${days}d)`;
}

export function TenantTable({ tenants, onImpersonate }: TenantTableProps) {
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [sortKey, setSortKey] = useState<SortKey>('createdAt');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');
  const [page, setPage] = useState(1);
  const perPage = 20;

  const handleSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc');
    } else {
      setSortKey(key);
      setSortOrder('asc');
    }
    setPage(1);
  };

  const filtered = useMemo(() => {
    let list = tenants;
    if (statusFilter !== 'all') {
      list = list.filter((t) => t.status === statusFilter);
    }
    list = [...list].sort((a, b) => {
      const av = a[sortKey] ?? '';
      const bv = b[sortKey] ?? '';
      if (av < bv) return sortOrder === 'asc' ? -1 : 1;
      if (av > bv) return sortOrder === 'asc' ? 1 : -1;
      return 0;
    });
    return list;
  }, [tenants, statusFilter, sortKey, sortOrder]);

  const totalPages = Math.ceil(filtered.length / perPage);
  const paginated = filtered.slice((page - 1) * perPage, page * perPage);

  const SortHeader = ({ label, field }: { label: string; field: SortKey }) => (
    <th
      className="cursor-pointer px-4 py-3 text-left text-xs font-medium uppercase text-gray-500 hover:text-gray-700"
      onClick={() => handleSort(field)}
    >
      {label} {sortKey === field && (sortOrder === 'asc' ? '↑' : '↓')}
    </th>
  );

  return (
    <div>
      {/* Filters */}
      <div className="mb-4 flex items-center gap-2">
        {['all', 'active', 'trial', 'suspended'].map((s) => (
          <button
            key={s}
            onClick={() => { setStatusFilter(s); setPage(1); }}
            className={`rounded-lg px-3 py-1.5 text-sm font-medium transition-colors ${
              statusFilter === s
                ? 'bg-gray-900 text-white'
                : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
            }`}
          >
            {s === 'all' ? 'Todos' : s === 'active' ? 'Activos' : s === 'trial' ? 'Trial' : 'Suspendidos'}
          </button>
        ))}
      </div>

      {/* Table */}
      <div className="overflow-x-auto rounded-xl border border-gray-200 bg-white">
        <table className="w-full text-sm">
          <thead className="border-b border-gray-200 bg-gray-50">
            <tr>
              <SortHeader label="Empresa" field="name" />
              <SortHeader label="Plan" field="plan" />
              <SortHeader label="Estado" field="status" />
              <SortHeader label="Guardias" field="activeGuards" />
              <th className="px-4 py-3 text-left text-xs font-medium uppercase text-gray-500">Uso 30d</th>
              <SortHeader label="Último login" field="lastLoginAt" />
              <th className="px-4 py-3 text-left text-xs font-medium uppercase text-gray-500">Acciones</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {paginated.map((t) => (
              <tr key={t.id} className="hover:bg-gray-50">
                <td className="px-4 py-3">
                  <div className="font-medium text-gray-900">{t.name}</div>
                  <div className="text-xs text-gray-500">{t.slug}</div>
                </td>
                <td className="px-4 py-3">
                  <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${planBadgeVariant[t.plan] || 'bg-gray-100 text-gray-700'}`}>
                    {t.plan}
                  </span>
                </td>
                <td className="px-4 py-3">
                  <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${statusBadgeVariant[t.status] || 'bg-gray-100 text-gray-700'}`}>
                    {t.status === 'trial' ? `trial ${trialDaysLeft(t.trialEndsAt)}` : t.status === 'active' ? 'activo' : 'suspendido'}
                  </span>
                </td>
                <td className="px-4 py-3 text-gray-700">{t.activeGuards}</td>
                <td className="px-4 py-3">
                  <div className="flex items-center gap-2">
                    <div className="h-2 w-20 rounded-full bg-gray-200">
                      <div
                        className="h-2 rounded-full bg-teal-500"
                        style={{ width: `${Math.min(100, t.usagePct)}%` }}
                      />
                    </div>
                    <span className="text-xs text-gray-500">{t.usagePct}%</span>
                  </div>
                </td>
                <td className="px-4 py-3 text-gray-500">{timeAgo(t.lastLoginAt)}</td>
                <td className="px-4 py-3">
                  <div className="flex items-center gap-2">
                    <Link
                      href={`/platform/tenants/${t.id}`}
                      className="text-xs font-medium text-teal-600 hover:text-teal-700"
                    >
                      Ver
                    </Link>
                    <Link
                      href={`/platform/tenants/${t.id}?tab=plan`}
                      className="text-xs font-medium text-gray-500 hover:text-gray-700"
                    >
                      Editar
                    </Link>
                    <button
                      onClick={() => onImpersonate(t.id)}
                      className="text-xs font-medium text-amber-600 hover:text-amber-700"
                    >
                      Entrar
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="mt-4 flex items-center justify-between">
          <div className="text-sm text-gray-500">
            {filtered.length} tenants
          </div>
          <div className="flex gap-1">
            {Array.from({ length: totalPages }, (_, i) => i + 1).map((p) => (
              <button
                key={p}
                onClick={() => setPage(p)}
                className={`rounded px-3 py-1 text-sm ${
                  page === p
                    ? 'bg-gray-900 text-white'
                    : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                }`}
              >
                {p}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Create dashboard page**

```tsx
'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { PlatformKpiCard } from '@/components/platform/PlatformKpiCard';
import { TenantTable } from '@/components/platform/TenantTable';

interface DashboardData {
  kpis: {
    activeTenants: number;
    activeTenantsGrowth: number;
    totalGuards: number;
    totalGuardsGrowthPct: number;
    estimatedMrr: number;
    expiringTrials: number;
  };
  tenants: Array<{
    id: string;
    name: string;
    slug: string;
    plan: string;
    billingStatus: string;
    status: string;
    activeGuards: number;
    adminCount: number;
    lastLoginAt: string | null;
    createdAt: string;
    trialEndsAt: string | null;
    enabledModules: number;
    usagePct: number;
  }>;
}

export default function PlatformDashboardPage() {
  const router = useRouter();
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch('/api/platform/dashboard')
      .then((res) => res.json())
      .then(setData)
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  const handleImpersonate = async (tenantId: string) => {
    if (!confirm('¿Entrar como administrador de este tenant?')) return;
    try {
      const res = await fetch(`/api/platform/tenants/${tenantId}/impersonate`, {
        method: 'POST',
      });
      const result = await res.json();
      if (result.success) {
        window.location.href = result.redirectTo || '/hub';
      }
    } catch (error) {
      console.error('Impersonate failed:', error);
    }
  };

  if (loading) {
    return (
      <div className="space-y-6">
        <h1 className="text-2xl font-bold text-gray-900">Dashboard</h1>
        <div className="grid grid-cols-4 gap-4">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="h-28 animate-pulse rounded-xl bg-gray-200" />
          ))}
        </div>
        <div className="h-96 animate-pulse rounded-xl bg-gray-200" />
      </div>
    );
  }

  if (!data) return <div>Error loading dashboard</div>;

  const { kpis } = data;

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-gray-900">Dashboard</h1>

      {/* KPIs */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <PlatformKpiCard
          label="Tenants activos"
          value={kpis.activeTenants}
          trend={{
            value: `+${kpis.activeTenantsGrowth} este mes`,
            positive: true,
          }}
        />
        <PlatformKpiCard
          label="Guardias totales"
          value={kpis.totalGuards}
          trend={{
            value: `${kpis.totalGuardsGrowthPct >= 0 ? '+' : ''}${kpis.totalGuardsGrowthPct}% vs mes anterior`,
            positive: kpis.totalGuardsGrowthPct >= 0,
          }}
        />
        <PlatformKpiCard
          label="MRR estimado"
          value={`$${kpis.estimatedMrr.toLocaleString()}`}
        />
        <PlatformKpiCard
          label="Trials por vencer"
          value={kpis.expiringTrials}
          warning={kpis.expiringTrials > 0}
        />
      </div>

      {/* Tenant Table */}
      <div>
        <h2 className="mb-4 text-lg font-semibold text-gray-900">Tenants</h2>
        <TenantTable tenants={data.tenants} onImpersonate={handleImpersonate} />
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Verify dashboard renders**

```bash
npm run dev
```

Open `http://localhost:3000/platform/login`, log in, verify dashboard shows KPI cards and tenant table.

- [ ] **Step 4: Commit**

```bash
git add src/components/platform/TenantTable.tsx src/app/platform/dashboard/
git commit -m "feat: add platform dashboard page with KPIs and tenant table"
```

---

## Task 12: Create Tenant Page

**Files:**
- Create: `src/components/platform/CreateTenantForm.tsx`
- Create: `src/app/platform/tenants/new/page.tsx`

- [ ] **Step 1: Create CreateTenantForm**

```tsx
'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

const generateSlug = (name: string) =>
  name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');

export function CreateTenantForm() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const [name, setName] = useState('');
  const [slug, setSlug] = useState('');
  const [companyRut, setCompanyRut] = useState('');
  const [ownerName, setOwnerName] = useState('');
  const [ownerEmail, setOwnerEmail] = useState('');
  const [ownerPassword, setOwnerPassword] = useState('');
  const [plan, setPlan] = useState<string>('trial');
  const [trialDays, setTrialDays] = useState(30);

  const handleNameChange = (value: string) => {
    setName(value);
    setSlug(generateSlug(value));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      const res = await fetch('/api/platform/tenants', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name,
          slug,
          companyRut: companyRut || undefined,
          ownerName,
          ownerEmail,
          ownerPassword,
          plan,
          trialDays: plan === 'trial' ? trialDays : undefined,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.error || 'Error al crear tenant');
        return;
      }

      router.push(`/platform/tenants/${data.tenant.id}`);
    } catch {
      setError('Error de conexión');
    } finally {
      setLoading(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="max-w-lg space-y-6">
      {/* Empresa */}
      <fieldset className="space-y-4 rounded-xl border border-gray-200 bg-white p-6">
        <legend className="px-2 text-sm font-semibold text-gray-700">Empresa</legend>
        <div>
          <label className="mb-1 block text-sm font-medium text-gray-700">
            Nombre de la empresa *
          </label>
          <input
            type="text"
            value={name}
            onChange={(e) => handleNameChange(e.target.value)}
            className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-teal-500 focus:outline-none focus:ring-1 focus:ring-teal-500"
            required
          />
        </div>
        <div>
          <label className="mb-1 block text-sm font-medium text-gray-700">
            Slug *
          </label>
          <input
            type="text"
            value={slug}
            onChange={(e) => setSlug(e.target.value)}
            pattern="^[a-z0-9-]+$"
            className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm font-mono focus:border-teal-500 focus:outline-none focus:ring-1 focus:ring-teal-500"
            required
          />
          <p className="mt-1 text-xs text-gray-500">Solo letras minúsculas, números y guiones</p>
        </div>
        <div>
          <label className="mb-1 block text-sm font-medium text-gray-700">RUT empresa</label>
          <input
            type="text"
            value={companyRut}
            onChange={(e) => setCompanyRut(e.target.value)}
            placeholder="76.111.222-3"
            className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-teal-500 focus:outline-none focus:ring-1 focus:ring-teal-500"
          />
        </div>
      </fieldset>

      {/* Admin owner */}
      <fieldset className="space-y-4 rounded-xl border border-gray-200 bg-white p-6">
        <legend className="px-2 text-sm font-semibold text-gray-700">Administrador Owner</legend>
        <div>
          <label className="mb-1 block text-sm font-medium text-gray-700">Nombre *</label>
          <input
            type="text"
            value={ownerName}
            onChange={(e) => setOwnerName(e.target.value)}
            className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-teal-500 focus:outline-none focus:ring-1 focus:ring-teal-500"
            required
          />
        </div>
        <div>
          <label className="mb-1 block text-sm font-medium text-gray-700">Email *</label>
          <input
            type="email"
            value={ownerEmail}
            onChange={(e) => setOwnerEmail(e.target.value)}
            className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-teal-500 focus:outline-none focus:ring-1 focus:ring-teal-500"
            required
          />
        </div>
        <div>
          <label className="mb-1 block text-sm font-medium text-gray-700">Contraseña temporal *</label>
          <input
            type="text"
            value={ownerPassword}
            onChange={(e) => setOwnerPassword(e.target.value)}
            minLength={8}
            className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-teal-500 focus:outline-none focus:ring-1 focus:ring-teal-500"
            required
          />
          <p className="mt-1 text-xs text-gray-500">Mínimo 8 caracteres</p>
        </div>
      </fieldset>

      {/* Plan */}
      <fieldset className="space-y-4 rounded-xl border border-gray-200 bg-white p-6">
        <legend className="px-2 text-sm font-semibold text-gray-700">Plan</legend>
        <div>
          <label className="mb-1 block text-sm font-medium text-gray-700">Plan *</label>
          <select
            value={plan}
            onChange={(e) => setPlan(e.target.value)}
            className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-teal-500 focus:outline-none focus:ring-1 focus:ring-teal-500"
          >
            <option value="trial">Trial</option>
            <option value="essential">Essential</option>
            <option value="professional">Professional</option>
            <option value="enterprise">Enterprise</option>
          </select>
        </div>
        {plan === 'trial' && (
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">Días de trial</label>
            <input
              type="number"
              value={trialDays}
              onChange={(e) => setTrialDays(parseInt(e.target.value) || 30)}
              min={1}
              max={90}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-teal-500 focus:outline-none focus:ring-1 focus:ring-teal-500"
            />
          </div>
        )}
      </fieldset>

      {error && (
        <div className="rounded-lg bg-red-50 px-4 py-3 text-sm text-red-600">{error}</div>
      )}

      <button
        type="submit"
        disabled={loading}
        className="w-full rounded-lg bg-teal-500 px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-teal-600 disabled:opacity-50"
      >
        {loading ? 'Creando...' : 'Crear Tenant'}
      </button>
    </form>
  );
}
```

- [ ] **Step 2: Create the page**

`src/app/platform/tenants/new/page.tsx`:

```tsx
import { CreateTenantForm } from '@/components/platform/CreateTenantForm';

export default function NewTenantPage() {
  return (
    <div>
      <h1 className="mb-6 text-2xl font-bold text-gray-900">Nuevo Tenant</h1>
      <CreateTenantForm />
    </div>
  );
}
```

- [ ] **Step 3: Commit**

```bash
git add src/components/platform/CreateTenantForm.tsx src/app/platform/tenants/new/
git commit -m "feat: add create tenant page with form"
```

---

## Task 13: Tenant Detail Page

**Files:**
- Create: `src/components/platform/TenantDetailTabs.tsx`
- Create: `src/app/platform/tenants/[tenantId]/page.tsx`

- [ ] **Step 1: Create TenantDetailTabs**

```tsx
'use client';

import { useState, useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { ALL_MODULES } from '@/lib/tenant-modules';

interface TenantDetail {
  tenant: {
    id: string;
    name: string;
    slug: string;
    active: boolean;
    createdAt: string;
    billingEmail: string | null;
    supportEmail: string | null;
    notes: string | null;
    suspendedAt: string | null;
    suspendedReason: string | null;
    onboardedBy: string | null;
    lastActivityAt: string | null;
  };
  plan: {
    plan: string;
    maxGuards: number;
    maxAdmins: number;
    maxStorageMb: number;
    basePrice: number;
    pricePerGuard: number;
    currency: string;
    billingStatus: string;
    trialEndsAt: string | null;
  } | null;
  modules: Array<{ module: string; enabled: boolean }>;
  admins: Array<{
    id: string;
    name: string;
    email: string;
    role: string;
    status: string;
    lastLoginAt: string | null;
  }>;
  metrics: {
    activeGuards: number;
    totalGuards: number;
    activePuestos: number;
    marcaciones30d: number;
    documentos30d: number;
    rondas30d: number;
  };
}

interface TenantDetailTabsProps {
  tenantId: string;
}

const tabs = [
  { key: 'info', label: 'Información' },
  { key: 'plan', label: 'Plan y Módulos' },
  { key: 'admins', label: 'Administradores' },
  { key: 'metrics', label: 'Métricas' },
];

function ProgressBar({ value, max, label }: { value: number; max: number; label: string }) {
  const pct = max > 0 ? Math.min(100, (value / max) * 100) : 0;
  return (
    <div>
      <div className="mb-1 flex justify-between text-sm">
        <span className="text-gray-600">{label}</span>
        <span className="font-medium text-gray-900">{value} / {max}</span>
      </div>
      <div className="h-2 rounded-full bg-gray-200">
        <div
          className={`h-2 rounded-full ${pct > 90 ? 'bg-red-500' : pct > 70 ? 'bg-amber-500' : 'bg-teal-500'}`}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}

export function TenantDetailTabs({ tenantId }: TenantDetailTabsProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [activeTab, setActiveTab] = useState(searchParams.get('tab') || 'info');
  const [data, setData] = useState<TenantDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    fetch(`/api/platform/tenants/${tenantId}`)
      .then((r) => r.json())
      .then(setData)
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [tenantId]);

  const updateTenant = async (fields: Record<string, unknown>) => {
    setSaving(true);
    try {
      await fetch(`/api/platform/tenants/${tenantId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(fields),
      });
      // Refresh data
      const res = await fetch(`/api/platform/tenants/${tenantId}`);
      setData(await res.json());
    } finally {
      setSaving(false);
    }
  };

  const updatePlan = async (fields: Record<string, unknown>) => {
    setSaving(true);
    try {
      await fetch(`/api/platform/tenants/${tenantId}/plan`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(fields),
      });
      const res = await fetch(`/api/platform/tenants/${tenantId}`);
      setData(await res.json());
    } finally {
      setSaving(false);
    }
  };

  const toggleModule = async (module: string, enabled: boolean) => {
    await fetch(`/api/platform/tenants/${tenantId}/modules`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ module, enabled }),
    });
    const res = await fetch(`/api/platform/tenants/${tenantId}`);
    setData(await res.json());
  };

  const handleSuspend = async () => {
    const reason = prompt('Razón de la suspensión:');
    if (!reason) return;
    await fetch(`/api/platform/tenants/${tenantId}/suspend`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ reason }),
    });
    const res = await fetch(`/api/platform/tenants/${tenantId}`);
    setData(await res.json());
  };

  const handleReactivate = async () => {
    if (!confirm('¿Reactivar este tenant?')) return;
    await fetch(`/api/platform/tenants/${tenantId}/suspend`, {
      method: 'DELETE',
    });
    const res = await fetch(`/api/platform/tenants/${tenantId}`);
    setData(await res.json());
  };

  if (loading) {
    return <div className="h-96 animate-pulse rounded-xl bg-gray-200" />;
  }

  if (!data) return <div>Error loading tenant</div>;

  const { tenant, plan, modules, admins, metrics } = data;
  const moduleMap = new Map(modules.map((m) => [m.module, m.enabled]));

  return (
    <div>
      {/* Tabs */}
      <div className="mb-6 flex gap-1 border-b border-gray-200">
        {tabs.map((tab) => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            className={`border-b-2 px-4 py-2.5 text-sm font-medium transition-colors ${
              activeTab === tab.key
                ? 'border-teal-500 text-teal-600'
                : 'border-transparent text-gray-500 hover:text-gray-700'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Tab Content */}
      {activeTab === 'info' && (
        <div className="space-y-6">
          <div className="rounded-xl border border-gray-200 bg-white p-6">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <div className="text-sm text-gray-500">Nombre</div>
                <div className="font-medium">{tenant.name}</div>
              </div>
              <div>
                <div className="text-sm text-gray-500">Slug</div>
                <div className="font-mono text-sm">{tenant.slug}</div>
              </div>
              <div>
                <div className="text-sm text-gray-500">Estado</div>
                <div className={`font-medium ${tenant.active ? 'text-emerald-600' : 'text-red-600'}`}>
                  {tenant.active ? 'Activo' : 'Suspendido'}
                </div>
              </div>
              <div>
                <div className="text-sm text-gray-500">Creado</div>
                <div className="text-sm">{new Date(tenant.createdAt).toLocaleDateString('es-CL')}</div>
              </div>
              {tenant.suspendedReason && (
                <div className="col-span-2">
                  <div className="text-sm text-gray-500">Razón de suspensión</div>
                  <div className="text-sm text-red-600">{tenant.suspendedReason}</div>
                </div>
              )}
              {tenant.onboardedBy && (
                <div>
                  <div className="text-sm text-gray-500">Onboarded por</div>
                  <div className="text-sm">{tenant.onboardedBy}</div>
                </div>
              )}
            </div>
          </div>

          {/* Editable fields */}
          <div className="rounded-xl border border-gray-200 bg-white p-6">
            <h3 className="mb-4 text-sm font-semibold text-gray-700">Contacto y Notas</h3>
            <div className="space-y-4">
              <EditableField
                label="Email de facturación"
                value={tenant.billingEmail || ''}
                onSave={(v) => updateTenant({ billingEmail: v || null })}
                saving={saving}
              />
              <EditableField
                label="Email de soporte"
                value={tenant.supportEmail || ''}
                onSave={(v) => updateTenant({ supportEmail: v || null })}
                saving={saving}
              />
              <EditableField
                label="Notas"
                value={tenant.notes || ''}
                onSave={(v) => updateTenant({ notes: v || null })}
                saving={saving}
                multiline
              />
            </div>
          </div>

          {/* Actions */}
          <div className="flex gap-3">
            {tenant.active ? (
              <button
                onClick={handleSuspend}
                className="rounded-lg bg-red-50 px-4 py-2 text-sm font-medium text-red-600 hover:bg-red-100"
              >
                Suspender tenant
              </button>
            ) : (
              <button
                onClick={handleReactivate}
                className="rounded-lg bg-emerald-50 px-4 py-2 text-sm font-medium text-emerald-600 hover:bg-emerald-100"
              >
                Reactivar tenant
              </button>
            )}
          </div>
        </div>
      )}

      {activeTab === 'plan' && plan && (
        <div className="space-y-6">
          {/* Plan info */}
          <div className="rounded-xl border border-gray-200 bg-white p-6">
            <h3 className="mb-4 text-sm font-semibold text-gray-700">Plan actual</h3>
            <div className="mb-4 flex items-center gap-3">
              <span className="rounded-full bg-teal-100 px-3 py-1 text-sm font-medium text-teal-700">
                {plan.plan}
              </span>
              <span className="text-sm text-gray-500">{plan.billingStatus}</span>
            </div>

            {/* Change plan */}
            <div className="flex gap-2">
              {['trial', 'essential', 'professional', 'enterprise'].map((p) => (
                <button
                  key={p}
                  onClick={() => updatePlan({ plan: p })}
                  disabled={plan.plan === p || saving}
                  className={`rounded-lg px-3 py-1.5 text-xs font-medium ${
                    plan.plan === p
                      ? 'bg-gray-900 text-white'
                      : 'bg-gray-100 text-gray-600 hover:bg-gray-200 disabled:opacity-50'
                  }`}
                >
                  {p}
                </button>
              ))}
            </div>
          </div>

          {/* Limits */}
          <div className="rounded-xl border border-gray-200 bg-white p-6">
            <h3 className="mb-4 text-sm font-semibold text-gray-700">Límites</h3>
            <div className="grid grid-cols-3 gap-4">
              <EditableNumberField
                label="Max Guardias"
                value={plan.maxGuards}
                onSave={(v) => updatePlan({ maxGuards: v })}
                saving={saving}
              />
              <EditableNumberField
                label="Max Admins"
                value={plan.maxAdmins}
                onSave={(v) => updatePlan({ maxAdmins: v })}
                saving={saving}
              />
              <EditableNumberField
                label="Max Storage (MB)"
                value={plan.maxStorageMb}
                onSave={(v) => updatePlan({ maxStorageMb: v })}
                saving={saving}
              />
            </div>
          </div>

          {/* Pricing */}
          <div className="rounded-xl border border-gray-200 bg-white p-6">
            <h3 className="mb-4 text-sm font-semibold text-gray-700">Pricing</h3>
            <div className="grid grid-cols-3 gap-4">
              <EditableNumberField
                label="Base Price"
                value={plan.basePrice}
                onSave={(v) => updatePlan({ basePrice: v })}
                saving={saving}
              />
              <EditableNumberField
                label="Price Per Guard"
                value={plan.pricePerGuard}
                onSave={(v) => updatePlan({ pricePerGuard: v })}
                saving={saving}
              />
              <div>
                <div className="mb-1 text-sm text-gray-500">Currency</div>
                <div className="text-sm font-medium">{plan.currency}</div>
              </div>
            </div>
          </div>

          {/* Modules */}
          <div className="rounded-xl border border-gray-200 bg-white p-6">
            <h3 className="mb-4 text-sm font-semibold text-gray-700">Módulos</h3>
            <div className="grid grid-cols-2 gap-3">
              {ALL_MODULES.map((mod) => (
                <label
                  key={mod}
                  className="flex items-center justify-between rounded-lg border border-gray-100 px-3 py-2"
                >
                  <span className="text-sm text-gray-700">{mod.replace(/_/g, ' ')}</span>
                  <input
                    type="checkbox"
                    checked={moduleMap.get(mod) ?? false}
                    onChange={(e) => toggleModule(mod, e.target.checked)}
                    className="h-4 w-4 rounded border-gray-300 text-teal-500 focus:ring-teal-500"
                  />
                </label>
              ))}
            </div>
          </div>
        </div>
      )}

      {activeTab === 'admins' && (
        <div className="rounded-xl border border-gray-200 bg-white">
          <table className="w-full text-sm">
            <thead className="border-b border-gray-200 bg-gray-50">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-medium uppercase text-gray-500">Nombre</th>
                <th className="px-4 py-3 text-left text-xs font-medium uppercase text-gray-500">Email</th>
                <th className="px-4 py-3 text-left text-xs font-medium uppercase text-gray-500">Rol</th>
                <th className="px-4 py-3 text-left text-xs font-medium uppercase text-gray-500">Estado</th>
                <th className="px-4 py-3 text-left text-xs font-medium uppercase text-gray-500">Último login</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {admins.map((admin) => (
                <tr key={admin.id}>
                  <td className="px-4 py-3 font-medium text-gray-900">{admin.name}</td>
                  <td className="px-4 py-3 text-gray-600">{admin.email}</td>
                  <td className="px-4 py-3">
                    <span className="rounded-full bg-gray-100 px-2 py-0.5 text-xs font-medium text-gray-700">
                      {admin.role}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                      admin.status === 'active' ? 'bg-emerald-100 text-emerald-700' : 'bg-gray-100 text-gray-500'
                    }`}>
                      {admin.status}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-gray-500">
                    {admin.lastLoginAt
                      ? new Date(admin.lastLoginAt).toLocaleDateString('es-CL')
                      : '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {activeTab === 'metrics' && (
        <div className="space-y-6">
          <div className="rounded-xl border border-gray-200 bg-white p-6">
            <h3 className="mb-4 text-sm font-semibold text-gray-700">Uso vs Límites</h3>
            <div className="space-y-4">
              <ProgressBar
                label="Guardias activos"
                value={metrics.activeGuards}
                max={plan?.maxGuards || 50}
              />
              <ProgressBar
                label="Admins activos"
                value={admins.filter((a) => a.status === 'active').length}
                max={plan?.maxAdmins || 3}
              />
            </div>
          </div>
          <div className="rounded-xl border border-gray-200 bg-white p-6">
            <h3 className="mb-4 text-sm font-semibold text-gray-700">Actividad últimos 30 días</h3>
            <div className="grid grid-cols-3 gap-6">
              <div>
                <div className="text-2xl font-bold text-gray-900">{metrics.marcaciones30d}</div>
                <div className="text-sm text-gray-500">Marcaciones</div>
              </div>
              <div>
                <div className="text-2xl font-bold text-gray-900">{metrics.documentos30d}</div>
                <div className="text-sm text-gray-500">Documentos</div>
              </div>
              <div>
                <div className="text-2xl font-bold text-gray-900">{metrics.rondas30d}</div>
                <div className="text-sm text-gray-500">Rondas</div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// --- Helper components ---

function EditableField({
  label,
  value,
  onSave,
  saving,
  multiline,
}: {
  label: string;
  value: string;
  onSave: (v: string) => void;
  saving: boolean;
  multiline?: boolean;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);

  const handleSave = () => {
    onSave(draft);
    setEditing(false);
  };

  if (!editing) {
    return (
      <div className="flex items-start justify-between">
        <div>
          <div className="text-sm text-gray-500">{label}</div>
          <div className="text-sm text-gray-900">{value || '—'}</div>
        </div>
        <button
          onClick={() => { setDraft(value); setEditing(true); }}
          className="text-xs text-teal-600 hover:text-teal-700"
        >
          Editar
        </button>
      </div>
    );
  }

  return (
    <div>
      <div className="mb-1 text-sm text-gray-500">{label}</div>
      {multiline ? (
        <textarea
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          rows={3}
          className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-teal-500 focus:outline-none"
        />
      ) : (
        <input
          type="text"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-teal-500 focus:outline-none"
        />
      )}
      <div className="mt-2 flex gap-2">
        <button
          onClick={handleSave}
          disabled={saving}
          className="rounded bg-teal-500 px-3 py-1 text-xs text-white hover:bg-teal-600 disabled:opacity-50"
        >
          Guardar
        </button>
        <button
          onClick={() => setEditing(false)}
          className="rounded bg-gray-100 px-3 py-1 text-xs text-gray-600 hover:bg-gray-200"
        >
          Cancelar
        </button>
      </div>
    </div>
  );
}

function EditableNumberField({
  label,
  value,
  onSave,
  saving,
}: {
  label: string;
  value: number;
  onSave: (v: number) => void;
  saving: boolean;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(String(value));

  const handleSave = () => {
    onSave(parseFloat(draft) || 0);
    setEditing(false);
  };

  if (!editing) {
    return (
      <div
        className="cursor-pointer rounded-lg border border-transparent p-2 hover:border-gray-200"
        onClick={() => { setDraft(String(value)); setEditing(true); }}
      >
        <div className="text-sm text-gray-500">{label}</div>
        <div className="text-lg font-semibold text-gray-900">{value}</div>
      </div>
    );
  }

  return (
    <div className="rounded-lg border border-teal-200 p-2">
      <div className="mb-1 text-sm text-gray-500">{label}</div>
      <input
        type="number"
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        className="w-full rounded border border-gray-300 px-2 py-1 text-sm focus:border-teal-500 focus:outline-none"
        autoFocus
        onKeyDown={(e) => {
          if (e.key === 'Enter') handleSave();
          if (e.key === 'Escape') setEditing(false);
        }}
      />
      <div className="mt-1 flex gap-1">
        <button
          onClick={handleSave}
          disabled={saving}
          className="rounded bg-teal-500 px-2 py-0.5 text-xs text-white"
        >
          OK
        </button>
        <button
          onClick={() => setEditing(false)}
          className="rounded bg-gray-100 px-2 py-0.5 text-xs text-gray-600"
        >
          ✕
        </button>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Create tenant detail page**

`src/app/platform/tenants/[tenantId]/page.tsx`:

```tsx
'use client';

import { use } from 'react';
import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import { TenantDetailTabs } from '@/components/platform/TenantDetailTabs';

export default function TenantDetailPage({
  params,
}: {
  params: Promise<{ tenantId: string }>;
}) {
  const { tenantId } = use(params);

  return (
    <div>
      <div className="mb-6">
        <Link
          href="/platform/dashboard"
          className="mb-2 inline-flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700"
        >
          <ArrowLeft className="h-4 w-4" />
          Volver al dashboard
        </Link>
        <h1 className="text-2xl font-bold text-gray-900">Detalle del Tenant</h1>
      </div>
      <TenantDetailTabs tenantId={tenantId} />
    </div>
  );
}
```

- [ ] **Step 3: Commit**

```bash
git add src/components/platform/TenantDetailTabs.tsx src/app/platform/tenants/
git commit -m "feat: add tenant detail page with tabs (info, plan, admins, metrics)"
```

---

## Task 14: Impersonate — Auth Changes + API + Banner

**Files:**
- Modify: `src/lib/auth.ts:36-47` (JWT type), `src/lib/auth.ts:52-127` (authorize), `src/lib/auth.ts:129-186` (callbacks)
- Create: `src/app/api/platform/tenants/[id]/impersonate/route.ts`
- Create: `src/app/api/platform/impersonate/route.ts`
- Create: `src/components/platform/ImpersonateBanner.tsx`
- Modify: `src/app/(app)/layout.tsx`

- [ ] **Step 1: Extend JWT type in auth.ts**

In `src/lib/auth.ts`, add to the `@auth/core/jwt` JWT interface declaration (lines 36-47):

```typescript
// Add these two fields inside the JWT interface, after the portal field (line 43):
    /** True when a platform admin is impersonating this user */
    impersonating?: boolean;
    /** Email of the platform admin who initiated the impersonation */
    impersonatingFrom?: string;
```

Also extend the `Session` interface (lines 23-33) to expose `impersonating`:

```typescript
// Add inside Session interface, after portal:
    impersonating?: boolean;
```

- [ ] **Step 2: Add impersonate support to authorize callback**

In `src/lib/auth.ts`, inside the `authorize` function (line 61), add an impersonate path before the DT inspector check (before line 69):

```typescript
        // 0. Impersonate flow (platform admin → tenant owner)
        if (credentials.__impersonate === 'true') {
          const impersonateSecret = process.env.PLATFORM_IMPERSONATE_SECRET;
          if (!impersonateSecret || credentials.__secret !== impersonateSecret) {
            return null;
          }
          const adminId = String(credentials.__adminId);
          const admin = await prisma.admin.findUnique({
            where: { id: adminId },
            include: { tenant: true },
          });
          if (!admin) return null;
          return {
            id: admin.id,
            email: admin.email,
            name: admin.name,
            role: admin.role,
            roleTemplateId: admin.roleTemplateId,
            tenantId: admin.tenantId,
            portal: 'opai',
            // These will be picked up by the jwt callback
            impersonating: true,
            impersonatingFrom: String(credentials.__fromEmail || ''),
          } as any; // eslint-disable-line @typescript-eslint/no-explicit-any
        }
```

- [ ] **Step 3: Pass impersonate fields in JWT callback**

In `src/lib/auth.ts`, inside the `jwt` callback (line 130), in the `if (user)` block, add after `token.roleRefreshedAt = Date.now();` (line 138):

```typescript
        token.impersonating = (user as any).impersonating || false;
        token.impersonatingFrom = (user as any).impersonatingFrom || undefined;
```

- [ ] **Step 4: Expose impersonating in session callback**

In `src/lib/auth.ts`, inside the `session` callback (line 177), add after `session.portal = token.portal;` (line 184):

```typescript
      session.impersonating = token.impersonating || false;
```

- [ ] **Step 5: Create impersonate API route**

`src/app/api/platform/tenants/[id]/impersonate/route.ts`:

```typescript
import { NextRequest, NextResponse } from 'next/server';
import { requirePlatformAuth, platformUnauthorized } from '@/lib/platform-api-auth';
import { prisma } from '@/lib/prisma';
import { signIn } from '@/lib/auth';

export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const ctx = await requirePlatformAuth();
  if (!ctx) return platformUnauthorized();

  const { id } = await params;

  // Find the tenant's owner admin
  const owner = await prisma.admin.findFirst({
    where: { tenantId: id, role: 'owner', status: 'active' },
    include: { tenant: true },
  });

  if (!owner) {
    return NextResponse.json(
      { error: 'No se encontró un admin owner activo para este tenant' },
      { status: 404 },
    );
  }

  // Log the impersonation
  console.log(
    `[IMPERSONATE] Platform admin ${ctx.email} (${ctx.platformAdminId}) → tenant "${owner.tenant.name}" as ${owner.email}`,
  );

  try {
    // Use NextAuth signIn with impersonate credentials
    await signIn('credentials', {
      email: owner.email,
      password: 'unused',
      portal: 'opai',
      __impersonate: 'true',
      __secret: process.env.PLATFORM_IMPERSONATE_SECRET,
      __adminId: owner.id,
      __fromEmail: ctx.email,
      redirect: false,
    });

    return NextResponse.json({
      success: true,
      redirectTo: '/hub',
      tenantName: owner.tenant.name,
    });
  } catch (error) {
    console.error('[IMPERSONATE] Failed:', error);
    return NextResponse.json(
      { error: 'Error al crear sesión de impersonate' },
      { status: 500 },
    );
  }
}
```

- [ ] **Step 6: Create end-impersonate API route**

`src/app/api/platform/impersonate/route.ts`:

```typescript
import { NextResponse } from 'next/server';
import { signOut } from '@/lib/auth';

export async function DELETE() {
  try {
    await signOut({ redirect: false });
    return NextResponse.json({ success: true });
  } catch {
    // Cookie will be cleared anyway
    return NextResponse.json({ success: true });
  }
}
```

- [ ] **Step 7: Create ImpersonateBanner**

```tsx
'use client';

import { useRouter } from 'next/navigation';

interface ImpersonateBannerProps {
  tenantName?: string;
}

export function ImpersonateBanner({ tenantName }: ImpersonateBannerProps) {
  const router = useRouter();

  const handleExit = async () => {
    await fetch('/api/platform/impersonate', { method: 'DELETE' });
    window.location.href = '/platform/dashboard';
  };

  return (
    <div className="flex items-center justify-center gap-3 bg-amber-400 px-4 py-2 text-sm font-medium text-amber-900">
      <span>Sesión de soporte{tenantName ? ` en ${tenantName}` : ''}</span>
      <button
        onClick={handleExit}
        className="rounded bg-amber-600 px-3 py-0.5 text-xs font-semibold text-white hover:bg-amber-700"
      >
        Salir
      </button>
    </div>
  );
}
```

- [ ] **Step 8: Add ImpersonateBanner to app layout**

In `src/app/(app)/layout.tsx`, add the banner. Import at the top:

```typescript
import { ImpersonateBanner } from '@/components/platform/ImpersonateBanner';
```

Then wrap the return in the `AppLayout` function to add the banner conditionally. Replace the return statement with:

```tsx
  const isImpersonating = (session as any).impersonating === true;

  return (
    <>
      {isImpersonating && <ImpersonateBanner />}
      <PermissionsProvider permissions={permissions}>
        <AppLayoutClient
          userName={dbUser?.name ?? session.user?.name}
          userEmail={dbUser?.email ?? session.user?.email}
          userRole={session.user.role}
          permissions={permissions}
          currentUserId={session.user.id}
          tenantId={session.user.tenantId}
        >
          {children}
        </AppLayoutClient>
      </PermissionsProvider>
    </>
  );
```

- [ ] **Step 9: Commit**

```bash
git add src/lib/auth.ts src/app/api/platform/tenants/*/impersonate/ src/app/api/platform/impersonate/ src/components/platform/ImpersonateBanner.tsx src/app/\(app\)/layout.tsx
git commit -m "feat: add impersonate flow with NextAuth signIn and amber banner"
```

---

## Task 15: Billing Page

**Files:**
- Create: `src/app/platform/billing/page.tsx`

- [ ] **Step 1: Create billing page**

```tsx
'use client';

import { useEffect, useState } from 'react';

interface BillingTenant {
  id: string;
  name: string;
  slug: string;
  plan: string;
  billingStatus: string;
  basePrice: number;
  pricePerGuard: number;
  activeGuards: number;
  monthlyTotal: number;
  trialEndsAt: string | null;
}

interface BillingData {
  tenants: BillingTenant[];
  totals: {
    mrr: number;
    totalGuards: number;
    activeTenants: number;
  };
}

export default function BillingPage() {
  const [data, setData] = useState<BillingData | null>(null);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<string>('all');

  useEffect(() => {
    fetch('/api/platform/billing')
      .then((r) => r.json())
      .then(setData)
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  const exportCsv = () => {
    if (!data) return;
    const headers = ['Tenant', 'Slug', 'Plan', 'Estado', 'Base Price', 'Price/Guard', 'Guards', 'Total Mensual'];
    const rows = filtered.map((t) => [
      t.name, t.slug, t.plan, t.billingStatus,
      t.basePrice, t.pricePerGuard, t.activeGuards, t.monthlyTotal,
    ]);
    const csv = [headers, ...rows].map((r) => r.join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `opai-billing-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  if (loading) {
    return (
      <div>
        <h1 className="mb-6 text-2xl font-bold text-gray-900">Facturación</h1>
        <div className="h-96 animate-pulse rounded-xl bg-gray-200" />
      </div>
    );
  }

  if (!data) return <div>Error loading billing data</div>;

  const filtered =
    filter === 'all'
      ? data.tenants
      : data.tenants.filter((t) => t.billingStatus === filter);

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900">Facturación</h1>
        <button
          onClick={exportCsv}
          className="rounded-lg bg-gray-100 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-200"
        >
          Exportar CSV
        </button>
      </div>

      {/* Filters */}
      <div className="mb-4 flex items-center gap-2">
        {['all', 'trial', 'active', 'past_due', 'suspended'].map((s) => (
          <button
            key={s}
            onClick={() => setFilter(s)}
            className={`rounded-lg px-3 py-1.5 text-sm font-medium transition-colors ${
              filter === s
                ? 'bg-gray-900 text-white'
                : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
            }`}
          >
            {s === 'all' ? 'Todos' : s === 'past_due' ? 'Past Due' : s.charAt(0).toUpperCase() + s.slice(1)}
          </button>
        ))}
      </div>

      {/* Table */}
      <div className="overflow-x-auto rounded-xl border border-gray-200 bg-white">
        <table className="w-full text-sm">
          <thead className="border-b border-gray-200 bg-gray-50">
            <tr>
              <th className="px-4 py-3 text-left text-xs font-medium uppercase text-gray-500">Tenant</th>
              <th className="px-4 py-3 text-left text-xs font-medium uppercase text-gray-500">Plan</th>
              <th className="px-4 py-3 text-left text-xs font-medium uppercase text-gray-500">Estado</th>
              <th className="px-4 py-3 text-right text-xs font-medium uppercase text-gray-500">Base Price</th>
              <th className="px-4 py-3 text-right text-xs font-medium uppercase text-gray-500">$/Guard</th>
              <th className="px-4 py-3 text-right text-xs font-medium uppercase text-gray-500">Guardias</th>
              <th className="px-4 py-3 text-right text-xs font-medium uppercase text-gray-500">Total Mensual</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {filtered.map((t) => (
              <tr key={t.id} className="hover:bg-gray-50">
                <td className="px-4 py-3">
                  <div className="font-medium text-gray-900">{t.name}</div>
                  <div className="text-xs text-gray-500">{t.slug}</div>
                </td>
                <td className="px-4 py-3">
                  <span className="rounded-full bg-gray-100 px-2 py-0.5 text-xs font-medium text-gray-700">
                    {t.plan}
                  </span>
                </td>
                <td className="px-4 py-3">
                  <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                    t.billingStatus === 'active' ? 'bg-emerald-100 text-emerald-700' :
                    t.billingStatus === 'trial' ? 'bg-amber-100 text-amber-700' :
                    t.billingStatus === 'past_due' ? 'bg-red-100 text-red-700' :
                    'bg-gray-100 text-gray-500'
                  }`}>
                    {t.billingStatus}
                  </span>
                </td>
                <td className="px-4 py-3 text-right text-gray-700">${t.basePrice}</td>
                <td className="px-4 py-3 text-right text-gray-700">${t.pricePerGuard}</td>
                <td className="px-4 py-3 text-right text-gray-700">{t.activeGuards}</td>
                <td className="px-4 py-3 text-right font-medium text-gray-900">
                  ${t.monthlyTotal.toLocaleString()}
                </td>
              </tr>
            ))}
          </tbody>
          {/* Footer totals */}
          <tfoot className="border-t-2 border-gray-300 bg-gray-50">
            <tr>
              <td className="px-4 py-3 font-semibold text-gray-900" colSpan={5}>
                Totales ({data.totals.activeTenants} tenants activos)
              </td>
              <td className="px-4 py-3 text-right font-semibold text-gray-900">
                {data.totals.totalGuards}
              </td>
              <td className="px-4 py-3 text-right font-semibold text-gray-900">
                ${data.totals.mrr.toLocaleString()}
              </td>
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add src/app/platform/billing/
git commit -m "feat: add platform billing page with CSV export"
```

---

## Task 16: Verify Full Flow

- [ ] **Step 1: Start dev server**

```bash
npm run dev
```

- [ ] **Step 2: Test login flow**

1. Navigate to `http://localhost:3000/platform/login`
2. Login with `carlos.irigoyen@opai.cl` / `OpaiPlatform2026!`
3. Verify redirect to `/platform/dashboard`

- [ ] **Step 3: Test dashboard**

1. Verify 4 KPI cards render
2. Verify tenant table shows existing tenants
3. Verify filter buttons work (Todos/Activos/Trial/Suspendidos)
4. Verify sort by clicking column headers

- [ ] **Step 4: Test create tenant**

1. Click "Nuevo Tenant" in sidebar
2. Fill form: name="Test Company", verify slug auto-generates
3. Fill owner details and select plan
4. Submit and verify redirect to tenant detail

- [ ] **Step 5: Test tenant detail**

1. Click "Ver" on a tenant in dashboard table
2. Verify all 4 tabs render: Info, Plan y Módulos, Administradores, Métricas
3. Test inline editing of billing email
4. Test changing plan (verify modules auto-update)
5. Test toggling a module on/off

- [ ] **Step 6: Test billing page**

1. Click "Facturación" in sidebar
2. Verify billing table renders with totals
3. Test CSV export button

- [ ] **Step 7: Test impersonate (if applicable)**

1. Click "Entrar" on a tenant from dashboard
2. Verify amber banner appears at top of tenant app
3. Click "Salir" in banner → verify return to platform dashboard

- [ ] **Step 8: Test existing app unaffected**

1. Navigate to `http://localhost:3000/opai/login`
2. Login as normal tenant admin
3. Verify all existing routes work normally
4. Verify no platform-related UI appears

- [ ] **Step 9: Final commit**

```bash
git add -A
git commit -m "feat: complete Platform Admin portal implementation"
```

---

## Summary

| Task | Description | Est. |
|------|-------------|------|
| 1 | Schema + Migration + Seed | 5 min |
| 2 | Platform Auth (JWT Cookie) | 5 min |
| 3 | Auth API Route | 3 min |
| 4 | Middleware | 3 min |
| 5 | UI Components (Sidebar + KPI Card) | 5 min |
| 6 | Layout + Login Page | 5 min |
| 7 | Dashboard API Route | 5 min |
| 8 | Tenants CRUD API | 5 min |
| 9 | Plan, Modules, Suspend API | 5 min |
| 10 | Billing API Route | 3 min |
| 11 | Dashboard Page + TenantTable | 5 min |
| 12 | Create Tenant Page | 5 min |
| 13 | Tenant Detail Page + Tabs | 5 min |
| 14 | Impersonate (Auth + API + Banner) | 10 min |
| 15 | Billing Page | 5 min |
| 16 | Verify Full Flow | 10 min |
