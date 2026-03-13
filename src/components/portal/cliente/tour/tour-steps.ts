export interface TourStep {
  title: string;
  subtitle: string;
  icon: string;
  content: string;
  accent: string; // tailwind gradient from color
}

export const TOUR_STEPS_PROSPECT: TourStep[] = [
  {
    title: "Bienvenido a su portal de seguridad",
    subtitle: "Visibilidad total, control real",
    icon: "Shield",
    content:
      "Este portal le da acceso directo a toda la operación de seguridad de su instalación. Sin intermediarios, sin esperas — información en tiempo real, las 24 horas.",
    accent: "from-teal-500/20 to-teal-600/5",
  },
  {
    title: "Propuestas claras y transparentes",
    subtitle: "Decida con información completa",
    icon: "FileCheck",
    content:
      "Revise cada propuesta en detalle: puestos, horarios, costos desglosados. Compare versiones, descargue el PDF o visualice la propuesta técnica completa. Acepte directamente desde aquí.",
    accent: "from-blue-500/20 to-blue-600/5",
  },
  {
    title: "Dashboard con métricas reales",
    subtitle: "Sepa exactamente cómo va su servicio",
    icon: "BarChart3",
    content:
      "Cumplimiento de rondas, puntualidad de guardias, incidentes resueltos, trust score. Todo medido, todo documentado. Usted define los estándares, nosotros los cumplimos.",
    accent: "from-violet-500/20 to-violet-600/5",
  },
  {
    title: "Rondas verificadas por GPS",
    subtitle: "Cada recorrido queda registrado",
    icon: "MapPin",
    content:
      "Vea en mapa los recorridos de cada guardia con checkpoints verificados por geolocalización. Sepa exactamente cuándo y dónde se hizo cada ronda.",
    accent: "from-emerald-500/20 to-emerald-600/5",
  },
  {
    title: "Comunicación directa",
    subtitle: "Chat, tickets y alertas en un solo lugar",
    icon: "MessageSquare",
    content:
      "Canal directo con su ejecutivo, supervisores y equipo operativo. Sistema de tickets con SLA garantizado. Notificaciones en tiempo real de todo lo que importa.",
    accent: "from-sky-500/20 to-sky-600/5",
  },
  {
    title: "Documentación y reportes",
    subtitle: "Todo organizado y descargable",
    icon: "FileBarChart",
    content:
      "Contratos, protocolos, reportes mensuales automáticos con métricas de desempeño. Evaluación de guardias, historial de incidentes. Todo en PDF descargable.",
    accent: "from-amber-500/20 to-amber-600/5",
  },
  {
    title: "Comience a operar con visibilidad total",
    subtitle: "Su seguridad, bajo su control",
    icon: "Rocket",
    content:
      "Lo que ve ahora son datos de demostración. Al contratar, se reemplazan por datos reales actualizados en tiempo real. Explore el portal, revise su propuesta y hable con su ejecutivo.",
    accent: "from-teal-500/20 to-teal-600/5",
  },
];
