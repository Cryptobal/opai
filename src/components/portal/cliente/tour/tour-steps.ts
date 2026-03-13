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
      title: name ? `Bienvenido, ${name}` : "Bienvenido a Gard Security",
      subtitle: "El único portal con tecnología propia en Chile",
      icon: "Shield",
      content:
        "Estás accediendo al único portal de seguridad con tecnología propia en Chile. Aquí podrás ver en tiempo real todo lo que ocurre con tu servicio.",
      accent: "from-teal-500/20 to-teal-600/5",
    },
    {
      title: "Tu propuesta personalizada",
      subtitle: "Revisa los detalles de tu servicio",
      icon: "FileCheck",
      content: company
        ? `Revisa tu propuesta de seguridad para ${company}. Incluye todos los servicios exclusivos que Gard ofrece gracias a la plataforma OPAI.`
        : "Revisa tu propuesta de seguridad. Incluye todos los servicios exclusivos que Gard ofrece gracias a la plataforma OPAI.",
      accent: "from-blue-500/20 to-blue-600/5",
    },
    {
      title: "Rondas GPS en tiempo real",
      subtitle: "Verificación automática de recorridos",
      icon: "MapPin",
      content:
        "Monitorea las rondas de tus guardias con verificación GPS y geofencing. Si una ronda no se completa, recibes una alerta automática.",
      accent: "from-emerald-500/20 to-emerald-600/5",
    },
    {
      title: "Trust Score de guardias",
      subtitle: "Transparencia total basada en datos",
      icon: "BarChart3",
      content:
        "Cada guardia tiene un puntaje basado en datos reales: asistencia, rondas completadas, capacitación. Transparencia total.",
      accent: "from-violet-500/20 to-violet-600/5",
    },
    {
      title: "Chat directo",
      subtitle: "Comunicación sin intermediarios",
      icon: "MessageSquare",
      content:
        "Comunícate directamente con tu equipo Gard sin salir del portal. Sin WhatsApps personales, sin correos perdidos.",
      accent: "from-sky-500/20 to-sky-600/5",
    },
    {
      title: "Todo tu servicio en un lugar",
      subtitle: "Esto es OPAI",
      icon: "Rocket",
      content: ejecutivo !== "su ejecutivo"
        ? `Documentación, reportes, encuestas, control de acceso — todo integrado en una sola plataforma. Esto es OPAI. Explore el portal y hable con ${ejecutivo}.`
        : "Documentación, reportes, encuestas, control de acceso — todo integrado en una sola plataforma. Esto es OPAI.",
      accent: "from-teal-500/20 to-teal-600/5",
    },
  ];
}

export const TOUR_STEPS_PROSPECT = buildTourSteps();
