/**
 * Biblioteca de secciones fijas (institucionales) por tenant.
 * Seed Gard: textos base formato ENEX (sin datos de tamaño sensibles).
 */
import { prisma } from "@/lib/prisma";

export type FixedSectionKey =
  | "quienes_somos"
  | "uniformes_epp"
  | "capacitacion"
  | "opai_sla"
  | "supervision_contingencias"
  | "preventivo"
  | "experiencia_certificaciones"
  | "matriz_identificacion_oferente";

export type FixedSectionSeed = {
  key: FixedSectionKey;
  title: string;
  content: string;
  sortOrder: number;
};

/** Orden institucional: estas keys se insertan en el cuerpo (tras Dotación). */
export const FIXED_BODY_KEYS: FixedSectionKey[] = [
  "uniformes_epp",
  "capacitacion",
  "opai_sla",
  "supervision_contingencias",
  "preventivo",
];

export const FIXED_QUIENES_KEY: FixedSectionKey = "quienes_somos";
export const FIXED_EXPERIENCIA_KEY: FixedSectionKey = "experiencia_certificaciones";
export const FIXED_MATRIZ_OFERENTE_KEY: FixedSectionKey = "matriz_identificacion_oferente";

export const GARD_FIXED_SECTION_SEEDS: FixedSectionSeed[] = [
  {
    key: "quienes_somos",
    title: "Quiénes somos y organigrama",
    sortOrder: 10,
    content: `Gard Security es una empresa chilena de seguridad privada orientada a la continuidad operacional de sus clientes. Operamos con un modelo preventivo, supervisión activa y tecnología propia (OPAI), desarrollada por LX3.ai.

Nuestra estructura de servicio se organiza por cargos (sin datos de tamaño):

• Gerencia General
• Gerencia de Operaciones
• Jefatura de Operaciones / Coordinación
• Supervisión de terreno
• Guardias e inspectores en instalación
• Central de monitoreo / soporte OPAI

El organigrama operativo se adapta a cada servicio; los cargos anteriores son la línea base institucional.`,
  },
  {
    key: "uniformes_epp",
    title: "Uniformes y EPP",
    sortOrder: 20,
    content: `El personal asignado cuenta con uniforme corporativo completo y elementos de protección personal (EPP) según el riesgo del sitio.

Incluye, según corresponda al servicio:
• Uniforme operativo (camisa/polo, pantalón, calzado de seguridad)
• Identificación visible
• Chaleco reflectante / alta visibilidad cuando el sitio lo requiera
• EPP adicional (casco, guantes, anteojos, etc.) según matriz de riesgos del cliente

El reposición y control de dotación de uniformes se gestiona de forma periódica para mantener presentación y cumplimiento normativo.`,
  },
  {
    key: "capacitacion",
    title: "Capacitación",
    sortOrder: 30,
    content: `Todo el personal operativo recibe inducción al servicio y capacitación continua alineada a los protocolos del cliente y a la normativa vigente de seguridad privada.

Ámbitos típicos:
• Inducción en sitio (accesos, zonas críticas, contactos de emergencia)
• Control de acceso y registro de visitas
• Respuesta a emergencias y evacuación
• Uso de OPAI (marcación, rondas, reportes)
• Actualización OS10 / requisitos del mandante cuando aplique

Las capacitaciones se registran y quedan disponibles para auditoría del cliente.`,
  },
  {
    key: "opai_sla",
    title: "OPAI y SLA",
    sortOrder: 40,
    content: `OPAI es la plataforma tecnológica propietaria con la que Gard opera el servicio: marcación geolocalizada, rondas, tickets, supervisión y reportes en tiempo real.

Compromisos de servicio (SLA base, ajustables por contrato):
• Disponibilidad de plataforma orientada a continuidad 24/7
• Alertas operativas con escalamiento a supervisión y jefatura
• Reportes periódicos (diarios/semanales/mensuales según acuerdo)
• Portal cliente para visibilidad de cobertura e incidencias

Los indicadores específicos del contrato se definen en la propuesta económica y en el anexo de servicio.`,
  },
  {
    key: "supervision_contingencias",
    title: "Supervisión y contingencias",
    sortOrder: 50,
    content: `La supervisión combina visitas de terreno, monitoreo remoto vía OPAI y una cadena de escalamiento clara.

Modelo de supervisión:
• Supervisión de turno / jefatura de operaciones
• Visitas programadas y no programadas a la instalación
• Revisión de marcaciones, rondas e incidencias
• Contacto permanente con el mandante para desviaciones

Plan de contingencias:
• Reemplazos ante ausencias (enfermedades, permisos)
• Refuerzos ante eventos especiales
• Protocolo de comunicación con el cliente ante incidentes críticos
• Continuidad operacional documentada por instalación`,
  },
  {
    key: "preventivo",
    title: "Enfoque preventivo",
    sortOrder: 60,
    content: `Nuestro enfoque privilegia la prevención por sobre la reacción: detección temprana, presencia visible, control de accesos y trazabilidad digital.

Pilares:
• Análisis de riesgos del sitio y puntos críticos
• Rondas y controles con evidencia en OPAI
• Coordinación con áreas del cliente (facilities, EHS, RRHH)
• Mejora continua a partir de hallazgos y reportes

El objetivo es reducir probabilidad e impacto de eventos, manteniendo evidencia auditable para el mandante.`,
  },
  {
    key: "experiencia_certificaciones",
    title: "Experiencia y certificaciones",
    sortOrder: 70,
    content: `Gard Security cuenta con experiencia en sectores corporativos, industriales, logísticos y de infraestructura crítica.

Certificaciones y cumplimiento (referencia institucional; se actualizan según vigencia):
• Cumplimiento OS10 y normativa de seguridad privada aplicable
• Procesos de selección, inducción y control documental del personal
• Operación con plataforma OPAI (trazabilidad y reportes)

La cartera de referencias se publica únicamente con cuentas expresamente autorizadas por el tenant (flag «Usar como referencia en propuestas»).`,
  },
  {
    key: "matriz_identificacion_oferente",
    title: "Matriz e identificación del oferente",
    sortOrder: 80,
    content: `Identificación del oferente (completar / validar con datos del tenant):

• Razón social: Gard Security SpA (o razón social vigente del tenant)
• RUT: según registro SII del tenant
• Domicilio comercial: según configuración de empresa
• Representante legal: según personería vigente
• Contacto comercial: ejecutivo a cargo de la propuesta

La matriz de cumplimiento (cuando aplica licitación) se genera automáticamente a partir de las referencias (§bases) de cada sección. Este bloque complementa la identificación formal del oferente y la firma del representante legal en el documento único.`,
  },
];

