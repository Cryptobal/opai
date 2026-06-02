/**
 * Defaults de la Presentación de Empresa (contenido Gard).
 *
 * Es el fallback que usa getTenantPresentationContent cuando un tenant no
 * configuró su propio contenido. Mantiene exactamente el discurso que hoy está
 * hardcodeado en CompanyPresentationView / GardServiceIncludes, para que la
 * vista de Gard no cambie tras la migración a contenido tenant-driven.
 *
 * Es un módulo puro (sin React, sin Node), por lo que puede importarse tanto
 * desde el servidor como desde el cliente.
 */
import type { PresentationContent } from "@/lib/tenant-presentation";

export const GARD_PRESENTATION_CONTENT: PresentationContent = {
  valueProp:
    "Seguridad privada con tecnología propia. El único sistema operativo integral de seguridad en Chile.",
  stats: [
    { value: "12+", label: "Años de experiencia" },
    { value: "150+", label: "Clientes activos" },
    { value: "2.500+", label: "Guardias operando" },
    { value: "97%", label: "Retención de clientes" },
  ],
  sections: [
    {
      key: "seguridad",
      title: "Seguridad Integral",
      items: [
        "Guardias seleccionados con evaluación psicométrica y verificación de antecedentes",
        "Protocolos operativos diseñados para cada tipo de instalación",
        "Supervisión presencial + remota con verificación GPS",
        "Cobertura 24/7 con planes de contingencia activos",
      ],
    },
    {
      key: "tecnologia",
      title: "Tecnología OPAI",
      items: [
        "Plataforma propia — no usamos software genérico",
        "Rondas GPS con geofencing y verificación en tiempo real",
        "Trust Score: evaluación objetiva de cada guardia basada en datos",
        "IA predictiva para detección de patrones y anomalías",
      ],
    },
    {
      key: "cumplimiento",
      title: "Cumplimiento Normativo",
      items: [
        "OS-10 y documentación actualizada de todos los guardias",
        "Contratos laborales al día con fiscalización interna",
        "Cumplimiento de normativa de seguridad privada vigente",
        "Auditorías internas periódicas con reporte al cliente",
      ],
    },
    {
      key: "diferenciadores",
      title: "Diferenciadores",
      items: [
        "Única empresa en Chile con sistema operativo propio de seguridad",
        "Transparencia total: el cliente ve todo en tiempo real",
        "Sin subcontratación — todos los guardias son nuestros",
        "Modelo de mejora continua basado en datos operacionales",
      ],
    },
    {
      key: "certificaciones",
      title: "Certificaciones",
      items: [
        "Empresa de seguridad autorizada por OS-10 de Carabineros",
        "Procesos alineados con estándares ISO 9001",
        "Personal certificado en primeros auxilios y emergencias",
        "Capacitación continua con evaluación de desempeño",
      ],
    },
    {
      key: "portal",
      title: "Portal del Cliente",
      items: [
        "Acceso 24/7 a métricas, reportes y documentación",
        "Chat directo con tu ejecutivo sin intermediarios",
        "Control de acceso digital con registro de visitas",
        "Encuestas de satisfacción y sistema de tickets",
      ],
    },
  ],
  // Espejo de los defaults de GardServiceIncludes.tsx
  serviceIncludes: [
    "Rondas GPS en tiempo real",
    "Trust Score de guardias",
    "Portal de cliente 24/7",
    "Chat directo con equipo",
    "Documentación digital",
    "Cumplimiento normativo (Ley 21.659)",
    "Programa de capacitación",
    "Control anti-doble turno",
  ],
};
