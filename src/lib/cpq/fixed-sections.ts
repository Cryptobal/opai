/**
 * Biblioteca de secciones fijas institucionales por tenant.
 * Seed Gard/ENEX + CRUD helpers. Scoped siempre por tenantId.
 */
import { prisma } from "@/lib/prisma";
import type { Prisma } from "@prisma/client";

export const PROPOSAL_INDICATORS_SETTING_KEY = "cpq.proposalIndicators";

export type ProposalIndicator = {
  id: string;
  label: string;
  /** Valor manual mostrado en el PDF. */
  value: string;
  /** Métrica OPAI opcional (reservado; el valor manual tiene prioridad). */
  metricKey?: string | null;
  visible: boolean;
};

export type FixedSectionDef = {
  key: string;
  title: string;
  content: string;
  sortOrder: number;
};

/** Claves canónicas de la plantilla institucional (orden del índice comercial). */
export const INSTITUTIONAL_FIXED_KEYS = [
  "quienes_somos",
  "uniformes_epp",
  "capacitacion",
  "opai_sla",
  "supervision_contingencias",
  "preventivo",
  "experiencia_certificaciones",
  "matriz_oferente",
] as const;

export type InstitutionalFixedKey = (typeof INSTITUTIONAL_FIXED_KEYS)[number];

