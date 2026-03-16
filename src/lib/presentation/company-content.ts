/**
 * Default company presentation content for Gard Security.
 * This is the skeleton — Carlos should fill in real copy and stats.
 */

export interface CompanyStat {
  label: string;
  value: string;
}

export interface CompanyService {
  icon: string;
  name: string;
  description: string;
}

export interface CompanyDifferentiator {
  title: string;
  description: string;
}

export interface CompanyRegulation {
  name: string;
  description: string;
}

export interface CompanyContent {
  companyIntro: {
    title: string;
    subtitle: string;
    description: string;
    stats: CompanyStat[];
  };
  services: CompanyService[];
  certifications: string[];
  differentiators: CompanyDifferentiator[];
  technology: {
    title: string;
    description: string;
    features: string[];
  };
  regulations: {
    title: string;
    items: CompanyRegulation[];
  };
}

export const defaultCompanyContent: CompanyContent = {
  companyIntro: {
    title: "Gard Security",
    subtitle: "Seguridad Privada Integral",
    description:
      "Empresa de seguridad privada con base en Santiago, Chile. Ofrecemos soluciones integrales de seguridad para empresas, combinando personal altamente capacitado con tecnología de vanguardia.",
    stats: [
      { label: "Años de experiencia", value: "15+" },
      { label: "Clientes activos", value: "50+" },
      { label: "Guardias certificados", value: "500+" },
      { label: "Tasa de retención", value: "95%" },
    ],
  },
  services: [
    {
      icon: "Shield",
      name: "Guardias de Seguridad",
      description:
        "Personal certificado OS-10, capacitado en protocolos de seguridad, control de accesos y respuesta ante emergencias.",
    },
    {
      icon: "Radio",
      name: "Vigilancia con Drones",
      description:
        "Patrullaje aéreo con drones equipados con cámaras HD y visión nocturna para cobertura ampliada.",
    },
    {
      icon: "Camera",
      name: "Seguridad Electrónica",
      description:
        "CCTV, alarmas, control de acceso biométrico y sistemas integrados de vigilancia perimetral.",
    },
    {
      icon: "Monitor",
      name: "Monitoreo 24/7",
      description:
        "Central de monitoreo con operadores certificados, respuesta inmediata y coordinación con fuerzas de orden.",
    },
  ],
  certifications: [
    "Autorización OS-10 Carabineros de Chile",
    "D.S. 44 Ministerio de Defensa",
    "Cumplimiento Ley 21.659",
    "Certificación en Primeros Auxilios",
    "Capacitación en uso de extintores y evacuación",
  ],
  differentiators: [
    {
      title: "Tecnología Propia",
      description:
        "Sistema OPAI: ERP completo para gestión operacional que incluye control de asistencia, rondas GPS, gamificación de guardias y reportería automatizada.",
    },
    {
      title: "Portal del Cliente",
      description:
        "Acceso en tiempo real a operaciones, rondas, incidentes, documentación del personal y comunicación directa con su ejecutivo.",
    },
    {
      title: "Gamificación de Guardias",
      description:
        "Sistema Trust Score que incentiva el rendimiento operacional, puntualidad y cumplimiento de protocolos de seguridad.",
    },
  ],
  technology: {
    title: "Powered by OPAI",
    description:
      "Plataforma tecnológica desarrollada internamente que potencia cada aspecto de nuestro servicio de seguridad.",
    features: [
      "Rondas con geofencing en tiempo real",
      "Control de asistencia biométrico",
      "Portal de cliente interactivo",
      "Reportería automatizada",
      "Comunicación directa por chat",
      "Gestión de incidentes y tickets",
    ],
  },
  regulations: {
    title: "Cumplimiento Normativo",
    items: [
      {
        name: "Ley 21.659",
        description: "Nuevo marco regulatorio de seguridad privada",
      },
      {
        name: "OS-10",
        description: "Autorización de Carabineros de Chile",
      },
      {
        name: "D.S. 44",
        description: "Reglamento del Ministerio de Defensa",
      },
    ],
  },
};
