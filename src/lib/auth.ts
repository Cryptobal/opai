/**
 * Auth.js v5 (NextAuth v5) - Gard Docs
 * Credentials con tabla Admin (bcrypt) + tenantId en sesión
 *
 * Prisma se carga solo en Node (authorize, jwt refresh). En Edge (middleware)
 * no se usa Prisma para evitar "Prisma Client on edge runtime".
 */

import NextAuth from 'next-auth';
import Credentials from 'next-auth/providers/credentials';
import * as bcrypt from 'bcryptjs';

declare module 'next-auth' {
  interface User {
    id: string;
    email: string;
    name: string;
    role: string;
    roleTemplateId?: string | null;
    tenantId: string;
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
  }
}

declare module '@auth/core/jwt' {
  interface JWT {
    id: string;
    role: string;
    roleTemplateId?: string | null;
    tenantId: string;
    /** Epoch ms — última vez que se refrescó role desde BD */
    roleRefreshedAt?: number;
  }
}

/** Cada cuántos ms se refresca el rol desde BD (60s) */
const ROLE_REFRESH_INTERVAL = 60 * 1000;

export const { handlers, signIn, signOut, auth } = NextAuth({
  providers: [
    Credentials({
      name: 'credentials',
      credentials: {
        email: { label: 'Email', type: 'email' },
        password: { label: 'Contraseña', type: 'password' },
      },
      async authorize(credentials) {
        if (!credentials?.email || !credentials?.password) return null;
        const email = String(credentials.email).trim().toLowerCase();
        const password = String(credentials.password);

        const { prisma } = await import('@/lib/prisma');
        const admin = await prisma.admin.findUnique({
          where: { email },
          include: { tenant: true },
        });
        
        // Verificar que existe y está activo
        if (!admin || admin.status !== 'active') return null;

        const valid = await bcrypt.compare(password, admin.password);
        if (!valid) return null;

        // Actualizar último login
        await prisma.admin.update({
          where: { id: admin.id },
          data: { lastLoginAt: new Date() },
        });

        return {
          id: admin.id,
          email: admin.email,
          name: admin.name,
          role: admin.role,
          roleTemplateId: admin.roleTemplateId,
          tenantId: admin.tenantId,
        };
      },
    }),
  ],
  callbacks: {
    async jwt({ token, user }) {
      // Login inicial: guardar datos del usuario
      if (user) {
        token.id = user.id;
        token.role = user.role;
        token.roleTemplateId = user.roleTemplateId ?? null;
        token.tenantId = user.tenantId;
        token.roleRefreshedAt = Date.now();
        return token;
      }

      // Refrescar rol desde BD periódicamente (solo en Node; en Edge no hay Prisma)
      const now = Date.now();
      const isEdge = typeof (globalThis as unknown as { EdgeRuntime?: string }).EdgeRuntime === 'string';
      if (!token.roleRefreshedAt || now - token.roleRefreshedAt > ROLE_REFRESH_INTERVAL) {
        if (!isEdge) {
          const DB_TIMEOUT_MS = 5000;
          try {
            const { prisma } = await import('@/lib/prisma');
            const admin = await Promise.race([
              prisma.admin.findUnique({
                where: { id: token.id },
                select: { role: true, roleTemplateId: true, status: true },
              }),
              new Promise<null>((_, reject) =>
                setTimeout(() => reject(new Error('DB timeout')), DB_TIMEOUT_MS)
              ),
            ]);
            if (admin && admin.status === 'active') {
              token.role = admin.role;
              token.roleTemplateId = admin.roleTemplateId ?? null;
            }
          } catch {
            // Si falla la BD o timeout, mantener el token actual
          }
        }
        token.roleRefreshedAt = now;
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
      return session;
    },
  },
  pages: {
    signIn: '/opai/login',
  },
  session: {
    strategy: 'jwt',
    maxAge: 30 * 24 * 60 * 60, // 30 días (gold standard SaaS B2B)
  },
  secret: process.env.AUTH_SECRET || process.env.NEXTAUTH_SECRET,
  trustHost: true,
});

/**
 * Helper para actualizar último login
 */
export async function updateLastLogin(userId: string) {
  const { prisma } = await import('@/lib/prisma');
  await prisma.admin.update({
    where: { id: userId },
    data: { lastLoginAt: new Date() },
  });
}