/** Textos base Gard/ENEX — sin datos de tamaño ni cifras sensibles. */
export const GARD_FIXED_SECTION_SEED: FixedSectionDef[] = [
  {
    key: "quienes_somos",
    title: "Quiénes somos y organigrama",
    sortOrder: 10,
    content: `Somos una empresa chilena de seguridad privada integral. Seleccionamos, preparamos y desplegamos personal; definimos protocolos; supervisamos el terreno y sostenemos la continuidad del servicio.

Operamos con OPAI, plataforma tecnológica propia que conecta guardias, supervisores, operaciones y clientes para registrar cada evento, automatizar alertas y convertir actividad en información accionable.

Organigrama operativo (cargos):
- Gerencia General
- Gerencia de Operaciones
- Jefatura de Terreno
- Supervisión de Turno
- Centro de Control Operacional (CCO)
- Guardia de Seguridad

Una sola responsabilidad operacional: personas, supervisión, tecnología y servicio al cliente bajo el mismo modelo.`,
  },
  {
    key: "uniformes_epp",
    title: "Uniformes y EPP",
    sortOrder: 20,
    content: `El personal asignado opera con uniforme corporativo completo e identificación visible. El equipamiento de protección personal (EPP) se define según el riesgo de la instalación y la normativa vigente (D.S. 594 y complementarias).

Incluye, según alcance del servicio: camisa o polo operativo, pantalón cargo, calzado de seguridad, abrigo impermeable o polar, chaleco reflectante y elementos específicos del puesto (casco, guantes, protectores, etc.).

El reposición y mantención del uniforme forman parte del estándar de presentación del servicio.`,
  },
  {
    key: "capacitacion",
    title: "Capacitación",
    sortOrder: 30,
    content: `La calidad del servicio comienza antes de asignar a una persona y se sostiene con capacitación continua.

Inducción general: protocolos de seguridad privada, trato al cliente, registro de eventos y uso de OPAI.
Inducción específica del sitio: puntos críticos, contactos de emergencia, rutas de evacuación y particularidades de la instalación.
Refuerzos periódicos: simulacros, actualizaciones normativas y evaluación de desempeño por supervisión.

Toda capacitación queda registrada y disponible para auditoría del cliente.`,
  },
  {
    key: "opai_sla",
    title: "OPAI y SLA operativo",
    sortOrder: 40,
    content: `OPAI es la plataforma que sostiene la trazabilidad del servicio: marcaciones, rondas con evidencia, incidentes con workflow, reportes y portal del cliente.

SLA operativo referencial (ajustable en contrato según alcance):
- Acuse de incidente crítico: respuesta inmediata vía CCO.
- Escalamiento a supervisión de terreno: según criticidad definida con el cliente.
- Informe de incidente con evidencia: dentro de la jornada operativa.
- Reportabilidad: diaria, semanal y ejecutiva según acuerdo.

Los tiempos definitivos se establecen en el contrato de servicio.`,
  },
  {
    key: "supervision_contingencias",
    title: "Supervisión y contingencias",
    sortOrder: 50,
    content: `La supervisión de terreno y el Centro de Control Operacional sostienen cobertura, calidad y respuesta.

Supervisión: visitas programadas y no programadas, corrección en sitio, checklist de presentación y protocolo.
CCO: monitoreo de alertas, seguimiento de rondas e incidentes, respaldo comunicacional 24/7.
Plan de contingencia por inasistencia: reemplazo con personal calificado, sin dejar el puesto descubierto, con registro en OPAI.

La continuidad operacional es un compromiso explícito del modelo de servicio.`,
  },
  {
    key: "preventivo",
    title: "Enfoque preventivo",
    sortOrder: 60,
    content: `Nuestro modelo privilegia la prevención sobre la reacción. Identificamos riesgos del sitio, definimos puntos de control y convertimos la actividad diaria en evidencia que anticipa desviaciones.

Incluye: análisis de puntos críticos, rondas con trazabilidad, registro sistemático de hallazgos, seguimiento hasta el cierre y mejora continua con el cliente.

Cumplimiento normativo de referencia: D.S. 44 (gestión preventiva de riesgos), normativa de seguridad privada y protocolos internos auditables.`,
  },
  {
    key: "experiencia_certificaciones",
    title: "Experiencia y certificaciones",
    sortOrder: 70,
    content: `Contamos con experiencia en sectores corporativos, industriales, logísticos, salud, retail y energía. La cartera de referencias que se incluye en esta propuesta corresponde únicamente a cuentas autorizadas por el cliente para figurar como referencia.

Certificaciones y cumplimientos (según vigencia del oferente):
- Autorización OS10 / Prefectura como empresa de seguridad privada.
- Personal con acreditación vigente según normativa aplicable.
- Pólizas de responsabilidad civil y garantías según contrato.
- Sistema de gestión de calidad y protocolos documentados.

Los indicadores publicables del oferente se configuran por empresa y solo se imprimen si están activados.`,
  },
  {
    key: "matriz_oferente",
    title: "Matriz e identificación del oferente",
    sortOrder: 80,
    content: `Identificación del oferente (completar con datos de la empresa):
- Razón social:
- RUT:
- Domicilio:
- Representante legal:
- RUT representante:
- Correo / teléfono comercial:

La matriz de cumplimiento de esta propuesta resume, cuando aplica, los requisitos de las bases y la sección que los aborda. En propuestas comerciales sin bases, este capítulo identifica al oferente y deja constancia de la firma del representante legal.`,
  },
];

export const DEFAULT_PROPOSAL_INDICATORS: ProposalIndicator[] = [
  { id: "anos_experiencia", label: "Años de experiencia", value: "", metricKey: null, visible: false },
  { id: "cobertura_nacional", label: "Cobertura", value: "Nacional", metricKey: null, visible: false },
  { id: "disponibilidad", label: "Disponibilidad", value: "24/7", metricKey: null, visible: true },
  { id: "plataforma", label: "Plataforma", value: "OPAI", metricKey: null, visible: true },
];

export async function listFixedSections(tenantId: string, opts?: { activeOnly?: boolean }) {
  return prisma.cpqFixedSection.findMany({
    where: {
      tenantId,
      ...(opts?.activeOnly ? { active: true } : {}),
    },
    orderBy: [{ sortOrder: "asc" }, { title: "asc" }],
  });
}

export async function getFixedSectionByKey(tenantId: string, key: string) {
  return prisma.cpqFixedSection.findUnique({
    where: { tenantId_key: { tenantId, key } },
  });
}

