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
