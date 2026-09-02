/**
 * Auth.js v5 (NextAuth v5) - Gard Docs
 * Credentials con tabla Admin (bcrypt) + tenantId en sesión
 *
 * Prisma se carga solo en Node (authorize, jwt refresh). En Edge (middleware)
 * no se usa Prisma para evitar "Prisma Client on edge runtime".
 */

import NextAuth, { CredentialsSignin } from 'next-auth';
import Credentials from 'next-auth/providers/credentials';
import Google from 'next-auth/providers/google';
import * as bcrypt from 'bcryptjs';
import {
  hasAllTenantModules,
  TENANT_MODULES_ALL_SENTINEL,
  type TenantModuleKey,
  type TenantModulesToken,
} from '@/lib/tenant-modules';
import { googleAdminLookupPlan } from '@/lib/auth-google-admin';

function throwCredentials(code: string): never {
  const err = new CredentialsSignin();
  err.code = code;
  throw err;
}

function throwTenantSuspended(): never {
  throwCredentials('tenant_suspended');
}

function throwTenantCancelled(): never {
  throwCredentials('tenant_cancelled');
}

type AccessMode = 'full' | 'read_only' | 'blocked';

async function resolveTokenAccess(tenantId: string): Promise<{
  accessMode: AccessMode;
  bannerKey?: string;
  accessDaysLeft?: number;
  blocked: boolean;
  blockedCode: 'tenant_suspended' | 'tenant_cancelled' | null;
}> {
  try {
    const { resolveTenantAccess } = await import('@/lib/platform/tenant-lifecycle');
    const access = await resolveTenantAccess(tenantId);
    const blocked = access.mode === 'blocked';
    return {
      accessMode: access.mode,
      bannerKey: access.bannerKey,
      accessDaysLeft: access.daysLeft,
      blocked,
      blockedCode: blocked
        ? access.state === 'cancelled'
          ? 'tenant_cancelled'
          : 'tenant_suspended'
        : null,
    };
  } catch (error) {
    console.error('[auth] resolveTokenAccess failed (fail-open):', error);
    return { accessMode: 'full', blocked: false, blockedCode: null };
  }
}

/**
 * Materializa módulos del tenant para el JWT.
 * Falla en abierto (`*`) ante error de BD: una caída no puede bloquear módulos.
 */
async function resolveTokenModules(tenantId: string): Promise<TenantModulesToken> {
  try {
    const { getTenantEnabledModules } = await import('@/lib/tenant-modules');
    const enabled = await getTenantEnabledModules(tenantId);
    if (hasAllTenantModules(enabled)) return TENANT_MODULES_ALL_SENTINEL;
    return Array.from(enabled) as TenantModuleKey[];
  } catch (error) {
    console.error('[auth] resolveTokenModules failed (fail-open):', error);
    return TENANT_MODULES_ALL_SENTINEL;
  }
}

declare module 'next-auth' {
  interface User {
    id: string;
    email: string;
    name: string;
    role: string;
    roleTemplateId?: string | null;
    tenantId: string;
    portal?: string;
  }
  interface Session {
    user: {
      id: string;
      email: string;
      name: string;
      role: string;
      roleTemplateId?: string | null;
      tenantId: string;
    };
    portal?: string;
    impersonating?: boolean;
    /** Módulos de plan del tenant (`*` = todos). */
    modules?: TenantModulesToken;
    /** Modo de acceso comercial del tenant. Ausente en tokens pre-despliegue. */
    accessMode?: AccessMode;
    bannerKey?: string;
    accessDaysLeft?: number;
  }
}

declare module '@auth/core/jwt' {
  interface JWT {
    id: string;
    role: string;
    roleTemplateId?: string | null;
    tenantId: string;
    /** Portal context: 'opai' | 'supervisor' — prevents cross-portal session leaks */
    portal?: string;
    /** True when a platform admin is impersonating this user */
    impersonating?: boolean;
    /** Email of the platform admin who initiated the impersonation */
    impersonatingFrom?: string;
    /** Epoch ms — última vez que se refrescó role desde BD */
    roleRefreshedAt?: number;
    /** Módulos de plan del tenant (`*` = todos). Ausente en tokens pre-despliegue. */
    modules?: TenantModulesToken;
    accessMode?: AccessMode;
    bannerKey?: string;
    accessDaysLeft?: number;
  }
}

