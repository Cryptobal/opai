/**
 * ATS Job Posting Snippets
 *
 * Fragmentos predefinidos para agilizar la creación de avisos de empleo.
 * Configurables por tenant via Setting (key: "ats_snippets").
 */

import { prisma } from "@/lib/prisma";

// ─── Types ──────────────────────────────────────────────────────────

export type SnippetField = "titulo" | "descripcion" | "funciones";

export interface Snippet {
  id: string;
  label: string;
  text: string;
}

export interface AtsSnippetsConfig {
  titulo: Snippet[];
  descripcion: Snippet[];
  funciones: Snippet[];
}

// ─── Defaults (seguridad privada) ───────────────────────────────────

export const DEFAULT_SNIPPETS: AtsSnippetsConfig = {
  titulo: [
    { id: "t1", label: "Guardia — zona", text: "Guardia de Seguridad — " },
    { id: "t2", label: "Guardia OS10", text: "Guardia de Seguridad OS10 — " },
    { id: "t3", label: "Guardia nocturno", text: "Guardia de Seguridad Turno Nocturno — " },
    { id: "t4", label: "Supervisor rondas", text: "Supervisor de Rondas — " },
    { id: "t5", label: "Controlador acceso", text: "Controlador de Acceso — " },
    { id: "t6", label: "Guardia evento", text: "Guardia de Seguridad para Eventos — " },
    { id: "t7", label: "Jefe de turno", text: "Jefe de Turno de Seguridad — " },
  ],
  descripcion: [
    {
      id: "d1",
      label: "Estándar seguridad",
      text: `Empresa líder en seguridad privada busca Guardia de Seguridad para incorporación inmediata. Ofrecemos estabilidad laboral, renta acorde al mercado y un excelente ambiente de trabajo.

Beneficios:
• Contrato indefinido tras periodo de prueba
• Renta líquida competitiva + horas extra
• Uniforme y equipamiento completo
• Capacitación continua
• Seguro complementario de salud`,
    },
    {
      id: "d2",
      label: "Seguridad residencial",
      text: `Importante empresa de seguridad privada requiere Guardia de Seguridad para condominio residencial. Buscamos personas responsables, con buena presencia y trato amable con residentes.

Beneficios:
• Contrato indefinido
• Renta líquida competitiva
• Uniforme y equipamiento
• Turnos estables
• Aguinaldos y bonos`,
    },
    {
      id: "d3",
      label: "Seguridad industrial",
      text: `Empresa de seguridad privada requiere Guardias de Seguridad para faena industrial. Se ofrece excelente renta y transporte al lugar de trabajo.

Beneficios:
• Contrato indefinido
• Renta sobre el mercado
• Transporte ida y vuelta
• Alimentación en faena
• Seguro de vida y salud complementario`,
    },
    {
      id: "d4",
      label: "Seguridad retail",
      text: `Empresa de seguridad requiere Guardias para local comercial en mall. Se busca personal con experiencia en prevención de pérdidas y atención al público.

Beneficios:
• Contrato indefinido
• Renta competitiva
• Uniforme y equipamiento
• Capacitación en prevención de pérdidas`,
    },
  ],
  funciones: [
    {
      id: "f1",
      label: "Control acceso",
      text: `• Control de acceso de personas y vehículos
• Registro de ingreso y salida en bitácora
• Verificación de credenciales e identificación
• Inspección visual de bultos y paquetes`,
    },
    {
      id: "f2",
      label: "Rondas y vigilancia",
      text: `• Ejecución de rondas periódicas según protocolo
• Vigilancia mediante circuito cerrado (CCTV)
• Detección y reporte de anomalías
• Monitoreo de perímetro y áreas comunes`,
    },
    {
      id: "f3",
      label: "Prevención y emergencias",
      text: `• Prevención de robos, hurtos y actos vandálicos
• Respuesta ante emergencias y evacuaciones
• Aplicación de protocolos de seguridad
• Coordinación con servicios de emergencia (Carabineros, Bomberos)`,
    },
    {
      id: "f4",
      label: "Atención y reportes",
      text: `• Atención y orientación al público
• Elaboración de reportes e informes diarios
• Manejo de libro de novedades
• Comunicación permanente con central de operaciones`,
    },
    {
      id: "f5",
      label: "Seguridad electrónica",
      text: `• Operación de sistemas de alarma y CCTV
• Monitoreo de sensores de intrusión
• Control de sistemas de acceso electrónico
• Reporte de fallas técnicas en equipos de seguridad`,
    },
  ],
};

// ─── Persistence ────────────────────────────────────────────────────

const SETTING_KEY = "ats_snippets";

let snippetsCache: { data: AtsSnippetsConfig; tenantId: string; expiresAt: number } | null = null;
const CACHE_TTL = 5 * 60 * 1000;

export async function getAtsSnippets(tenantId: string): Promise<AtsSnippetsConfig> {
  if (snippetsCache && snippetsCache.tenantId === tenantId && snippetsCache.expiresAt > Date.now()) {
    return snippetsCache.data;
  }

  const setting = await prisma.setting.findFirst({
    where: { key: SETTING_KEY, tenantId },
  });

  const data = setting
    ? { ...DEFAULT_SNIPPETS, ...JSON.parse(setting.value) }
    : { ...DEFAULT_SNIPPETS };

  snippetsCache = { data, tenantId, expiresAt: Date.now() + CACHE_TTL };
  return data;
}

export async function updateAtsSnippets(
  tenantId: string,
  snippets: AtsSnippetsConfig,
): Promise<void> {
  const existing = await prisma.setting.findFirst({
    where: { key: SETTING_KEY, tenantId },
  });
  const value = JSON.stringify(snippets);

  if (existing) {
    await prisma.setting.update({ where: { id: existing.id }, data: { value } });
  } else {
    await prisma.setting.create({
      data: { key: SETTING_KEY, value, type: "json", category: "ats", tenantId },
    });
  }

  snippetsCache = null;
}