export type ProposalIndicator = {
  id: string;
  label: string;
  /** Valor manual mostrado en el PDF; vacío si se usa métrica OPAI. */
  value: string;
  /** Clave de métrica OPAI opcional (reservado; hoy se usa value). */
  metricKey?: string | null;
  visible: boolean;
};

export const DEFAULT_PROPOSAL_INDICATORS: ProposalIndicator[] = [
  { id: "anos_experiencia", label: "Años de experiencia", value: "", metricKey: null, visible: false },
  { id: "certificaciones", label: "Certificaciones vigentes", value: "", metricKey: null, visible: false },
  { id: "cobertura_nacional", label: "Cobertura", value: "", metricKey: null, visible: false },
  { id: "sla_respuesta", label: "SLA de respuesta", value: "", metricKey: null, visible: false },
];

export const PROPOSAL_INDICATORS_SETTING_KEY = "cpq.proposalIndicators";

export async function listFixedSections(tenantId: string, opts?: { activeOnly?: boolean }) {
  return prisma.cpqFixedSection.findMany({
    where: {
      tenantId,
      ...(opts?.activeOnly ? { isActive: true } : {}),
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
  await seedFixedSectionsForTenant(tenantId);
}

/** Seed idempotente: crea faltantes; no sobrescribe contenido editado. */
export async function seedFixedSectionsForTenant(tenantId: string): Promise<number> {
  let created = 0;
  for (const seed of GARD_FIXED_SECTION_SEEDS) {
    const existing = await prisma.cpqFixedSection.findUnique({
      where: { tenantId_key: { tenantId, key: seed.key } },
    });
    if (existing) continue;
    await prisma.cpqFixedSection.create({
      data: {
        tenantId,
        key: seed.key,
        title: seed.title,
        content: seed.content,
        sortOrder: seed.sortOrder,
        isActive: true,
      },
    });
    created += 1;
  }
  return created;
}

export async function upsertFixedSection(
  tenantId: string,
  input: {
    key: string;
    title: string;
    content: string;
    sortOrder?: number;
    isActive?: boolean;
  },
) {
  const key = input.key.trim().toLowerCase().replace(/\s+/g, "_").slice(0, 80);
  if (!key) throw new Error("FIXED_SECTION_KEY_REQUIRED");
  const title = input.title.trim();
  if (!title) throw new Error("FIXED_SECTION_TITLE_REQUIRED");
  return prisma.cpqFixedSection.upsert({
    where: { tenantId_key: { tenantId, key } },
    create: {
      tenantId,
      key,
      title,
      content: input.content ?? "",
      sortOrder: input.sortOrder ?? 100,
      isActive: input.isActive ?? true,
    },
    update: {
      title,
      content: input.content ?? "",
      ...(input.sortOrder != null ? { sortOrder: input.sortOrder } : {}),
      ...(input.isActive != null ? { isActive: input.isActive } : {}),
    },
  });
}

export async function saveFixedSectionAsNew(
  tenantId: string,
  input: { title: string; content: string; key?: string },
) {
  const base =
    input.key?.trim() ||
    input.title
      .trim()
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-z0-9]+/g, "_")
      .replace(/^_|_$/g, "")
      .slice(0, 60) ||
    "seccion";
  let key = base;
  let n = 0;
  while (await prisma.cpqFixedSection.findUnique({ where: { tenantId_key: { tenantId, key } } })) {
    n += 1;
    key = `${base}_${n}`.slice(0, 80);
  }
  const maxOrder = await prisma.cpqFixedSection.aggregate({
    where: { tenantId },
    _max: { sortOrder: true },
  });
  return prisma.cpqFixedSection.create({
    data: {
      tenantId,
      key,
      title: input.title.trim(),
      content: input.content,
      sortOrder: (maxOrder._max.sortOrder ?? 0) + 10,
      isActive: true,
    },
  });
}

export async function getProposalIndicators(tenantId: string): Promise<ProposalIndicator[]> {
  const row = await prisma.setting.findUnique({
    where: { tenantId_key: { tenantId, key: PROPOSAL_INDICATORS_SETTING_KEY } },
  });
  if (!row?.value) return DEFAULT_PROPOSAL_INDICATORS.map((d) => ({ ...d }));
  try {
    const parsed = JSON.parse(row.value) as unknown;
    if (!Array.isArray(parsed)) return DEFAULT_PROPOSAL_INDICATORS.map((d) => ({ ...d }));
    return parsed
      .filter((x): x is ProposalIndicator => Boolean(x && typeof x === "object" && typeof (x as ProposalIndicator).id === "string"))
      .map((x) => ({
        id: String(x.id),
        label: String(x.label ?? ""),
        value: String(x.value ?? ""),
        metricKey: x.metricKey ?? null,
        visible: Boolean(x.visible),
      }));
  } catch {
    return DEFAULT_PROPOSAL_INDICATORS.map((d) => ({ ...d }));
  }
}

export async function saveProposalIndicators(
  tenantId: string,
  indicators: ProposalIndicator[],
): Promise<ProposalIndicator[]> {
  const cleaned = indicators.map((i) => ({
    id: String(i.id).slice(0, 64),
    label: String(i.label ?? "").slice(0, 120),
    value: String(i.value ?? "").slice(0, 200),
    metricKey: i.metricKey ? String(i.metricKey).slice(0, 64) : null,
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
