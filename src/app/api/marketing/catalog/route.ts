import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export const revalidate = 3600

export async function GET() {
  try {
    const [plans, addons, packs] = await Promise.all([
      prisma.planCatalog.findMany({
        where: { active: true },
        orderBy: { sortOrder: 'asc' },
      }),
      prisma.addonCatalog.findMany({
        where: { active: true },
        orderBy: { sortOrder: 'asc' },
      }),
      prisma.packCatalog.findMany({
        where: { active: true },
      }),
    ])

    return NextResponse.json(
      {
        plans: plans.map((p) => ({
          ...p,
          pricePerGuard: Number(p.pricePerGuard),
          baseMinimum: Number(p.baseMinimum),
        })),
        addons: addons.map((a) => ({
          ...a,
          priceAmount: Number(a.priceAmount),
        })),
        packs: packs.map((p) => ({
          ...p,
          discountPct: Number(p.discountPct),
        })),
      },
      {
        headers: {
          'Cache-Control': 'public, s-maxage=3600, stale-while-revalidate=7200',
        },
      }
    )
  } catch (error) {
    console.error('[marketing/catalog] Error:', error)
    return NextResponse.json(
      { error: 'Error al obtener catálogo' },
      { status: 500 }
    )
  }
}
