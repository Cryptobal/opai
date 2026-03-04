import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireAuth, unauthorized } from '@/lib/api-auth'
import { DEFAULT_PORTAL_CONFIG, PortalConfig } from '@/lib/portal-cliente'

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const ctx = await requireAuth()
  if (!ctx) return unauthorized()

  const { id } = await params

  const account = await prisma.crmAccount.findUnique({
    where: { id, tenantId: ctx.tenantId },
    select: { portalConfig: true },
  })

  if (!account) {
    return NextResponse.json({ error: 'No encontrado' }, { status: 404 })
  }

  const config = account.portalConfig
    ? { ...DEFAULT_PORTAL_CONFIG, ...(account.portalConfig as object) }
    : DEFAULT_PORTAL_CONFIG

  return NextResponse.json({ portalConfig: config })
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const ctx = await requireAuth()
  if (!ctx) return unauthorized()

  const { id } = await params
  const body = await req.json()
  const { portalConfig } = body

  if (!portalConfig || typeof portalConfig !== 'object') {
    return NextResponse.json({ error: 'portalConfig requerido' }, { status: 400 })
  }

  // Merge with defaults to ensure all keys present
  const merged: PortalConfig = { ...DEFAULT_PORTAL_CONFIG, ...(portalConfig as Partial<PortalConfig>) }

  const account = await prisma.crmAccount.update({
    where: { id, tenantId: ctx.tenantId },
    data: { portalConfig: merged },
    select: { id: true, portalConfig: true },
  })

  return NextResponse.json({ portalConfig: account.portalConfig })
}
