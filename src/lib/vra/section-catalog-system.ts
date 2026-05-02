/**
 * Catálogo system de plantillas de secciones VRA.
 * Estas son las 12 secciones base que se siembran al crear un tenant
 * o cuando entra por primera vez al módulo de configuración VRA.
 *
 * NUNCA se modifican vía API tenant. Solo platform admin (vía script)
 * puede ajustar este catálogo y luego propagar a tenants si lo desea.
 */

export type VraSystemSectionDef = {
  key: string;
  title: string;
  description: string;
  aiPromptHint?: string;
  outputType:
    | "narrative"
    | "metadata_card"
    | "risk_distribution"
    | "vuln_cards"
    | "risk_matrix"
    | "heat_map"
    | "recommendations"
    | "roadmap"
    | "photo_gallery"
    | "norms_table"
    | "glossary"
    | "bulleted_list"
    | "comparison_table"
    | "site_description";
  dataInputs: string[];
  sortOrder: number;
  isMandatory?: boolean;
  iconName?: string;
};

export const VRA_SYSTEM_CATALOG: VraSystemSectionDef[] = [
  {
    key: "executive_summary",
    title: "Resumen Ejecutivo",
    description:
      "Síntesis de 2 a 3 párrafos sobre el contexto de la instalación, la evaluación realizada y los hallazgos críticos. Cierra con la conclusión ejecutiva sobre el nivel de riesgo agregado y los factores que lo sostienen. Incluye una distribución cuantitativa de hallazgos por severidad (críticos, altos, medios, bajos) y una lista de los hallazgos más relevantes formateados como bullets jerárquicos.",
    aiPromptHint:
      "Estilo profesional, directo, libre de jerga innecesaria. Máximo 250 palabras de prosa más bullets de hallazgos críticos. La conclusión ejecutiva debe responder: ¿el riesgo es teórico o concreto? ¿hay evidencia material de actividad delictual? ¿qué pasa si no hay acción correctiva?",
    outputType: "risk_distribution",
    dataInputs: ["installation", "findings", "photos"],
    sortOrder: 10,
    isMandatory: true,
    iconName: "FileText",
  },
  {
    key: "objective_scope_methodology",
    title: "Objetivo, Alcance y Metodología",
    description:
      "Tres subsecciones: (1) Objetivo del informe — qué se evalúa y para qué; (2) Alcance — qué cubre y qué queda fuera; (3) Metodología — frameworks aplicados (ISO 31000, ASIS POA, CPTED, DS Nº 1.814 / OS-10). Explica cómo se construye la calificación de riesgo (Probabilidad × Impacto) y los cuatro niveles resultantes (Crítico, Alto, Medio, Bajo).",
    aiPromptHint:
      "El bloque de metodología es estandar — la IA debe respetar los frameworks listados y enumerarlos como bullets. El objetivo y alcance se adaptan a la instalación específica.",
    outputType: "narrative",
    dataInputs: ["installation"],
    sortOrder: 20,
    isMandatory: true,
    iconName: "Target",
  },
  {
    key: "site_description",
    title: "Descripción del Sitio y Entorno",
    description:
      "Caracterización del sitio en dos partes: (1) Ubicación geográfica con vista satelital y tabla de límites cardinales (Norte, Sur, Este, Oeste) describiendo qué hay en cada uno; (2) Análisis del entorno mediante criminología ambiental (CPTED) — vigilancia natural, control territorial, mantenimiento, accesibilidad. Identifica facilitadores delictuales del entorno inmediato.",
    aiPromptHint:
      "Si el dataset incluye coordenadas GPS y dirección, mencionarlas. La tabla cardinal debe estar siempre, aunque algún lado se desconozca (poner 'Sin información de inspección' en ese caso).",
    outputType: "site_description",
    dataInputs: ["installation", "findings", "photos"],
    sortOrder: 30,
    iconName: "MapPin",
  },
  {
    key: "current_security_posture",
    title: "Postura de Seguridad Actual",
    description:
      "Evaluación de los recursos de seguridad existentes: (1) Recursos humanos — dotación por turno, día de la semana, cobertura horaria; (2) Infraestructura y tecnología — CCTV, cerco eléctrico, iluminación, casetas, patrullaje vehicular; (3) Brechas identificadas — por qué la postura actual es insuficiente para el perfil de riesgo del sitio.",
    aiPromptHint:
      "Inferir la dotación desde los datos de la instalación (puestos operativos, turnos). Si no hay datos, indicar 'Información no disponible' y describir solo los elementos observados en visita.",
    outputType: "comparison_table",
    dataInputs: ["installation", "findings"],
    sortOrder: 40,
    iconName: "Shield",
  },
  {
    key: "threat_analysis",
    title: "Análisis de Amenazas",
    description:
      "Tres subsecciones: (1) Caracterización de actores — oportunistas, planificados, vectores indirectos del entorno; (2) Modus operandi observado — patrones específicos detectados en terreno (vigilancia desde altura, perforación de muros, uso del entorno); (3) Activos expuestos — patrimoniales, operacionales, humanos y reputacionales. Cada amenaza debe estar respaldada por evidencia material o testimonial.",
    aiPromptHint:
      "Diferenciar amenazas hipotéticas (no reportadas) de amenazas con evidencia concreta. Si los hallazgos contienen palabras como 'cojín', 'colilla', 'perforación', 'foradura', 'placa metálica', son evidencia de actividad delictual previa real, no hipótesis.",
    outputType: "narrative",
    dataInputs: ["installation", "findings", "photos"],
    sortOrder: 50,
    iconName: "AlertTriangle",
  },
  {
    key: "vulnerabilities",
    title: "Análisis de Vulnerabilidades por Sector",
    description:
      "Lista numerada V-01, V-02, V-03... de vulnerabilidades específicas, organizadas por sector geográfico o sistema de seguridad. Cada vulnerabilidad incluye: descripción, factores agravantes, sistemas afectados, calificación de probabilidad e impacto. Debe haber al menos una vulnerabilidad por hallazgo crítico/alto del set capturado, agrupando hallazgos similares cuando corresponda.",
    aiPromptHint:
      "El número de vulnerabilidades debe corresponder a la realidad observada (típicamente entre 5 y 12). NO inventar vulnerabilidades genéricas. Cada una debe vincularse a evidencia.",
    outputType: "vuln_cards",
    dataInputs: ["installation", "findings", "photos"],
    sortOrder: 60,
    isMandatory: true,
    iconName: "ShieldAlert",
  },
  {
    key: "risk_matrix",
    title: "Matriz de Riesgo Consolidada",
    description:
      "Dos componentes: (1) Tabla consolidada con todas las vulnerabilidades V-01..V-NN, con columnas ID, descripción, sector/sistema, probabilidad, impacto, riesgo final; (2) Mapa de calor 4×4 (Probabilidad: Casi Cierto/Probable/Posible/Improbable × Impacto: Insignificante/Menor/Moderado/Mayor) con cada vulnerabilidad ubicada en su celda según calificación. El cuadrante crítico (alta probabilidad / alto impacto) debe destacarse.",
    aiPromptHint:
      "La matriz consume directamente la sección de vulnerabilidades. NO recalifica — solo consolida. Si el output_json de la sección anterior viene con las calificaciones, usarlas tal cual.",
    outputType: "risk_matrix",
    dataInputs: ["previous_section:vulnerabilities"],
    sortOrder: 70,
    iconName: "Grid3x3",
  },
  {
    key: "recommendations",
    title: "Recomendaciones Priorizadas",
    description:
      "Lista numerada R-01, R-02, R-03... de recomendaciones accionables priorizadas por impacto en reducción de riesgo y plazo de implementación. Cada recomendación incluye: prioridad (Inmediata 0-30 días / Alta 30-90 días / Media 90-180 días / Baja >180 días), acción concreta, justificación, indicador de éxito (KPI medible), plazo estimado y nivel de inversión cualitativo.",
    aiPromptHint:
      "Cada recomendación debe ser accionable, no genérica ('mejorar la seguridad' es inaceptable). El KPI debe ser cuantificable (ej: 'cero perforaciones nuevas en 90 días', '100% accesos facilitadores eliminados en 15 días').",
    outputType: "recommendations",
    dataInputs: ["previous_section:vulnerabilities", "previous_section:risk_matrix"],
    sortOrder: 80,
    isMandatory: true,
    iconName: "ListChecks",
  },
  {
    key: "implementation_roadmap",
    title: "Hoja de Ruta de Implementación",
    description:
      "Plan en 4 fases secuenciales: Fase 1 (0-30 días) — reducción de riesgo crítico inmediato; Fase 2 (30-90 días) — robustecimiento y detección preventiva; Fase 3 (90-180 días) — consolidación de perímetro y entorno; Fase 4 (>180 días) — mejora continua y vigilancia inteligente. Cada fase agrupa las recomendaciones aplicables y describe el outcome esperado.",
    aiPromptHint:
      "El roadmap consume las recomendaciones. Asignar cada R-NN a su fase correspondiente según prioridad. La Fase 4 puede incluir items que no estén en las recomendaciones formales (ej: reevaluación a 12 meses, incorporación de analítica de video, control biométrico).",
    outputType: "roadmap",
    dataInputs: ["previous_section:recommendations"],
    sortOrder: 90,
    iconName: "Calendar",
  },
  {
    key: "conclusions",
    title: "Conclusiones y Próximos Pasos",
    description:
      "Cierre del informe en tres bloques: (1) Conclusión integral del análisis sintetizando el nivel de riesgo, los sectores críticos y la naturaleza concreta vs potencial del riesgo; (2) Impacto esperado de la implementación coordinada — bullets de cómo cambia el panorama de riesgo si se ejecutan las fases 1 y 2; (3) Próximos pasos sugeridos a corto plazo (reunión de socialización, aprobación del plan, comité de seguimiento). Incluye proyección de reducción de riesgo agregado.",
    aiPromptHint:
      "El cierre debe proyectar de Riesgo ALTO o CRÍTICO actual a Riesgo MEDIO o MEDIO-BAJO post-implementación de Fases 1 y 2. La proyección debe ser realista, no aspiracional.",
    outputType: "narrative",
    dataInputs: [
      "installation",
      "previous_section:risk_matrix",
      "previous_section:recommendations",
      "previous_section:implementation_roadmap",
    ],
    sortOrder: 100,
    isMandatory: true,
    iconName: "Flag",
  },
  {
    key: "annex_photo_evidence",
    title: "Evidencia Fotográfica",
    description:
      "Anexo con todas las fotos capturadas durante la visita, organizadas en grilla con: código de referencia (FOTO E-01, E-02...), nivel de riesgo asociado (badge crítico/alto/medio/bajo), título descriptivo y observación técnica de 2-3 líneas que vincula la imagen a la vulnerabilidad correspondiente (V-NN). Las fotos se ordenan por severidad descendente.",
    aiPromptHint:
      "Cada foto debe estar caption-eada técnicamente, vinculada a la vulnerabilidad que evidencia. Si la IA no puede vincular una foto a una vulnerabilidad específica, se incluye igual con caption descriptivo neutro.",
    outputType: "photo_gallery",
    dataInputs: ["photos", "previous_section:vulnerabilities"],
    sortOrder: 200,
    iconName: "Camera",
  },
  {
    key: "annex_normative_glossary",
    title: "Marco Normativo y Glosario Técnico",
    description:
      "Tres tablas: (1) Marco normativo chileno aplicable (DS Nº 1.814, OS-10 de Carabineros, Ley Nº 19.303 y otras según contexto); (2) Estándares internacionales de referencia (ISO 31000, ISO 22301, ASIS POA, CPTED); (3) Glosario de términos técnicos usados en el informe (Amenaza, Vulnerabilidad, Riesgo, Modus operandi, Vector de ingreso, Disuasión activa, Detección temprana, Ventana operativa, etc.).",
    aiPromptHint:
      "Las normativas chilenas son estándar para informes de seguridad privada. Los estándares internacionales pueden ampliarse según el sector del cliente. El glosario debe contener al menos 8 términos.",
    outputType: "norms_table",
    dataInputs: [],
    sortOrder: 210,
    iconName: "BookOpen",
  },
];
