'use server';

import { auth } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import * as bcrypt from 'bcryptjs';

/**
 * Cambiar contraseña del usuario autenticado
 */
export async function changePassword(currentPassword: string, newPassword: string) {
  const session = await auth();
  if (!session?.user) {
    return { success: false, error: 'No autenticado' };
  }

  // Validar nueva contraseña
  if (newPassword.length < 8) {
    return { success: false, error: 'La nueva contraseña debe tener al menos 8 caracteres' };
  }

  // Obtener usuario actual
  const user = await prisma.admin.findUnique({
    where: { id: session.user.id },
  });

  if (!user) {
    return { success: false, error: 'Usuario no encontrado' };
  }

  // Verificar contraseña actual
  const isValid = await bcrypt.compare(currentPassword, user.password);
  if (!isValid) {
    return { success: false, error: 'La contraseña actual es incorrecta' };
  }

  // Verificar que la nueva contraseña sea diferente
  const isSamePassword = await bcrypt.compare(newPassword, user.password);
  if (isSamePassword) {
    return { success: false, error: 'La nueva contraseña debe ser diferente a la actual' };
  }

  // Actualizar contraseña
  const passwordHash = await bcrypt.hash(newPassword, 10);
  
  await prisma.admin.update({
    where: { id: user.id },
    data: { password: passwordHash },
  });

  // Registrar en audit log
  await prisma.auditLog.create({
    data: {
      tenantId: user.tenantId,
      userId: user.id,
      userEmail: user.email,
      action: 'user.password_changed',
      entity: 'user',
      entityId: user.id,
    },
  });

  return { success: true };
}

/**
 * Actualizar nombre del usuario autenticado.
 */
export async function updateDisplayName(name: string) {
  const session = await auth();
  if (!session?.user) {
    return { success: false, error: 'No autenticado' };
  }

  const normalizedName = name.trim().replace(/\s+/g, ' ');
  if (normalizedName.length < 2) {
    return { success: false, error: 'El nombre debe tener al menos 2 caracteres' };
  }
  if (normalizedName.length > 120) {
    return { success: false, error: 'El nombre no puede superar 120 caracteres' };
  }

  const user = await prisma.admin.findUnique({
    where: { id: session.user.id },
    select: { id: true, tenantId: true, email: true, name: true },
  });

  if (!user) {
    return { success: false, error: 'Usuario no encontrado' };
  }

  if (user.name === normalizedName) {
    return { success: true, name: normalizedName };
  }

  await prisma.admin.update({
    where: { id: user.id },
    data: { name: normalizedName },
  });

  await prisma.auditLog.create({
    data: {
      tenantId: user.tenantId,
      userId: user.id,
      userEmail: user.email,
      action: 'user.name_changed',
      entity: 'user',
      entityId: user.id,
      details: {
        fromName: user.name,
        toName: normalizedName,
      },
    },
  });

  return { success: true, name: normalizedName };
}

/**
 * Actualizar teléfono del usuario autenticado.
 * Normaliza a formato E.164 chileno (+569XXXXXXXX) cuando es posible.
 * Usado por alertas-cobertura para enviar WhatsApp al admin creador
 * cuando un guardia acepta el turno.
 */
export async function updatePhone(phone: string) {
  const session = await auth();
  if (!session?.user) {
    return { success: false, error: 'No autenticado' };
  }

  const raw = phone.trim().replace(/[\s\-\(\)\.]/g, '');
  let normalized = raw;
  if (raw !== '') {
    // Aceptar 9XXXXXXXX (9 dígitos) y prepender +56
    if (/^9\d{8}$/.test(raw)) normalized = `+56${raw}`;
    // Aceptar 56XXXXXXXXX y prepender +
    else if (/^56\d{9}$/.test(raw)) normalized = `+${raw}`;
    // Aceptar ya en formato E.164
    else if (/^\+\d{8,15}$/.test(raw)) normalized = raw;
    else {
      return { success: false, error: 'Formato de teléfono inválido. Usa +56912345678 o 912345678' };
    }
  }

  const user = await prisma.admin.findUnique({
    where: { id: session.user.id },
    select: { id: true, tenantId: true, email: true },
  });
  if (!user) {
    return { success: false, error: 'Usuario no encontrado' };
  }

  await prisma.admin.update({
    where: { id: user.id },
    data: { phone: normalized || null },
  });

  return { success: true, phone: normalized };
}

/**
 * Actualizar cargo del usuario autenticado.
 */
export async function updateCargo(cargo: string) {
  const session = await auth();
  if (!session?.user) {
    return { success: false, error: 'No autenticado' };
  }

  const normalizedCargo = cargo.trim();
  if (normalizedCargo.length > 120) {
    return { success: false, error: 'El cargo no puede superar 120 caracteres' };
  }

  const user = await prisma.admin.findUnique({
    where: { id: session.user.id },
    select: { id: true, tenantId: true, email: true, cargo: true },
  });

  if (!user) {
    return { success: false, error: 'Usuario no encontrado' };
  }

  await prisma.admin.update({
    where: { id: user.id },
    data: { cargo: normalizedCargo || null },
  });

  return { success: true, cargo: normalizedCargo };
}
