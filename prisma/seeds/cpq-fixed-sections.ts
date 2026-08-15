/**
 * Seed de secciones fijas institucionales (formato ENEX / Gard).
 * Espejo de GARD_FIXED_SECTION_SEEDS en src/lib/cpq/fixed-sections.ts.
 */
import type { PrismaClient } from "@prisma/client";

const SEEDS = [
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
] as const;

export async function seedCpqFixedSections(prisma: PrismaClient, tenantId: string) {
  console.log("🌱 Seeding CPQ fixed sections (institucional)...");
  let created = 0;
  for (const seed of SEEDS) {
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
  console.log(`✅ CPQ fixed sections: ${created} creadas (idempotente)`);
}