/** Cada cuántos ms se refresca el rol desde BD (60s) */
const ROLE_REFRESH_INTERVAL = 60 * 1000;

export const { handlers, signIn, signOut, auth } = NextAuth({
  providers: [
    Google({
      clientId: process.env.GOOGLE_CLIENT_ID!,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
      authorization: {
        params: {
          prompt: "select_account",
        },
      },
    }),
    Credentials({
      name: 'credentials',
      credentials: {
        email: { label: 'Email', type: 'email' },
        password: { label: 'Contraseña', type: 'password' },
        portal: { label: 'Portal', type: 'text' },
      },
      async authorize(credentials) {
        if (!credentials?.email || !credentials?.password) return null;
        const email = String(credentials.email).trim().toLowerCase();
        const password = String(credentials.password);
        const portal = credentials.portal ? String(credentials.portal) : 'opai';

        const { prisma } = await import('./prisma');

        // 0. Impersonate flow (platform admin → tenant owner)
        const creds = credentials as Record<string, unknown>;
        if (creds.__impersonate === 'true') {
          const impersonateSecret = process.env.PLATFORM_IMPERSONATE_SECRET;
          if (!impersonateSecret || creds.__secret !== impersonateSecret) {
            return null;
          }
          const adminId = String(creds.__adminId);
          const admin = await prisma.admin.findUnique({
            where: { id: adminId },
            include: { tenant: true },
          });
          if (!admin) return null;
          const impersonateAccess = await resolveTokenAccess(admin.tenantId);
          if (impersonateAccess.blocked) {
            return null;
          }
          return {
            id: admin.id,
            email: admin.email,
            name: admin.name,
            role: admin.role,
            roleTemplateId: admin.roleTemplateId,
            tenantId: admin.tenantId,
            portal: 'opai',
            impersonating: true,
            impersonatingFrom: String(creds.__fromEmail || ''),
          } as any;
        }

        // 1. Intentar login como inspector DT (credenciales temporales)
        if (email.startsWith("dt_")) {
          const dtSession = await prisma.dtInspectorSession.findUnique({
            where: { tempUsername: email },
            include: { tenant: true },
          });

          if (
            dtSession &&
            dtSession.isActive &&
            dtSession.validUntil > new Date()
          ) {
            const dtValid = await bcrypt.compare(password, dtSession.tempPasswordHash);
            if (dtValid) {
              const dtAccess = await resolveTokenAccess(dtSession.tenantId);
              if (dtAccess.blocked) {
                if (dtAccess.blockedCode === 'tenant_cancelled') throwTenantCancelled();
                throwTenantSuspended();
              }
              await prisma.dtInspectorSession.update({
                where: { id: dtSession.id },
                data: { lastAccessAt: new Date() },
              });
              return {
                id: `dt_${dtSession.id}`,
                email: dtSession.inspectorEmail,
                name: dtSession.inspectorName,
                role: "inspector_dt",
                roleTemplateId: null,
                tenantId: dtSession.tenantId,
                portal,
              };
            }
          }
          return null;
        }

        // 2. Login normal (Admin)
        const admin = await prisma.admin.findUnique({
          where: { email },
          include: { tenant: true },
        });
        
        if (!admin || admin.status !== 'active') {
          const reason = admin ? 'inactive' : 'not_found';
          try {
            const { logAudit } = await import('./audit');
            await logAudit({
              userEmail: email,
              action: 'LOGIN_FAILED',
              entity: 'Admin',
              details: { reason },
            });
          } catch {}
          if (reason === 'not_found') {
            throwCredentials('not_registered');
          }
          return null;
        }

        if (admin.tenant) {
          const access = await resolveTokenAccess(admin.tenantId);
          if (access.blocked) {
            try {
              const { logAudit } = await import('./audit');
              await logAudit({
                action: 'LOGIN_FAILED',
                entity: 'Admin',
                userEmail: email,
                tenantId: admin.tenantId,
                details: { reason: access.blockedCode ?? 'tenant_suspended' },
              });
            } catch {}
            if (access.blockedCode === 'tenant_cancelled') throwTenantCancelled();
            throwTenantSuspended();
          }
        }

        const valid = await bcrypt.compare(password, admin.password);
        if (!valid) {
          try {
            const { logAudit } = await import('./audit');
            await logAudit({
              userId: admin.id,
              userEmail: email,
              action: 'LOGIN_FAILED',
              entity: 'Admin',
              entityId: admin.id,
              details: { reason: 'bad_password' },
              tenantId: admin.tenantId,
            });
          } catch {}
          return null;
        }

        await prisma.admin.update({
          where: { id: admin.id },
          data: { lastLoginAt: new Date() },
        });
        const { touchTenantActivity } = await import('@/lib/platform/tenant-lifecycle');
        await touchTenantActivity(admin.tenantId);

        return {
          id: admin.id,
          email: admin.email,
          name: admin.name,
          role: admin.role,
          roleTemplateId: admin.roleTemplateId,
          tenantId: admin.tenantId,
          portal,
        };
      },
    }),
  ],
  callbacks: {
    async signIn({ user, account }) {
      // Google provider: Admin activo por email de Workspace o por googleId
      // ya vinculado. El lookup solo-email rompe el acceso si el correo del
      // Admin se renombró (el Google sub sigue siendo el mismo).
      if (account?.provider === 'google') {
        const { prisma } = await import('./prisma');
        const plan = googleAdminLookupPlan({
          email: user.email,
          googleSub: account.providerAccountId,
        });
        const include = { tenant: true } as const;
        let admin = plan.email
          ? await prisma.admin.findFirst({
              where: { email: plan.email, status: 'active' },
              include,
            })
          : null;
        if (!admin && plan.googleSub) {
          admin = await prisma.admin.findFirst({
            where: { googleId: plan.googleSub, status: 'active' },
            include,
          });
        }
        if (!admin) {
          return '/opai/login?error=google_not_registered';
        }
        {
          const access = await resolveTokenAccess(admin.tenantId);
          if (access.blocked) {
            const code = access.blockedCode === 'tenant_cancelled'
              ? 'tenant_cancelled'
              : 'tenant_suspended';
            return `/opai/login?error=${code}`;
          }
        }
        // Link googleId if not already linked
        if (!admin.googleId) {
          await prisma.admin.update({
            where: { id: admin.id },
            data: { googleId: account.providerAccountId },
          });
        }
        await prisma.admin.update({
          where: { id: admin.id },
          data: { lastLoginAt: new Date() },
        });
        const { touchTenantActivity } = await import('@/lib/platform/tenant-lifecycle');
        await touchTenantActivity(admin.tenantId);
        // Inject admin data into the NextAuth user object
        user.id = admin.id;
        user.name = admin.name;
        user.email = admin.email;
        user.role = admin.role;
        user.roleTemplateId = admin.roleTemplateId;
        user.tenantId = admin.tenantId;
        return true;
      }
      return true; // Credentials flow continues unchanged
    },
    async jwt({ token, user }) {
      // Login inicial: guardar datos del usuario
      if (user) {
        token.id = user.id;
        token.role = user.role;
        token.roleTemplateId = user.roleTemplateId ?? null;
        token.tenantId = user.tenantId;
        token.portal = user.portal || 'opai';
        token.roleRefreshedAt = Date.now();
        token.impersonating = (user as any).impersonating || false;
        token.impersonatingFrom = (user as any).impersonatingFrom || undefined;
        token.modules = await resolveTokenModules(user.tenantId);
        const access = await resolveTokenAccess(user.tenantId);
        token.accessMode = access.accessMode;
        token.bannerKey = access.bannerKey;
        token.accessDaysLeft = access.accessDaysLeft;
        if (access.blocked) {
          return null as unknown as typeof token;
        }
        return token;
      }

      // Refrescar rol desde BD periódicamente (solo en Node estricto; en Edge/middleware no hay Prisma)
      const now = Date.now();
      const runtime = process.env.NEXT_RUNTIME;
      const isEdgeRuntime = typeof (globalThis as unknown as { EdgeRuntime?: string }).EdgeRuntime === 'string';
      const isNodeRuntime = runtime === 'nodejs' && !isEdgeRuntime;
      if (!token.roleRefreshedAt || now - token.roleRefreshedAt > ROLE_REFRESH_INTERVAL) {
        if (isNodeRuntime) {
          const DB_TIMEOUT_MS = 5000;
          try {
            const { prisma } = await import('./prisma');
            const admin = await Promise.race([
              prisma.admin.findUnique({
                where: { id: token.id },
                select: {
                  role: true,
                  roleTemplateId: true,
                  status: true,
                },
              }),
              new Promise<null>((_, reject) =>
                setTimeout(() => reject(new Error('DB timeout')), DB_TIMEOUT_MS)
              ),
            ]);
            if (!admin || admin.status !== 'active') {
              // Usuario inactivo/eliminado: invalidar sesión
              return null as unknown as typeof token;
            }
            if (typeof token.tenantId === 'string' && token.tenantId) {
              const access = await resolveTokenAccess(token.tenantId);
              token.accessMode = access.accessMode;
              token.bannerKey = access.bannerKey;
              token.accessDaysLeft = access.accessDaysLeft;
              if (access.blocked) {
                return null as unknown as typeof token;
              }
            }
            token.role = admin.role;
            token.roleTemplateId = admin.roleTemplateId ?? null;
            token.roleRefreshedAt = now;
            // Mismo viaje de refresco: materializar módulos de plan del tenant.
            if (typeof token.tenantId === 'string' && token.tenantId) {
              token.modules = await resolveTokenModules(token.tenantId);
            }
          } catch (error) {
            console.error('[auth] Role refresh failed:', error);
            return token; // NO resetear roleRefreshedAt, reintentar en próximo request
          }
        } else {
          token.roleRefreshedAt = now;
        }
      }

      return token;
    },
    async session({ session, token }) {
      if (session.user) {
        session.user.id = token.id;
        session.user.role = token.role;
        session.user.roleTemplateId = token.roleTemplateId ?? null;
        session.user.tenantId = token.tenantId;
      }
      session.portal = token.portal;
      session.impersonating = token.impersonating || false;
      session.modules = token.modules;
      session.accessMode = token.accessMode;
      session.bannerKey = token.bannerKey;
      session.accessDaysLeft = token.accessDaysLeft;
      return session;
    },
  },
  events: {
    // Ley 21.719 — auditoría de autenticación
    async signIn({ user, account }) {
      try {
        const { logAudit } = await import('./audit');
        await logAudit({
          userId: user?.id,
          userEmail: user?.email,
          action: 'LOGIN',
          entity: 'Admin',
          entityId: user?.id ?? null,
          details: { provider: account?.provider ?? 'credentials' },
          tenantId: (user as { tenantId?: string })?.tenantId ?? null,
        });
      } catch {
        /* fail-safe */
      }
    },
    async signOut(message) {
      try {
        const { logAudit } = await import('./audit');
        const token = (message as { token?: { id?: string; email?: string; tenantId?: string } }).token;
        await logAudit({
          userId: token?.id,
          userEmail: token?.email,
          action: 'LOGOUT',
          entity: 'Admin',
          entityId: token?.id ?? null,
          tenantId: token?.tenantId ?? null,
        });
      } catch {
        /* fail-safe */
      }
    },
  },
  pages: {
    signIn: '/opai/login',
    // Evita la página genérica de Auth.js ("Server error / Configuration")
    // cuando Google responde invalid_grant u otro fallo de callback.
    error: '/opai/login',
  },
  session: {
    strategy: 'jwt',
    maxAge: 14 * 24 * 60 * 60, // 14 días
    updateAge: 60 * 60,        // Refresh cada 1 hora
  },
  secret: process.env.AUTH_SECRET || process.env.NEXTAUTH_SECRET,
  trustHost: true,
});

/**
 * Helper para actualizar último login
 */
export async function updateLastLogin(userId: string) {
  const { prisma } = await import('./prisma');
  const admin = await prisma.admin.update({
    where: { id: userId },
    data: { lastLoginAt: new Date() },
    select: { tenantId: true },
  });
  const { touchTenantActivity } = await import('@/lib/platform/tenant-lifecycle');
  await touchTenantActivity(admin.tenantId);
}
