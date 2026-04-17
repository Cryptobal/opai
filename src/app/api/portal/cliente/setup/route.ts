import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import bcrypt from 'bcryptjs'

// GET: verify token without consuming it
export async function GET(req: NextRequest) {
  const token = req.nextUrl.searchParams.get('token')
  if (!token) {
    return NextResponse.json({ valid: false, error: 'Token requerido' })
  }

  const contact = await prisma.crmContact.findFirst({
    where: { portalMagicToken: token },
    include: { account: { select: { rut: true } } },
  })

  if (!contact) {
    return NextResponse.json({ valid: false, error: 'Token inválido' })
  }

  if (contact.portalMagicTokenExp && contact.portalMagicTokenExp < new Date()) {
    return NextResponse.json({ valid: false, error: 'Token expirado' })
  }

  return NextResponse.json({
    valid: true,
    rut: contact.account?.rut ?? '',
    firstName: contact.firstName ?? '',
  })
}

// POST: consume token and set PIN
export async function POST(req: NextRequest) {
  const { token, pin } = await req.json()

  if (!token || !pin) {
    return NextResponse.json({ error: 'Token y PIN requeridos' }, { status: 400 })
  }

  if (!/^\d{4}$/.test(pin)) {
    return NextResponse.json({ error: 'El PIN debe ser exactamente 4 dígitos numéricos' }, { status: 400 })
  }

  const contact = await prisma.crmContact.findFirst({
    where: { portalMagicToken: token },
    include: { account: { select: { rut: true } } },
  })

  if (!contact) {
    return NextResponse.json({ error: 'Token inválido' }, { status: 400 })
  }

  if (contact.portalMagicTokenExp && contact.portalMagicTokenExp < new Date()) {
    return NextResponse.json({ error: 'Este link ha expirado. Contacta a tu ejecutivo Gard.' }, { status: 400 })
  }

  const hashedPin = await bcrypt.hash(pin, 10)

  await prisma.crmContact.update({
    where: { id: contact.id },
    data: {
      portalPin: hashedPin,
      portalPinVisible: null,
      portalEnabled: true,
      portalMagicToken: null,
      portalMagicTokenExp: null,
      portalLoginAttempts: 0,
      portalLockedUntil: null,
    },
  })

  return NextResponse.json({ success: true })
}
