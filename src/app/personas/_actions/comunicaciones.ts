"use server";

import { prisma } from "@/lib/prisma";
import { handleGuardActivation } from "@/lib/triggers/onboarding-trigger";
import { sendEmailToGuardia } from "@/lib/email/onboarding-email-service";
import type { EmailBlock } from "@/lib/email/types";
import type {
  OpsEmailTemplateType,
  OpsEmailLogType,
  OpsEmailTrigger,
  OpsEmailEstado,
  OpsOnboardingEstado,
} from "@prisma/client";
import { randomUUID } from "node:crypto";

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

export interface GetOnboardingDashboardFilters {
  estado?: OpsOnboardingEstado;
  clienteId?: string;
  sitioId?: string;
}

export interface OnboardingGuardiaItem {
  id: string;
  personaNombre: string;
  personaEmail: string | null;
  lifecycleStatus: string;
  currentInstallationId: string | null;
  sitioNombre?: string;
  clienteNombre?: string;
  onboardingStatus: {
    estado: OpsOnboardingEstado;
    emailEnviado: boolean;
    fechaEnvio: Date | null;
    accesoPortalGuardia: boolean;
    accesoPortalRondas: boolean;
    accesoPortalAcceso: boolean;
    completadoAt: Date | null;
  } | null;
  emailStatus?: "enviado" | "rebotado" | "pendiente" | "error";
}

export interface OnboardingDashboardResult {
  metrics: {
    totalActivos: number;
    completados: number;
    pendientesAcceso: number;
    rebotados: number;
  };
  guardias: OnboardingGuardiaItem[];
}

export interface OnboardingTimelineEvent {
  tipo: "onboarding_status" | "email_log";
  fecha: Date;
  descripcion: string;
  metadata?: Record<string, unknown>;
}

export interface GetPersonaOnboardingResult {
  onboardingStatus: {
    estado: OpsOnboardingEstado;
    emailEnviado: boolean;
    fechaEnvio: Date | null;
    accesoPortalGuardia: boolean;
    accesoPortalRondas: boolean;
    accesoPortalAcceso: boolean;
    completadoAt: Date | null;
    createdAt: Date;
    updatedAt: Date;
  } | null;
  timeline: OnboardingTimelineEvent[];
}

export interface GetEmailHistoryFilters {
  tenantId: string;
  tipo?: OpsEmailLogType;
  trigger?: OpsEmailTrigger;
  estado?: OpsEmailEstado;
  desde?: Date;
  hasta?: Date;
  loteId?: string;
  page?: number;
  pageSize?: number;
}

export interface EmailHistoryItem {
  id: string;
  guardiaId: string;
  personaNombre: string;
  destinatario: string;
  asunto: string;
  tipo: OpsEmailLogType;
  trigger: OpsEmailTrigger | null;
  estado: OpsEmailEstado;
  templateNombre: string | null;
  createdAt: Date;
  loteId: string | null;
}

export interface GetEmailHistoryResult {
  items: EmailHistoryItem[];
  total: number;
  page: number;
  pageSize: number;
}

export interface CreateTemplateInput {
  tenantId: string;
  nombre: string;
  asunto: string;
  tipo: OpsEmailTemplateType;
  contenido: object;
  variables?: string[];
  activo?: boolean;
  esDefault?: boolean;
}

export interface UpdateTemplateInput {
  nombre?: string;
  asunto?: string;
  tipo?: OpsEmailTemplateType;
  contenido?: object;
  variables?: string[];
  activo?: boolean;
  esDefault?: boolean;
}

export interface SendBulkEmailFilters {
  estado?: OpsOnboardingEstado;
  clienteId?: string;
  sitioId?: string;
  guardiaIds?: string[];
}

export interface SendBulkEmailInput {
  tenantId: string;
  filtros: SendBulkEmailFilters;
  templateId?: string;
  asunto: string;
  contenido: EmailBlock[];
  adjuntos?: Array<{ filename: string; content: Buffer }>;
}

export interface SendBulkEmailResult {
  loteId: string;
  enviados: number;
  errores: Array<{ guardiaId: string; error: string }>;
}

// ─────────────────────────────────────────────────────────────────────────────
// 1. getOnboardingDashboard
// ─────────────────────────────────────────────────────────────────────────────

