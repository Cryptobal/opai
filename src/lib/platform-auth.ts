import { SignJWT } from 'jose';
import { cookies } from 'next/headers';
import * as bcrypt from 'bcryptjs';
import { verifyPlatformToken } from './platform-jwt';

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

/**
 * Login by email only (for Google OAuth flow).
 * No password check — the email must match a PlatformAdmin record.
 */
export async function platformLoginByEmail(
  email: string,
): Promise<{ success: true; session: PlatformSession } | { success: false; error: string }> {
  const { prisma } = await import('@/lib/prisma');

  const admin = await prisma.platformAdmin.findUnique({
    where: { email: email.trim().toLowerCase() },
  });

  if (!admin || admin.status !== 'active') {
    return { success: false, error: 'No tiene acceso de Platform Admin' };
  }

  await prisma.platformAdmin.update({
    where: { id: admin.id },
    data: { lastLoginAt: new Date() },
  });

  const session: PlatformSession = {
    platformAdminId: admin.id,
    email: admin.email,
    name: admin.name,
  };

  const token = await new SignJWT({ ...session })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime(`${EXPIRY_SECONDS}s`)
    .sign(getSecret());

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
  const cookieStore = await cookies();
  const token = cookieStore.get(COOKIE_NAME)?.value;
  // Misma verificación (firma + expiración) que usa el middleware, para que
  // no haya discrepancia entre "el middleware te deja pasar" y "el server te
  // reconoce la sesión".
  return verifyPlatformToken(token);
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
