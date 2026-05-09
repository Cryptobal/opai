import { NextResponse } from 'next/server'
import { resend } from '@/lib/resend'

export async function POST(request: Request) {
  try {
    const body = await request.json()
    const { nombre, empresa, email, telefono, mensaje } = body

    if (!nombre || !empresa || !email || !mensaje) {
      return NextResponse.json(
        { error: 'Faltan campos obligatorios' },
        { status: 400 }
      )
    }

    await resend.emails.send({
      from: 'OPAI Contacto <noreply@opai.cl>',
      to: process.env.PLATFORM_ALERTS_EMAIL || 'carlos.irigoyen@opai.cl',
      replyTo: email,
      subject: `[OPAI Web] Contacto de ${nombre} — ${empresa}`,
      html: `
        <h2>Nuevo contacto desde opai.cl</h2>
        <table style="border-collapse:collapse;font-family:sans-serif;font-size:14px">
          <tr><td style="padding:8px 12px;font-weight:600;color:#555">Nombre</td><td style="padding:8px 12px">${escapeHtml(nombre)}</td></tr>
          <tr><td style="padding:8px 12px;font-weight:600;color:#555">Empresa</td><td style="padding:8px 12px">${escapeHtml(empresa)}</td></tr>
          <tr><td style="padding:8px 12px;font-weight:600;color:#555">Email</td><td style="padding:8px 12px"><a href="mailto:${escapeHtml(email)}">${escapeHtml(email)}</a></td></tr>
          <tr><td style="padding:8px 12px;font-weight:600;color:#555">Teléfono</td><td style="padding:8px 12px">${escapeHtml(telefono || 'No indicado')}</td></tr>
        </table>
        <h3 style="margin-top:24px">Mensaje</h3>
        <p style="white-space:pre-wrap;background:#f5f5f5;padding:16px;border-radius:4px">${escapeHtml(mensaje)}</p>
      `,
    })

    return NextResponse.json({ ok: true })
  } catch (error) {
    console.error('[marketing/contact] Error:', error)
    return NextResponse.json(
      { error: 'Error al enviar el mensaje' },
      { status: 500 }
    )
  }
}

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}