export async function getOnboardingDashboard(
  tenantId: string,
  filters?: GetOnboardingDashboardFilters
): Promise<OnboardingDashboardResult> {
  const where: Parameters<typeof prisma.opsGuardia.findMany>[0]["where"] = {
    tenantId,
    lifecycleStatus: { in: ["contratado", "seleccionado", "te"] },
  };

  if (filters?.clienteId || filters?.sitioId) {
    where.currentInstallation = {};
    if (filters.sitioId) {
      where.currentInstallation.id = filters.sitioId;
    }
    if (filters.clienteId) {
      where.currentInstallation.accountId = filters.clienteId;
    }
  }

  const guardias = await prisma.opsGuardia.findMany({
    where,
    include: {
      persona: true,
      onboardingStatus: true,
      currentInstallation: { include: { account: true } },
      emailLogs: {
        where: { tipo: "AUTOMATICO" },
        orderBy: { createdAt: "desc" },
        take: 1,
      },
    },
  });

  let filtered = guardias;
  if (filters?.estado) {
    filtered = guardias.filter((g) => g.onboardingStatus?.estado === filters.estado);
  }

  const completados = filtered.filter((g) => g.onboardingStatus?.estado === "COMPLETADO").length;
  const pendientesAcceso = filtered.filter(
    (g) =>
      g.onboardingStatus?.emailEnviado &&
      g.onboardingStatus?.estado !== "COMPLETADO" &&
      !g.onboardingStatus?.accesoPortalGuardia
  ).length;
  const rebotados = await prisma.opsEmailLog.count({
    where: {
      tenantId,
      guardiaId: { in: filtered.map((g) => g.id) },
      estado: "REBOTADO",
    },
  });

  const items: OnboardingGuardiaItem[] = filtered.map((g) => {
    const lastEmail = g.emailLogs[0];
    let emailStatus: OnboardingGuardiaItem["emailStatus"] = "pendiente";
    if (lastEmail) {
      if (lastEmail.estado === "REBOTADO") emailStatus = "rebotado";
      else if (lastEmail.estado === "ERROR") emailStatus = "error";
      else if (lastEmail.estado === "ENVIADO" || lastEmail.estado === "ENTREGADO" || lastEmail.estado === "ABIERTO")
        emailStatus = "enviado";
    } else if (g.onboardingStatus?.emailEnviado) {
      emailStatus = "enviado";
    }

    return {
      id: g.id,
      personaNombre: [g.persona?.firstName, g.persona?.lastName].filter(Boolean).join(" ") || "Sin nombre",
      personaEmail: g.personalEmail ?? g.persona?.personalEmail ?? g.persona?.email ?? null,
      lifecycleStatus: g.lifecycleStatus,
      currentInstallationId: g.currentInstallationId,
      sitioNombre: g.currentInstallation?.name,
      clienteNombre: g.currentInstallation?.account?.name,
      onboardingStatus: g.onboardingStatus
        ? {
            estado: g.onboardingStatus.estado,
            emailEnviado: g.onboardingStatus.emailEnviado,
            fechaEnvio: g.onboardingStatus.fechaEnvio,
            accesoPortalGuardia: g.onboardingStatus.accesoPortalGuardia,
            accesoPortalRondas: g.onboardingStatus.accesoPortalRondas,
            accesoPortalAcceso: g.onboardingStatus.accesoPortalAcceso,
            completadoAt: g.onboardingStatus.completadoAt,
          }
        : null,
      emailStatus,
    };
  });

  return {
    metrics: {
      totalActivos: filtered.length,
      completados,
      pendientesAcceso,
      rebotados,
    },
    guardias: items,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// 2. getPersonaOnboarding
// ─────────────────────────────────────────────────────────────────────────────

export async function getPersonaOnboarding(guardiaId: string): Promise<GetPersonaOnboardingResult | null> {
  const [onboarding, emailLogs] = await Promise.all([
    prisma.opsOnboardingStatus.findUnique({ where: { guardiaId } }),
    prisma.opsEmailLog.findMany({
      where: { guardiaId },
      orderBy: { createdAt: "asc" },
      include: { template: true },
    }),
  ]);

  const timeline: OnboardingTimelineEvent[] = [];

  if (onboarding) {
    if (onboarding.createdAt) {
      timeline.push({
        tipo: "onboarding_status",
        fecha: onboarding.createdAt,
        descripcion: "Onboarding iniciado",
        metadata: { estado: onboarding.estado },
      });
    }
    if (onboarding.fechaEnvio) {
      timeline.push({
        tipo: "onboarding_status",
        fecha: onboarding.fechaEnvio,
        descripcion: "Email de onboarding enviado",
        metadata: { emailEnviado: true },
      });
    }
    if (onboarding.fechaAccesoGuardia) {
      timeline.push({
        tipo: "onboarding_status",
        fecha: onboarding.fechaAccesoGuardia,
        descripcion: "Primer acceso al portal guardia",
      });
    }
    if (onboarding.fechaAccesoRondas) {
      timeline.push({
        tipo: "onboarding_status",
        fecha: onboarding.fechaAccesoRondas,
        descripcion: "Primer acceso al portal rondas",
      });
    }
    if (onboarding.fechaAccesoAcceso) {
      timeline.push({
        tipo: "onboarding_status",
        fecha: onboarding.fechaAccesoAcceso,
        descripcion: "Primer acceso al portal acceso",
      });
    }
    if (onboarding.completadoAt) {
      timeline.push({
        tipo: "onboarding_status",
        fecha: onboarding.completadoAt,
        descripcion: "Onboarding completado",
        metadata: { estado: "COMPLETADO" },
      });
    }
  }

  for (const log of emailLogs) {
    timeline.push({
      tipo: "email_log",
      fecha: log.createdAt,
      descripcion: `Email ${log.estado.toLowerCase()} - ${log.asunto}`,
      metadata: {
        destinatario: log.destinatario,
        estado: log.estado,
        templateNombre: log.template?.nombre,
      },
    });
  }

  timeline.sort((a, b) => a.fecha.getTime() - b.fecha.getTime());

  return {
    onboardingStatus: onboarding
      ? {
          estado: onboarding.estado,
          emailEnviado: onboarding.emailEnviado,
          fechaEnvio: onboarding.fechaEnvio,
          accesoPortalGuardia: onboarding.accesoPortalGuardia,
          accesoPortalRondas: onboarding.accesoPortalRondas,
          accesoPortalAcceso: onboarding.accesoPortalAcceso,
          completadoAt: onboarding.completadoAt,
          createdAt: onboarding.createdAt,
          updatedAt: onboarding.updatedAt,
        }
      : null,
    timeline,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// 3. resendOnboardingEmail
// ─────────────────────────────────────────────────────────────────────────────

export async function resendOnboardingEmail(
  guardiaId: string,
  tenantId: string
): Promise<{ success: boolean; error?: string }> {
  try {
    await prisma.opsOnboardingStatus.upsert({
      where: { guardiaId },
      create: { tenantId, guardiaId, estado: "PENDIENTE", emailEnviado: false },
      update: { emailEnviado: false },
    });
    await handleGuardActivation(guardiaId, tenantId);
    return { success: true };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Error desconocido";
    return { success: false, error: message };
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// 4. markOnboardingComplete
// ─────────────────────────────────────────────────────────────────────────────

export async function markOnboardingComplete(guardiaId: string): Promise<{ success: boolean; error?: string }> {
  try {
    await prisma.opsOnboardingStatus.update({
      where: { guardiaId },
      data: { estado: "COMPLETADO", completadoAt: new Date() },
    });
    return { success: true };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Error desconocido";
    return { success: false, error: message };
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// 5. getEmailHistory
// ─────────────────────────────────────────────────────────────────────────────

export async function getEmailHistory(
  filters: GetEmailHistoryFilters
): Promise<GetEmailHistoryResult> {
  const page = filters.page ?? 1;
  const pageSize = filters.pageSize ?? 20;
  const skip = (page - 1) * pageSize;

  const where: Parameters<typeof prisma.opsEmailLog.findMany>[0]["where"] = {
    tenantId: filters.tenantId,
  };
  if (filters.tipo) where.tipo = filters.tipo;
  if (filters.trigger) where.trigger = filters.trigger;
  if (filters.estado) where.estado = filters.estado;
  if (filters.loteId) where.loteId = filters.loteId;
  if (filters.desde || filters.hasta) {
    where.createdAt = {};
    if (filters.desde) where.createdAt.gte = filters.desde;
    if (filters.hasta) where.createdAt.lte = filters.hasta;
  }

  const [items, total] = await Promise.all([
    prisma.opsEmailLog.findMany({
      where,
      include: { guardia: { include: { persona: true } }, template: true },
      orderBy: { createdAt: "desc" },
      skip,
      take: pageSize,
    }),
    prisma.opsEmailLog.count({ where }),
  ]);

  return {
    items: items.map((log) => ({
      id: log.id,
      guardiaId: log.guardiaId,
      personaNombre:
        [log.guardia.persona?.firstName, log.guardia.persona?.lastName]
          .filter(Boolean)
          .join(" ") || "Sin nombre",
      destinatario: log.destinatario,
      asunto: log.asunto,
      tipo: log.tipo,
      trigger: log.trigger,
      estado: log.estado,
      templateNombre: log.template?.nombre ?? null,
      createdAt: log.createdAt,
      loteId: log.loteId,
    })),
    total,
    page,
    pageSize,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// 6. getTemplates
// ─────────────────────────────────────────────────────────────────────────────

export async function getTemplates(
  tenantId: string,
  tipo?: OpsEmailTemplateType
) {
  return prisma.opsEmailTemplate.findMany({
    where: {
      tenantId,
      ...(tipo && { tipo }),
    },
    orderBy: [{ esDefault: "desc" }, { nombre: "asc" }],
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// 7. getTemplate
// ─────────────────────────────────────────────────────────────────────────────

export async function getTemplate(id: string) {
  return prisma.opsEmailTemplate.findUnique({ where: { id } });
}

// ─────────────────────────────────────────────────────────────────────────────
// 8. createTemplate
// ─────────────────────────────────────────────────────────────────────────────

export async function createTemplate(
  input: CreateTemplateInput
) {
  return prisma.opsEmailTemplate.create({
    data: {
      tenantId: input.tenantId,
      nombre: input.nombre,
      asunto: input.asunto,
      tipo: input.tipo,
      contenido: input.contenido,
      variables: input.variables ?? [],
      activo: input.activo ?? true,
      esDefault: input.esDefault ?? false,
    },
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// 9. updateTemplate
// ─────────────────────────────────────────────────────────────────────────────

export async function updateTemplate(
  id: string,
  data: UpdateTemplateInput
) {
  return prisma.opsEmailTemplate.update({
    where: { id },
    data: {
      ...(data.nombre !== undefined && { nombre: data.nombre }),
      ...(data.asunto !== undefined && { asunto: data.asunto }),
      ...(data.tipo !== undefined && { tipo: data.tipo }),
      ...(data.contenido !== undefined && { contenido: data.contenido }),
      ...(data.variables !== undefined && { variables: data.variables }),
      ...(data.activo !== undefined && { activo: data.activo }),
      ...(data.esDefault !== undefined && { esDefault: data.esDefault }),
    },
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// 10. deleteTemplate
// ─────────────────────────────────────────────────────────────────────────────

export async function deleteTemplate(
  id: string
): Promise<{ success: boolean; error?: string }> {
  const envios = await prisma.opsEmailLog.count({ where: { templateId: id } });
  if (envios > 0) {
    await prisma.opsEmailTemplate.update({
      where: { id },
      data: { activo: false },
    });
    return { success: true };
  }
  await prisma.opsEmailTemplate.delete({ where: { id } });
  return { success: true };
}

// ─────────────────────────────────────────────────────────────────────────────
// 11. setDefaultTemplate
// ─────────────────────────────────────────────────────────────────────────────

export async function setDefaultTemplate(
  id: string,
  tipo: OpsEmailTemplateType
): Promise<{ success: boolean; error?: string }> {
  const template = await prisma.opsEmailTemplate.findUnique({ where: { id } });
  if (!template) return { success: false, error: "Plantilla no encontrada" };

  await prisma.$transaction([
    prisma.opsEmailTemplate.updateMany({
      where: { tenantId: template.tenantId, tipo, esDefault: true },
      data: { esDefault: false },
    }),
    prisma.opsEmailTemplate.update({
      where: { id },
      data: { esDefault: true },
    }),
  ]);
  return { success: true };
}

// ─────────────────────────────────────────────────────────────────────────────
// 12. sendBulkEmail
// ─────────────────────────────────────────────────────────────────────────────

export async function sendBulkEmail(
  input: SendBulkEmailInput
): Promise<SendBulkEmailResult> {
  const loteId = randomUUID();
  const errores: Array<{ guardiaId: string; error: string }> = [];
  let enviados = 0;

  let guardiaIds: string[] = [];

  if (input.filtros.guardiaIds?.length) {
    guardiaIds = input.filtros.guardiaIds;
  } else {
    const where: Parameters<typeof prisma.opsGuardia.findMany>[0]["where"] = {
      tenantId: input.tenantId,
      lifecycleStatus: { in: ["contratado", "seleccionado", "te"] },
    };
    if (input.filtros.sitioId || input.filtros.clienteId) {
      where.currentInstallation = {};
      if (input.filtros.sitioId) where.currentInstallation.id = input.filtros.sitioId;
      if (input.filtros.clienteId) where.currentInstallation.accountId = input.filtros.clienteId;
    }
    if (input.filtros.estado) {
      where.onboardingStatus = { estado: input.filtros.estado };
    }
    const guardias = await prisma.opsGuardia.findMany({
      where,
      select: { id: true },
    });
    guardiaIds = guardias.map((g) => g.id);
  }

  let asunto = input.asunto;
  let contenido = input.contenido;

  if (input.templateId) {
    const template = await prisma.opsEmailTemplate.findUnique({
      where: { id: input.templateId },
    });
    if (template) {
      asunto = template.asunto;
      contenido = (template.contenido as EmailBlock[]) ?? contenido;
    }
  }

  for (const guardiaId of guardiaIds) {
    const result = await sendEmailToGuardia({
      tenantId: input.tenantId,
      guardiaId,
      templateId: input.templateId,
      asunto,
      contenido,
      tipo: "MANUAL_MASIVO",
      loteId,
    });
    if (result.success) {
      enviados++;
    } else {
      errores.push({ guardiaId, error: result.error ?? "Error desconocido" });
    }
  }

  return { loteId, enviados, errores };
}
