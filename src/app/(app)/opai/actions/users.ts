'use server';

import { auth } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { hasPermission, PERMISSIONS, type Role } from '@/lib/rbac';
import * as bcrypt from 'bcryptjs';
import { randomBytes } from 'crypto';
import { Resend } from 'resend';

const resend = new Resend(process.env.RESEND_API_KEY);

/**
 * Invitar un nuevo usuario al tenant (usa RoleTemplate por slug)
 */
export async function inviteUser(email: string, roleTemplateSlug: string) {
  const session = await auth();
  if (!session?.user) {
    return { success: false, error: 'No autenticado' };
  }

  if (!hasPermission(session.user.role as Role, PERMISSIONS.INVITE_USERS)) {
    return { success: false, error: 'Sin permisos para invitar usuarios' };
  }

  const template = await prisma.roleTemplate.findFirst({
    where: { slug: roleTemplateSlug, tenantId: session.user.tenantId },
  });

  if (!template) {
    return { success: false, error: 'Rol no encontrado. Configúralo en Roles y Permisos.' };
  }

  const emailLower = email.trim().toLowerCase();

  const existingUser = await prisma.admin.findUnique({
    where: { email: emailLower },
  });

  if (existingUser) {
    return { success: false, error: 'El usuario ya existe' };
  }

  const existingInvitation = await prisma.userInvitation.findFirst({
    where: {
      email: emailLower,
      tenantId: session.user.tenantId,
      acceptedAt: null,
      revokedAt: null,
      expiresAt: { gte: new Date() },
    },
  });

  if (existingInvitation) {
    return { success: false, error: 'Ya existe una invitación pendiente' };
  }

  const token = randomBytes(32).toString('hex');
  const tokenHash = await bcrypt.hash(token, 10);

  const invitation = await prisma.userInvitation.create({
    data: {
      email: emailLower,
      role: template.slug,
      tenantId: session.user.tenantId,
      token: tokenHash,
      expiresAt: new Date(Date.now() + 48 * 60 * 60 * 1000),
      invitedBy: session.user.id,
    },
  });

  const activationUrl = `${process.env.NEXT_PUBLIC_APP_URL}/activate?token=${token}`;
  
  try {
    await resend.emails.send({
      from: process.env.EMAIL_FROM || 'OPAI <opai@gard.cl>',
      to: emailLower,
      subject: 'Invitación a Gard Docs',
      html: `
        <h2>Has sido invitado a Gard Docs</h2>
        <p><strong>${session.user.name}</strong> te ha invitado a unirte al equipo.</p>
        <p>Rol asignado: <strong>${template.name}</strong></p>
        <p>Haz clic en el siguiente enlace para activar tu cuenta:</p>
        <a href="${activationUrl}" style="background: #00d4aa; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; display: inline-block;">
          Activar mi cuenta
        </a>
        <p style="margin-top: 20px; font-size: 14px; color: #666;">
          Este enlace expira en 48 horas.
        </p>
      `,
    });
  } catch (error) {
    console.error('Error enviando email de invitación:', error);
  }

  await prisma.auditLog.create({
    data: {
      tenantId: session.user.tenantId,
      userId: session.user.id,
      userEmail: session.user.email,
      action: 'user.invited',
      entity: 'user',
      entityId: invitation.id,
      details: { email: emailLower, role: template.slug, roleName: template.name },
    },
  });

  return { success: true, invitationId: invitation.id };
}

/**
 * Activar cuenta de usuario
 */
