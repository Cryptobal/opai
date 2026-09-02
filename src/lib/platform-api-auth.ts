import { getPlatformSession, type PlatformSession } from './platform-auth';
import { NextResponse } from 'next/server';
import {
  hasMinPlatformRole,
  type PlatformRole,
} from '@/lib/platform/roles';

export type PlatformAuthContext = PlatformSession;

export type PlatformAuthResult =
  | { ok: true; ctx: PlatformAuthContext }
  | { ok: false; response: NextResponse };

export async function requirePlatformAuth(opts?: {
  minRole?: PlatformRole;
}): Promise<PlatformAuthResult> {
  const session = await getPlatformSession();
  if (!session) return { ok: false, response: platformUnauthorized() };
  const minRole = opts?.minRole ?? 'support';
  if (!hasMinPlatformRole(session.role, minRole)) {
    return { ok: false, response: platformForbidden(minRole) };
  }
  return { ok: true, ctx: session };
}

export function platformUnauthorized() {
  return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
}

export function platformForbidden(required: PlatformRole) {
  return NextResponse.json(
    {
      error: `Requiere rol ${required}`,
      code: 'PLATFORM_ROLE_REQUIRED',
      required,
    },
    { status: 403 },
  );
}
