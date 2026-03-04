import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { Resend } from 'resend'
import crypto from 'crypto'

const resend = new Resend(process.env.RESEND_API_KEY)

export async function POST(req: NextRequest) {
  try {
    const { rut } = await req.json()

    // Always return success to avoid user enumeration
    const SUCCESS = NextResponse.json({ success: true })

    if (!rut) return SUCCESS

    const cleanRut = rut.replace(/\./g, '').replace(/-/g, '').toUpperCase()

    const account = await prisma.crmAccount.findFirst({
      where: {
        OR: [
          { rut },
          { rut: cleanRut },
          { rut: rut.toUpperCase() },
        ],
      },
      include: {
        contacts: {
          where: { portalEnabled: true },
          select: { id: true, email: true, firstName: true },
          take: 1,
          orderBy: { createdAt: 'asc' },
        },
      },
    })

    if (!account || account.contacts.length === 0) return SUCCESS

    const contact = account.contacts[0]
    if (!contact.email) return SUCCESS

    const token = crypto.randomUUID()
    const exp = new Date(Date.now() + 48 * 60 * 60 * 1000) // 48 hours

    await prisma.crmContact.update({
      where: { id: contact.id },
      data: { portalMagicToken: token, portalMagicTokenExp: exp },
    })

    const baseUrl = process.env.NEXT_PUBLIC_BASE_URL ?? 'https://app.gardsecurity.cl'
    const setupUrl = `${baseUrl}/portal/cliente/setup?token=${token}`

    await resend.emails.send({
      from: 'Gard Security <noreply@gardsecurity.cl>',
      to: contact.email,
      subject: 'Restablecer PIN — Portal Gard Security',
      html: `
        <div style="font-family: sans-serif; max-width: 480px; margin: 0 auto;">
          <h2 style="color: #1e40af;">Portal Gard Security</h2>
          <p>Hola${contact.firstName ? ` ${contact.firstName}` : ''},</p>
          <p>Recibimos una solicitud para restablecer tu PIN de acceso al portal.</p>
          <p style="margin: 24px 0;">
            <a href="${setupUrl}" style="background: #2563eb; color: white; padding: 12px 24px; border-radius: 6px; text-decoration: none; display: inline-block;">
              Crear nuevo PIN
            </a>
          </p>
          <p style="color: #6b7280; font-size: 14px;">Este enlace expira en 48 horas. Si no solicitaste este cambio, puedes ignorar este correo.</p>
        </div>
      `,
    })

    return SUCCESS
  } catch (err) {
    console.error('[portal/forgot-pin]', err)
    return NextResponse.json({ success: true }) // Still return success
  }
}
