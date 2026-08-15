/**
 * Seed: secciones fijas institucionales + indicadores de propuesta (tenant Gard).
 * Textos alineados a src/lib/cpq/fixed-sections.ts (GARD_FIXED_SECTION_SEED).
 */
import type { PrismaClient } from "@prisma/client";

const SECTIONS = [
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
] as const;

const INDICATORS_KEY = "cpq.proposalIndicators";
const DEFAULT_INDICATORS = [
  { id: "anos_experiencia", label: "Años de experiencia", value: "", metricKey: null, visible: false },
  { id: "cobertura_nacional", label: "Cobertura", value: "Nacional", metricKey: null, visible: false },
  { id: "disponibilidad", label: "Disponibilidad", value: "24/7", metricKey: null, visible: true },
  { id: "plataforma", label: "Plataforma", value: "OPAI", metricKey: null, visible: true },
];

export async function seedCpqProposalInstitutional(prisma: PrismaClient, tenantId: string) {
  console.log("🌱 Seeding CPQ fixed sections + proposal indicators...");

  for (const s of SECTIONS) {
    await prisma.cpqFixedSection.upsert({
      where: { tenantId_key: { tenantId, key: s.key } },
      create: {
        tenantId,
        key: s.key,
        title: s.title,
        content: s.content,
        sortOrder: s.sortOrder,
        active: true,
      },
      update: {
        title: s.title,
        content: s.content,
        sortOrder: s.sortOrder,
        active: true,
      },
    });
  }

  await prisma.setting.upsert({
    where: { tenantId_key: { tenantId, key: INDICATORS_KEY } },
    create: {
      tenantId,
      key: INDICATORS_KEY,
      value: JSON.stringify(DEFAULT_INDICATORS),
      type: "json",
      category: "cpq",
    },
    update: {},
  });

  console.log("✅ CPQ institutional proposal seed ready");
}