export async function ensureFixedSectionsSeeded(tenantId: string): Promise<void> {
  const count = await prisma.cpqFixedSection.count({ where: { tenantId } });
  if (count > 0) return;
  await prisma.cpqFixedSection.createMany({
    data: GARD_FIXED_SECTION_SEED.map((s) => ({
      tenantId,
      key: s.key,
      title: s.title,
      content: s.content,
      sortOrder: s.sortOrder,
      active: true,
    })),
    skipDuplicates: true,
  });
}

export async function upsertFixedSection(
  tenantId: string,
  input: {
    key: string;
    title: string;
    content: string;
    sortOrder?: number;
    active?: boolean;
  },
) {
  return prisma.cpqFixedSection.upsert({
    where: { tenantId_key: { tenantId, key: input.key } },
    create: {
      tenantId,
      key: input.key,
      title: input.title,
      content: input.content,
      sortOrder: input.sortOrder ?? 100,
      active: input.active ?? true,
    },
    update: {
      title: input.title,
      content: input.content,
      ...(input.sortOrder != null ? { sortOrder: input.sortOrder } : {}),
      ...(input.active != null ? { active: input.active } : {}),
    },
  });
}

export async function saveFixedSectionFromProposal(
  tenantId: string,
  input: { title: string; content: string; key?: string },
) {
  const key =
    input.key?.trim() ||
    input.title
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-z0-9]+/g, "_")
      .replace(/^_|_$/g, "")
      .slice(0, 60) ||
    `custom_${Date.now()}`;
  const maxOrder = await prisma.cpqFixedSection.aggregate({
    where: { tenantId },
    _max: { sortOrder: true },
  });
  return upsertFixedSection(tenantId, {
    key,
    title: input.title.trim(),
    content: input.content,
    sortOrder: (maxOrder._max.sortOrder ?? 0) + 10,
    active: true,
  });
}

export async function getProposalIndicators(tenantId: string): Promise<ProposalIndicator[]> {
  const row = await prisma.setting.findUnique({
    where: { tenantId_key: { tenantId, key: PROPOSAL_INDICATORS_SETTING_KEY } },
  });
  if (!row?.value) return DEFAULT_PROPOSAL_INDICATORS.map((i) => ({ ...i }));
  try {
    const parsed = JSON.parse(row.value) as ProposalIndicator[];
    if (!Array.isArray(parsed)) return DEFAULT_PROPOSAL_INDICATORS.map((i) => ({ ...i }));
    return parsed.filter((i) => i && typeof i.id === "string" && typeof i.label === "string");
  } catch {
    return DEFAULT_PROPOSAL_INDICATORS.map((i) => ({ ...i }));
  }
}

export async function saveProposalIndicators(
  tenantId: string,
  indicators: ProposalIndicator[],
): Promise<ProposalIndicator[]> {
  const cleaned = indicators.map((i) => ({
    id: String(i.id).slice(0, 80),
    label: String(i.label).slice(0, 120),
    value: String(i.value ?? "").slice(0, 200),
    metricKey: i.metricKey ? String(i.metricKey).slice(0, 80) : null,
    visible: Boolean(i.visible),
  }));
  await prisma.setting.upsert({
    where: { tenantId_key: { tenantId, key: PROPOSAL_INDICATORS_SETTING_KEY } },
    create: {
      tenantId,
      key: PROPOSAL_INDICATORS_SETTING_KEY,
      value: JSON.stringify(cleaned),
      type: "json",
      category: "cpq",
    },
    update: {
      value: JSON.stringify(cleaned),
      type: "json",
      category: "cpq",
    },
  });
  return cleaned;
}

/** Cuentas del tenant marcadas para cartera de referencias. */
export async function listReferenceAccounts(tenantId: string) {
  return prisma.crmAccount.findMany({
    where: { tenantId, useAsReference: true },
    select: {
      id: true,
      name: true,
      industry: true,
      segment: true,
      commune: true,
      city: true,
    },
    orderBy: { name: "asc" },
    take: 40,
  });
}

export type FixedSectionRow = Prisma.CpqFixedSectionGetPayload<object>;
