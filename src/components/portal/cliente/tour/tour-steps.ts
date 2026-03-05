export interface TourStep {
  title: string;
  icon: string;
  content: string;
}

export const TOUR_STEPS_PROSPECT: TourStep[] = [
  {
    title: "Bienvenido a tu portal",
    icon: "Layout",
    content: "Este es tu centro de control personalizado. Desde aqui podras monitorear en tiempo real, gestionar cotizaciones y comunicarte con tu equipo Gard.",
  },
  {
    title: "Tus cotizaciones",
    icon: "FileCheck",
    content: "Revisa tus propuestas activas. Puedes comparar, consultar y aceptar sin intermediarios, todo desde aqui.",
  },
  {
    title: "Dashboard operacional",
    icon: "BarChart3",
    content: "KPIs en tiempo real: cumplimiento, rondas, trust score, alertas. Cuando estes activo, estos seran datos reales de tu instalacion.",
  },
  {
    title: "Gamificacion de guardias",
    icon: "Trophy",
    content: "Scorecard individual por guardia: puntualidad, rondas, presentacion, desempeno. Ranking mensual con premios para los mejores.",
  },
  {
    title: "Bitacora digital",
    icon: "BookOpen",
    content: "Registro digital de novedades: cambios de turno, incidentes, hallazgos. Con hora exacta y responsable identificado.",
  },
  {
    title: "Chat directo",
    icon: "MessageSquare",
    content: "Comunicacion directa con tu ejecutivo, guardias en instalacion y equipo Gard: operaciones, RRHH, finanzas, administracion.",
  },
  {
    title: "Sistema de tickets",
    icon: "Ticket",
    content: "Solicitudes con SLA garantizado. Cambios de guardia, reportes especiales, consultas. Trazabilidad completa.",
  },
  {
    title: "Reportes mensuales",
    icon: "FileBarChart",
    content: "Informes automaticos con metricas, evaluacion de guardias, y recomendaciones. Descargables en PDF.",
  },
  {
    title: "Datos de muestra",
    icon: "Info",
    content: "Lo que ves ahora son datos de demostracion. Cuando contrates, se reemplazaran por datos reales actualizados en tiempo real.",
  },
  {
    title: "Comienza ahora",
    icon: "Rocket",
    content: "Explora el portal, revisa tus cotizaciones y contacta a tu ejecutivo. Este sera tu herramienta diaria para gestionar la seguridad de tu operacion.",
  },
];
