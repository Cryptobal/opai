import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getPlatformSession } from '@/lib/platform-auth'

export async function GET() {
  const session = await getPlatformSession()
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const now = new Date()
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  const weekAgo = new Date(today.getTime() - 7 * 24 * 60 * 60 * 1000)
  const monthAgo = new Date(today.getTime() - 30 * 24 * 60 * 60 * 1000)

  const [
    totalSessions,
    todaySessions,
    weekSessions,
    contactsCollected,
    recentSessions,
    dailyStats,
  ] = await Promise.all([
    prisma.marketingChatSession.count(),
    prisma.marketingChatSession.count({
      where: { createdAt: { gte: today } },
    }),
    prisma.marketingChatSession.count({
      where: { createdAt: { gte: weekAgo } },
    }),
    prisma.marketingChatSession.count({
      where: { visitorEmail: { not: null } },
    }),
    prisma.marketingChatSession.findMany({
      orderBy: { createdAt: 'desc' },
      take: 50,
      include: {
        events: {
          orderBy: { createdAt: 'desc' },
          take: 1,
        },
      },
    }),
    // Daily sessions for the last 30 days
    prisma.$queryRaw<{ date: string; count: bigint }[]>`
      SELECT DATE(created_at) as date, COUNT(*) as count
      FROM marketing_chat_session
      WHERE created_at >= ${monthAgo}
      GROUP BY DATE(created_at)
      ORDER BY date DESC
    `,
  ])

  const avgMessages = recentSessions.length > 0
    ? Math.round(recentSessions.reduce((sum, s) => sum + s.messageCount, 0) / recentSessions.length * 10) / 10
    : 0

  return NextResponse.json({
    kpis: {
      totalSessions,
      todaySessions,
      weekSessions,
      contactsCollected,
      avgMessages,
      conversionRate: totalSessions > 0
        ? Math.round((contactsCollected / totalSessions) * 1000) / 10
        : 0,
    },
    dailyStats: dailyStats.map((d) => ({
      date: d.date,
      count: Number(d.count),
    })),
    recentSessions: recentSessions.map((s) => ({
      id: s.id,
      sessionId: s.sessionId,
      visitorName: s.visitorName,
      visitorEmail: s.visitorEmail,
      referrer: s.referrer,
      landingUrl: s.landingUrl,
      messageCount: s.messageCount,
      contactCollectedAt: s.contactCollectedAt,
      createdAt: s.createdAt,
      lastEvent: s.events[0]?.event || null,
    })),
  })
}
