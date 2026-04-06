import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export async function POST(request: Request) {
  try {
    const body = await request.json()
    const { sessionId, event, url, referrer, name, email, messageIndex, ...rest } = body

    if (!sessionId || !event) {
      return NextResponse.json({ error: 'sessionId and event required' }, { status: 400 })
    }

    // Upsert session
    const session = await prisma.marketingChatSession.upsert({
      where: { sessionId },
      create: {
        sessionId,
        landingUrl: url || null,
        referrer: referrer || null,
        messageCount: event === 'message_sent' ? 1 : 0,
        firstMessageAt: event === 'message_sent' ? new Date() : null,
        lastMessageAt: event === 'message_sent' ? new Date() : null,
      },
      update: {
        ...(event === 'message_sent' && {
          messageCount: { increment: 1 },
          lastMessageAt: new Date(),
          firstMessageAt: undefined, // don't overwrite
        }),
        ...(event === 'contact_collected' && name && email && {
          visitorName: name,
          visitorEmail: email,
          contactCollectedAt: new Date(),
        }),
      },
    })

    // If first message, set firstMessageAt if null
    if (event === 'message_sent' && !session.firstMessageAt) {
      await prisma.marketingChatSession.update({
        where: { id: session.id },
        data: { firstMessageAt: new Date() },
      })
    }

    // Log event
    await prisma.marketingChatEvent.create({
      data: {
        sessionId,
        event,
        url: url || null,
        metadata: Object.keys(rest).length > 0 || messageIndex !== undefined
          ? { ...rest, ...(messageIndex !== undefined && { messageIndex }) }
          : undefined,
      },
    })

    return NextResponse.json({ ok: true })
  } catch (error) {
    console.error('[marketing/chat-track] Error:', error)
    return NextResponse.json({ ok: true }) // Don't fail the client
  }
}
