'use server';

import { prisma } from '@/lib/prisma';
import * as bcrypt from 'bcryptjs';
import { randomBytes } from 'crypto';
import { Resend } from 'resend';

const resend = new Resend(process.env.RESEND_API_KEY);

/**
 * Solicitar reset de contraseña
 */
export async function requestPasswordReset(email: string) {
  const emailLower = email.trim().toLowerCase();

  // Verificar que el usuario existe
  const user = await prisma.admin.findUnique({
    where: { email: emailLower },
  });

  // Por seguridad, siempre devolvemos éxito aunque el usuario no exista
  // Esto previene que alguien pueda saber qué emails están registrados
  if (!user) {
    return { success: true };
  }

  // Verificar que el usuario está activo
  if (user.status !== 'active') {
    return { success: true }; // No revelamos que existe pero está inactivo
  }

  // Generar token único
  const token = randomBytes(32).toString('hex');
  const tokenHash = await bcrypt.hash(token, 10);

  // Crear registro de reset (expira en 1 hora)
  await prisma.passwordResetToken.create({
    data: {
      email: emailLower,
      token: tokenHash,
      expiresAt: new Date(Date.now() + 60 * 60 * 1000), // 1 hora
    },
  });

  // Enviar email
  const resetUrl = `${process.env.NEXT_PUBLIC_APP_URL}/opai/reset-password?token=${token}&email=${encodeURIComponent(emailLower)}`;
  
  try {
    await resend.emails.send({
      from: process.env.EMAIL_FROM || 'OPAI <opai@gard.cl>',
      to: emailLower,
      subject: 'Restablecer contraseña - OPAI',
      html: `
        <div style="font-family: system-ui, -apple-system, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
          <h2 style="color: #0f172a;">Restablecer contraseña</h2>
          <p style="color: #475569; line-height: 1.6;">
            Hemos recibido una solicitud para restablecer la contraseña de tu cuenta.
          </p>
          <p style="color: #475569; line-height: 1.6;">
            Haz clic en el siguiente enlace para crear una nueva contraseña:
          </p>
          <div style="margin: 32px 0;">
            <a 
              href="${resetUrl}" 
              style="background: #14b8a6; color: white; padding: 12px 32px; text-decoration: none; border-radius: 8px; display: inline-block; font-weight: 500;"
            >
              Restablecer contraseña
            </a>
          </div>
          <p style="color: #64748b; font-size: 14px; margin-top: 24px;">
            Este enlace expirará en 1 hora.
          </p>
          <p style="color: #64748b; font-size: 14px;">
            Si no solicitaste restablecer tu contraseña, puedes ignorar este correo de forma segura.
          </p>
          <hr style="border: none; border-top: 1px solid #e2e8f0; margin: 32px 0;" />
          <p style="color: #94a3b8; font-size: 12px; text-align: center;">
            OPAI · Gard Security
          </p>
        </div>
      `,
    });
  } catch (error) {
    console.error('Error enviando email de reset:', error);
    // No retornamos el error al usuario por seguridad
  }

  return { success: true };
}

/**
 * Resetear contraseña con token
 */
export async function resetPassword(email: string, token: string, newPassword: string) {
  if (newPassword.length < 8) {
    return { success: false, error: 'La contraseña debe tener al menos 8 caracteres' };
  }

  const emailLower = email.trim().toLowerCase();

  // Buscar tokens válidos para este email
  const tokens = await prisma.passwordResetToken.findMany({
    where: {
      email: emailLower,
      usedAt: null,
      expiresAt: { gte: new Date() },
    },
    orderBy: { createdAt: 'desc' },
  });

  // Verificar el token
  let validToken = null;
  for (const t of tokens) {
    const isValid = await bcrypt.compare(token, t.token);
    if (isValid) {
      validToken = t;
      break;
    }
  }

  if (!validToken) {
    return { success: false, error: 'El enlace de reset es inválido o ha expirado' };
  }

  // Verificar que el usuario existe
  const user = await prisma.admin.findUnique({
    where: { email: emailLower },
  });

  if (!user) {
    return { success: false, error: 'Usuario no encontrado' };
  }

  // Actualizar contraseña
  const passwordHash = await bcrypt.hash(newPassword, 10);
  
  await prisma.admin.update({
    where: { id: user.id },
    data: { password: passwordHash },
  });

  // Marcar token como usado
  await prisma.passwordResetToken.update({
    where: { id: validToken.id },
    data: { usedAt: new Date() },
  });

  // Registrar en audit log
  await prisma.auditLog.create({
    data: {
      tenantId: user.tenantId,
      userId: user.id,
      userEmail: user.email,
      action: 'user.password_reset',
      entity: 'user',
      entityId: user.id,
    },
  });

  return { success: true };
}
