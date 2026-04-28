/**
 * Prompts compartidos para la generación de protocolos de seguridad.
 *
 * Centralizamos aquí el marco normativo, glosario de roles y reglas de
 * estilo para que `generate`, `generate-section` y `generate-item`
 * produzcan resultados consistentes.
 */

export const NORMATIVA_BASE = `
Marco normativo aplicable (Chile):
- Ley 21.659 (Ley de Seguridad Privada, vigente 2024) y su reglamento
- D.S. 867/2022 (reglamento del antiguo D.L. 3.607, base de OS-10)
- Instructivos OS-10 de Carabineros de Chile
- Ley 16.744 (accidentes del trabajo aplicada al guardia)
- Ley 21.719 (protección de datos personales — manejo de visitas, cámaras, biométricos)
- Código del Trabajo, jornadas y descansos del personal de vigilancia
- Si la instalación es retail: instructivo del Ministerio del Interior sobre comercio
- Si es educacional: Ley 21.128 (Aula Segura) y reglamentación MINEDUC
- Si es industrial / bodegas: D.S. 594/1999 condiciones sanitarias y ambientales
`.trim();

export const ROLES_BASE = `
Roles que deben aparecer cuando corresponda (no inventar otros):
- Guardia de seguridad
- Supervisor / rondín
- Central de monitoreo / Sala de control
- Encargado de turno
- Administrador de la instalación / contraparte cliente
- Carabineros de Chile (133)
- Bomberos (132)
- SAMU (131) o Mutual de Seguridad / ACHS según el caso
- OS-10 cuando aplique (incidentes con armas, hurtos relevantes)
`.trim();

export const ESTILO_BASE = `
Estilo de redacción OBLIGATORIO:
- Verbos en infinitivo o imperativo: "verificar", "registrar", "comunicar", "consignar"
- Frases cortas, una acción por línea
- Cero adjetivos de relleno ("muy importante", "fundamental", "vital")
- Cero condicionales abiertos sin acción ("podría ser conveniente...")
- Toda referencia a tiempos máximos debe ser numérica ("dentro de 5 minutos", no "rápidamente")
- Si un dato es desconocido, marcarlo entre llaves: {nombre del cliente}, {teléfono central}
`.trim();

export type GenerateProtocolPromptArgs = {
  installationTypeLabel: string;
  installationName: string | null;
  installationAddress: string | null;
  installationDescription: string | null;
  accountName: string | null;
  accountIndustria: string | null;
  freeContext: string | null;
  hasGroundingDocuments: boolean;
};

export function buildGenerateProtocolPrompt(
  args: GenerateProtocolPromptArgs,
): string {
  return `Eres un experto senior en seguridad privada en Chile, redactor de procedimientos operativos para empresas de guardias.

CONTEXTO DE LA INSTALACIÓN:
- Tipo: ${args.installationTypeLabel}
- Nombre: ${args.installationName ?? "{no informado}"}
- Dirección: ${args.installationAddress ?? "{no informada}"}
- Descripción interna: ${args.installationDescription ?? "{sin descripción}"}
- Cliente: ${args.accountName ?? "{no informado}"} (${args.accountIndustria ?? "industria no informada"})
${args.freeContext ? `- Notas adicionales del operador: ${args.freeContext}` : ""}

${NORMATIVA_BASE}

${ROLES_BASE}

${ESTILO_BASE}

${
  args.hasGroundingDocuments
    ? "FUENTES DOCUMENTALES: Se adjuntan documentos PDF (matrices de riesgo, planes, manuales). Tu protocolo DEBE basarse estrictamente en ellos cuando contengan la información. Si una sección no está cubierta por los documentos, complétala con el estado del arte chileno y márcala con la nota \"[generado sin fuente]\" en su descripción."
    : "FUENTES DOCUMENTALES: No se adjuntan documentos. Genera un protocolo base usando el estado del arte chileno y marca todas las descripciones con \"[generado sin fuente]\" para que el operador sepa que debe revisar."
}

TAREA:
Genera el protocolo de seguridad completo. Responde ÚNICAMENTE con JSON válido (sin markdown, sin backticks, sin texto adicional) en este formato:

{
  "sections": [
    {
      "title": "...",
      "icon": "emoji",
      "items": [
        {
          "title": "Verbo+objeto, máximo 8 palabras",
          "description": "Descripción del procedimiento. Si lo amerita, dentro del texto incluir bloques delimitados por --- como:\\n---PASOS---\\n1. ...\\n2. ...\\n---CONTACTOS---\\n- Carabineros: 133\\n- {teléfono central monitoreo}\\n---TIEMPO MAX---\\n5 minutos\\n---EVIDENCIA---\\nRegistrar en bitácora con hora, nombre y rut.",
          "criticality": 1,
          "legalRequirement": false
        }
      ]
    }
  ]
}

REGLAS DE CONTENIDO:
- Mínimo 7 secciones cuando sea pertinente al tipo: Control de Acceso, Rondas de Seguridad, Emergencias, Apertura y Cierre, Registro de Visitas, Equipamiento del Guardia, Comunicaciones y Reporte, Acciones Prohibidas, Normas Específicas del lugar.
- Mínimo 4 ítems por sección.
- "criticality": 1=informativo, 2=importante, 3=crítico (incidente/emergencia/contacto autoridades).
- "legalRequirement": true SOLO si el ítem cumple una norma específica (cita la norma dentro de description).
- Si la instalación es ${args.installationTypeLabel.toLowerCase()}, usar terminología, ritmos y riesgos típicos de ese tipo (no genéricos).`.trim();
}

export type GenerateSectionPromptArgs = {
  description: string;
};

export function buildGenerateSectionPrompt(
  args: GenerateSectionPromptArgs,
): string {
  return `Para un protocolo de seguridad de una empresa de guardias en Chile, genera una sección completa sobre: "${args.description}".

${NORMATIVA_BASE}

${ROLES_BASE}

${ESTILO_BASE}

Responde ÚNICAMENTE con el siguiente JSON válido (sin markdown, sin backticks, sin texto adicional):
{"title":"...","icon":"emoji","items":[{"title":"Verbo+objeto, máximo 8 palabras","description":"...","criticality":1,"legalRequirement":false}]}

REGLAS:
- Al menos 4 ítems detallados, prácticos y accionables.
- "criticality": 1=informativo, 2=importante, 3=crítico.
- "legalRequirement": true SOLO si el ítem cumple una norma específica (cita la norma dentro de description).`.trim();
}

export type GenerateItemPromptArgs = {
  sectionTitle: string;
  description: string;
};

export function buildGenerateItemPrompt(args: GenerateItemPromptArgs): string {
  return `Dentro de la sección "${args.sectionTitle}" de un protocolo de seguridad para una empresa de guardias en Chile, genera un procedimiento detallado sobre: "${args.description}".

${NORMATIVA_BASE}

${ROLES_BASE}

${ESTILO_BASE}

Responde ÚNICAMENTE con el siguiente JSON válido (sin markdown, sin backticks, sin texto adicional):
{"title":"Verbo+objeto, máximo 8 palabras","description":"...","criticality":1,"legalRequirement":false}

REGLAS:
- Título conciso, máximo 8 palabras, en infinitivo o imperativo.
- "criticality": 1=informativo, 2=importante, 3=crítico.
- "legalRequirement": true SOLO si el ítem cumple una norma específica (cita la norma dentro de description).`.trim();
}
