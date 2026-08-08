import { NextRequest, NextResponse } from 'next/server';
import { platformLogin, platformLogout } from '@/lib/platform-auth';
import { checkRateLimit, getClientIp, resetRateLimit } from '@/lib/rate-limit';

// Limitador in-memory por instancia. Ante cold starts / múltiples réplicas
// la ventana se reinicia. Versión robusta: Upstash (ver getPublicLeadRateLimit).

const PLATFORM_LOGIN_RL = { limit: 5, windowSeconds: 900 } as const;

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

    const ip = getClientIp(request);
    const emailKey = String(email).trim().toLowerCase();
    const ipRl = checkRateLimit(`platform-login-ip:${ip}`, PLATFORM_LOGIN_RL);
    const emailRl = checkRateLimit(
      `platform-login-email:${emailKey}`,
      PLATFORM_LOGIN_RL,
    );

    if (!ipRl.allowed || !emailRl.allowed) {
      return NextResponse.json(
        { error: 'Demasiados intentos. Intenta nuevamente en unos minutos.' },
        { status: 429 },
      );
    }

    const result = await platformLogin(email, password);

    if (!result.success) {
      return NextResponse.json({ error: result.error }, { status: 401 });
    }

    resetRateLimit(`platform-login-ip:${ip}`);
    resetRateLimit(`platform-login-email:${emailKey}`);

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
