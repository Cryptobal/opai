export interface TourStep {
  title: string;
  subtitle: string;
  icon: string;
  content: string;
  accent: string;
}

interface PersonalizationData {
  contactName?: string;
  accountName?: string;
  ejecutivoName?: string | null;
}

export function buildTourSteps(data?: PersonalizationData): TourStep[] {
  const name = data?.contactName || "";
  const company = data?.accountName || "";
  const ejecutivo = data?.ejecutivoName || "su ejecutivo";

  return [
    {
      title: name ? `Bienvenido, ${name}` : "Bienvenido a su portal de seguridad",
      subtitle: company ? `Portal exclusivo para ${company}` : "Visibilidad total, control real",
      icon: "Shield",
      content:
        "Este portal le da acceso directo a toda la operación de seguridad de su instalación. Sin intermediarios, sin esperas — información en tiempo real, las 24 horas.",
      accent: "from-teal-500/20 to-teal-600/5",
    },
    {
      title: "Propuestas claras y transparentes",
      subtitle: "Decida con información completa",
      icon: "FileCheck",
      content: company
        ? `Revise la propuesta preparada para ${company}: puestos, horarios, costos desglosados. Descargue el PDF, visualice la propuesta técnica completa o acepte directamente desde aquí.`
        : "Revise cada propuesta en detalle: puestos, horarios, costos desglosados. Compare versiones, descargue el PDF o visualice la propuesta técnica completa. Acepte directamente desde aquí.",
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
      title: "Monitoreo de rondas en vivo",
      subtitle: "Cada recorrido, verificado en tiempo real",
      icon: "MapPin",
      content:
        "Siga en vivo las rondas de cada guardia en el mapa. Checkpoints verificados por GPS, notificaciones instantáneas y evidencia fotográfica de cada punto recorrido. Usted ve lo que pasa, cuando pasa.",
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
      content: ejecutivo !== "su ejecutivo"
        ? `Lo que ve ahora son datos de demostración. Al contratar, se reemplazan por datos reales. Explore el portal, revise su propuesta y hable con ${ejecutivo}.`
        : "Lo que ve ahora son datos de demostración. Al contratar, se reemplazan por datos reales actualizados en tiempo real. Explore el portal, revise su propuesta y hable con su ejecutivo.",
      accent: "from-teal-500/20 to-teal-600/5",
    },
  ];
}

export const TOUR_STEPS_PROSPECT = buildTourSteps();
