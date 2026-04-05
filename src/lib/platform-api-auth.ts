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
