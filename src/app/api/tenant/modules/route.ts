import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { getTenantModulesList } from '@/lib/tenant-modules';

export const dynamic = 'force-dynamic';

export async function GET() {
  const session = await auth();
  if (!session?.user?.tenantId) {
    return NextResponse.json({ modules: [] }, { status: 401 });
  }

  const modules = await getTenantModulesList(session.user.tenantId);
  return NextResponse.json({ modules });
}
