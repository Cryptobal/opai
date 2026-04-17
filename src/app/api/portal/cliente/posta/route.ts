import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requirePortalClienteAuth } from '@/lib/portal-cliente'

export async function GET(request: NextRequest) {
  try {
    const session = await requirePortalClienteAuth(request)
    if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

    const installationId = request.nextUrl.searchParams.get('installationId')
    const from = request.nextUrl.searchParams.get('from')
    const to = request.nextUrl.searchParams.get('to')

    // Get valid installations for this account
    const installations = await prisma.crmInstallation.findMany({
      where: {
        accountId: session.accountId,
        tenantId: session.tenantId,
        ...(installationId ? { id: installationId } : {}),
      },
      select: { id: true, name: true },
    })
    const installationIds = installations.map(i => i.id)

    if (installationIds.length === 0) return NextResponse.json({ success: true, data: [] })

    // Query via join table OpsControlNocturnoInstalacion
    const instalacionRecords = await prisma.opsControlNocturnoInstalacion.findMany({
      where: {
        installationId: { in: installationIds },
        controlNocturno: {
          tenantId: session.tenantId,
          ...(from ? { date: { gte: new Date(from) } } : {}),
          ...(to ? { date: { lte: new Date(to) } } : {}),
        },
      },
      include: {
        controlNocturno: {
          select: {
            id: true,
            date: true,
            centralOperatorName: true,
            status: true,
            generalNotes: true,
            submittedAt: true,
          },
        },
      },
      orderBy: { controlNocturno: { date: 'desc' } },
      take: 50,
    })

    return NextResponse.json({ success: true, data: instalacionRecords })
  } catch (error) {
    console.error('[portal/posta]', error)
    return NextResponse.json({ error: 'Error interno' }, { status: 500 })
  }
}
