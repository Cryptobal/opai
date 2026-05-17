import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { resend, EMAIL_CONFIG } from '@/lib/resend'
import { getTenantCompanyConfig } from '@/lib/tenant-config'
import { buildEmailUrl } from '@/lib/emails/site-url'
import crypto from 'crypto'

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const email = typeof body?.email === 'string' ? body.email.trim().toLowerCase() : ''

    // Always return success to avoid user enumeration
    const SUCCESS = NextResponse.json({ success: true })

    if (!email) return SUCCESS

    // Buscar el contacto por email: así sabemos a quién mandar el enlace (un contacto = un usuario con PIN)
    const contact = await prisma.crmContact.findFirst({
      where: {
        portalEnabled: true,
        email: { equals: email, mode: 'insensitive' },
        account: {
          status: { in: ['client_active', 'prospect'] },
          isActive: true,
        },
      },
      select: { id: true, email: true, firstName: true, tenantId: true },
    })

    if (!contact?.email) return SUCCESS

    const token = crypto.randomUUID()
    const exp = new Date(Date.now() + 48 * 60 * 60 * 1000) // 48 hours

    await prisma.crmContact.update({
      where: { id: contact.id },
      data: { portalMagicToken: token, portalMagicTokenExp: exp },
    })

    const tenant = await prisma.tenant.findUnique({
      where: { id: contact.tenantId },
      select: { slug: true },
    })
    const setupUrl = buildEmailUrl(`/portal/cliente/setup?token=${token}`, tenant?.slug ?? null)
    const cfg = await getTenantCompanyConfig(contact.tenantId)

    const emailResult = await resend.emails.send({
      from: cfg.emailFrom,
      replyTo: EMAIL_CONFIG.replyTo,
      to: contact.email,
      subject: `Restablecer PIN — Portal ${cfg.commercialName}`,
      html: `
        <div style="font-family: sans-serif; max-width: 480px; margin: 0 auto;">
          <h2 style="color: #1e40af;">Portal ${cfg.commercialName}</h2>
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

    if (emailResult.error) {
      console.error('[portal/forgot-pin] Resend error:', emailResult.error.message, emailResult.error)
      throw new Error(`Resend: ${emailResult.error.message}`)
    }

    return SUCCESS
  } catch (err) {
    console.error('[portal/forgot-pin]', err)
    return NextResponse.json({ success: true }) // Still return success to avoid enumeration
  }
}