export async function activateAccount(token: string, name: string, password: string) {
  if (!name || !password) {
    return { success: false, error: 'Nombre y contraseña son requeridos' };
  }

  if (password.length < 8) {
    return { success: false, error: 'La contraseña debe tener al menos 8 caracteres' };
  }

  const invitations = await prisma.userInvitation.findMany({
    where: {
      acceptedAt: null,
      revokedAt: null,
      expiresAt: { gte: new Date() },
    },
  });

  let invitation = null;
  for (const inv of invitations) {
    const isValid = await bcrypt.compare(token, inv.token);
    if (isValid) {
      invitation = inv;
      break;
    }
  }

  if (!invitation) {
    return { success: false, error: 'Token inválido o expirado' };
  }

  const existingUser = await prisma.admin.findUnique({
    where: { email: invitation.email },
  });

  if (existingUser) {
    return { success: false, error: 'El usuario ya existe' };
  }

  const passwordHash = await bcrypt.hash(password, 10);

  const roleTemplate = await prisma.roleTemplate.findFirst({
    where: { tenantId: invitation.tenantId, slug: invitation.role },
  });

  const user = await prisma.admin.create({
    data: {
      email: invitation.email,
      name,
      password: passwordHash,
      role: invitation.role as Role,
      roleTemplateId: roleTemplate?.id ?? null,
      status: 'active',
      tenantId: invitation.tenantId,
      invitedBy: invitation.invitedBy,
      invitedAt: invitation.createdAt,
      activatedAt: new Date(),
    },
  });

  await prisma.userInvitation.update({
    where: { id: invitation.id },
    data: { acceptedAt: new Date() },
  });

  await prisma.auditLog.create({
    data: {
      tenantId: invitation.tenantId,
      userId: user.id,
      userEmail: user.email,
      action: 'user.activated',
      entity: 'user',
      entityId: user.id,
    },
  });

  return { success: true, userId: user.id };
}

/**
 * Cambiar rol de un usuario (usa RoleTemplate)
 */
export async function changeUserRole(userId: string, roleTemplateId: string) {
  const session = await auth();
  if (!session?.user) {
    return { success: false, error: 'No autenticado' };
  }

  if (!hasPermission(session.user.role as Role, PERMISSIONS.MANAGE_USERS)) {
    return { success: false, error: 'Sin permisos para gestionar usuarios' };
  }

  const template = await prisma.roleTemplate.findFirst({
    where: { id: roleTemplateId, tenantId: session.user.tenantId },
  });

  if (!template) {
    return { success: false, error: 'Rol no encontrado' };
  }

  const user = await prisma.admin.findUnique({
    where: { id: userId },
  });

  if (!user || user.tenantId !== session.user.tenantId) {
    return { success: false, error: 'Usuario no encontrado' };
  }

  if (userId === session.user.id) {
    return { success: false, error: 'No puedes cambiar tu propio rol' };
  }

  if (user.role === 'owner') {
    const ownerCount = await prisma.admin.count({
      where: {
        tenantId: session.user.tenantId,
        role: 'owner',
        status: 'active',
      },
    });

    if (ownerCount <= 1) {
      return { success: false, error: 'Debe haber al menos un owner activo' };
    }
  }

  const oldRole = user.role;

  await prisma.admin.update({
    where: { id: userId },
    data: {
      role: template.slug as Role,
      roleTemplateId: template.id,
    },
  });

  await prisma.auditLog.create({
    data: {
      tenantId: session.user.tenantId,
      userId: session.user.id,
      userEmail: session.user.email,
      action: 'user.role_changed',
      entity: 'user',
      entityId: userId,
      details: { oldRole, newRole: template.slug, roleTemplateId: template.id },
    },
  });

  return { success: true };
}

/**
 * Desactivar/activar usuario
 */
export async function toggleUserStatus(userId: string) {
  const session = await auth();
  if (!session?.user) {
    return { success: false, error: 'No autenticado' };
  }

  if (!hasPermission(session.user.role as Role, PERMISSIONS.MANAGE_USERS)) {
    return { success: false, error: 'Sin permisos para gestionar usuarios' };
  }

  const user = await prisma.admin.findUnique({
    where: { id: userId },
  });

  if (!user || user.tenantId !== session.user.tenantId) {
    return { success: false, error: 'Usuario no encontrado' };
  }

  if (userId === session.user.id) {
    return { success: false, error: 'No puedes desactivarte a ti mismo' };
  }

  if (user.role === 'owner' && user.status === 'active') {
    const activeOwnerCount = await prisma.admin.count({
      where: {
        tenantId: session.user.tenantId,
        role: 'owner',
        status: 'active',
      },
    });

    if (activeOwnerCount <= 1) {
      return { success: false, error: 'Debe haber al menos un owner activo' };
    }
  }

  const newStatus = user.status === 'active' ? 'disabled' : 'active';

  await prisma.admin.update({
    where: { id: userId },
    data: { status: newStatus },
  });

  await prisma.auditLog.create({
    data: {
      tenantId: session.user.tenantId,
      userId: session.user.id,
      userEmail: session.user.email,
      action: newStatus === 'active' ? 'user.enabled' : 'user.disabled',
      entity: 'user',
      entityId: userId,
    },
  });

  return { success: true };
}

