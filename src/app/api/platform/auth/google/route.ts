import { NextResponse } from 'next/server';
import { platformLoginByEmail } from '@/lib/platform-auth';
import { auth } from '@/lib/auth';

/**
 * Google login for Platform Admin.
 *
 * Uses the existing Google/NextAuth session to authenticate.
 * The user must already be logged into the app with Google,
 * and their Google email must match a PlatformAdmin record.
 */
export async function POST() {
  try {
    // Check if there's an active NextAuth session (Google login)
    const session = await auth();

    if (!session?.user?.email) {
      return NextResponse.json(
        { error: 'No hay sesión de Google activa. Inicia sesión en la app primero.' },
        { status: 401 },
      );
    }

    // Try to authenticate as platform admin using the Google email
    const result = await platformLoginByEmail(session.user.email);

    if (!result.success) {
      return NextResponse.json(
        { error: `El email ${session.user.email} no tiene acceso de Platform Admin` },
        { status: 403 },
      );
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('[platform-auth] Google login error:', error);
    return NextResponse.json(
      { error: 'Error al iniciar sesión con Google' },
      { status: 500 },
    );
  }
}
