import { NextResponse } from 'next/server';
import { signOut } from '@/lib/auth';

export async function DELETE() {
  try {
    await signOut({ redirect: false });
    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json({ success: true });
  }
}