/**
 * Revocar invitación pendiente
 */
export async function revokeInvitation(invitationId: string) {
  const session = await auth();
  if (!session?.user) {
    return { success: false, error: 'No autenticado' };
  }

  if (!hasPermission(session.user.role as Role, PERMISSIONS.MANAGE_USERS)) {
    return { success: false, error: 'Sin permisos para gestionar invitaciones' };
  }

  const invitation = await prisma.userInvitation.findUnique({
    where: { id: invitationId },
  });

  if (!invitation || invitation.tenantId !== session.user.tenantId) {
    return { success: false, error: 'Invitación no encontrada' };
  }

  if (invitation.acceptedAt || invitation.revokedAt) {
    return { success: false, error: 'La invitación ya fue procesada' };
  }

  await prisma.userInvitation.update({
    where: { id: invitationId },
    data: { revokedAt: new Date() },
  });

  await prisma.auditLog.create({
    data: {
      tenantId: session.user.tenantId,
      userId: session.user.id,
      userEmail: session.user.email,
      action: 'invitation.revoked',
      entity: 'invitation',
      entityId: invitationId,
      details: { email: invitation.email },
    },
  });

  return { success: true };
}

/**
 * Listar usuarios del tenant actual
 */
export async function listUsers() {
  const session = await auth();
  if (!session?.user) {
    return { success: false, error: 'No autenticado' };
  }
  if (!hasPermission(session.user.role as Role, PERMISSIONS.MANAGE_USERS)) {
    return { success: false, error: 'Sin permisos para gestionar usuarios' };
  }

  const users = await prisma.admin.findMany({
    where: { tenantId: session.user.tenantId },
    select: {
      id: true,
      email: true,
      name: true,
      role: true,
      roleTemplateId: true,
      status: true,
      lastLoginAt: true,
      createdAt: true,
      invitedAt: true,
      activatedAt: true,
      roleTemplate: {
        select: { id: true, name: true, slug: true },
      },
    },
    orderBy: { createdAt: 'desc' },
  });

  return { success: true, users };
}

/**
 * Listar invitaciones pendientes
 */
export async function listPendingInvitations() {
  const session = await auth();
  if (!session?.user) {
    return { success: false, error: 'No autenticado' };
  }
  if (!hasPermission(session.user.role as Role, PERMISSIONS.MANAGE_USERS)) {
    return { success: false, error: 'Sin permisos para gestionar invitaciones' };
  }

  const invitations = await prisma.userInvitation.findMany({
    where: {
      tenantId: session.user.tenantId,
      acceptedAt: null,
      revokedAt: null,
      expiresAt: { gte: new Date() },
    },
    select: {
      id: true,
      email: true,
      role: true,
      createdAt: true,
      expiresAt: true,
    },
    orderBy: { createdAt: 'desc' },
  });

  return { success: true, invitations };
}

/**
 * Listar RoleTemplates del tenant (para selector de Gestión de Usuarios)
 */
export async function listRoleTemplates() {
  const session = await auth();
  if (!session?.user) {
    return { success: false, error: 'No autenticado', templates: [] };
  }
  if (!hasPermission(session.user.role as Role, PERMISSIONS.MANAGE_USERS)) {
    return { success: false, error: 'Sin permisos', templates: [] };
  }

  const templates = await prisma.roleTemplate.findMany({
    where: { tenantId: session.user.tenantId },
    select: { id: true, name: true, slug: true, isSystem: true },
    orderBy: [{ isSystem: 'desc' }, { name: 'asc' }],
  });

  return { success: true, templates };
}
