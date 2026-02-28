/**
 * AI helpers for the Protocol & Exam system.
 *
 * Contains prompt templates and orchestration functions that call
 * the Anthropic client to generate protocol content and exam questions.
 */

import { anthropicJson, type AnthropicContentBlock } from "./anthropic";

// ────────────────────────────────────────────────────────────
//  TYPES
// ────────────────────────────────────────────────────────────

export interface AiProtocolSection {
  title: string;
  icon: string;
  items: Array<{ title: string; description: string }>;
}

export interface AiProtocolResult {
  sections: AiProtocolSection[];
}

export interface AiExamQuestion {
  questionText: string;
  questionType: "multiple_choice" | "true_false";
  options: string[];
  correctAnswer: string; // index for MC ("0","1","2","3"), "true"/"false" for T/F
  sectionReference: string;
}

export interface AiExamResult {
  questions: AiExamQuestion[];
}

export const INSTALLATION_TYPES = [
  { value: "condominio", label: "Condominio" },
  { value: "edificio_corporativo", label: "Edificio Corporativo" },
  { value: "mall_retail", label: "Mall / Retail" },
  { value: "bodega_industria", label: "Bodega / Industria" },
  { value: "obra_construccion", label: "Obra en Construcción" },
  { value: "educacional", label: "Educacional" },
] as const;

export type InstallationType = (typeof INSTALLATION_TYPES)[number]["value"];

// ────────────────────────────────────────────────────────────
//  SYSTEM PROMPT
// ────────────────────────────────────────────────────────────

const SYSTEM_PROMPT = `Eres un experto en seguridad privada en Chile. Trabajas para Gard Security, una empresa de seguridad que gestiona guardias en instalaciones.

Reglas:
- Responde SOLO con JSON válido, sin texto adicional ni markdown.
- Usa español de Chile.
- Sé práctico y específico, no genérico.
- Los protocolos deben ser accionables: cada ítem debe describir exactamente qué hacer, cuándo y cómo.`;

// ────────────────────────────────────────────────────────────
//  MODE B: Generate protocol from installation type
// ────────────────────────────────────────────────────────────

export async function generateProtocolFromType(
  installationType: string,
  additionalContext?: string,
): Promise<AiProtocolResult> {
  const contextLine = additionalContext
    ? `\nContexto adicional: ${additionalContext}`
    : "";

  const prompt = `Genera un protocolo de seguridad estructurado para una instalación tipo: ${installationType}.${contextLine}

El protocolo debe tener entre 5 y 8 secciones, cada una con 3 a 6 ítems.

Responde con este formato JSON exacto:
{
  "sections": [
    {
      "title": "Nombre de la sección",
      "icon": "🔒",
      "items": [
        {
          "title": "Título del ítem",
          "description": "Descripción detallada del procedimiento. Debe ser específica y accionable."
        }
      ]
    }
  ]
}

Secciones típicas incluyen: Control de Acceso, Rondas de Seguridad, Procedimientos de Emergencia, Apertura y Cierre, Registro de Visitas, Control Vehicular, Procedimientos Nocturnos, etc. Adapta según el tipo de instalación.`;

  return anthropicJson<AiProtocolResult>(
    [{ role: "user", content: prompt }],
    { system: SYSTEM_PROMPT, maxTokens: 4096 },
  );
}

// ────────────────────────────────────────────────────────────
//  MODE C: Extract protocol from PDF documents
// ────────────────────────────────────────────────────────────

export async function extractProtocolFromPdf(
  pdfBase64: string,
  fileName: string,
): Promise<AiProtocolResult> {
  const content: AnthropicContentBlock[] = [
    {
      type: "document",
      source: {
        type: "base64",
        media_type: "application/pdf",
        data: pdfBase64,
      },
    },
    {
      type: "text",
      text: `Analiza el documento "${fileName}" y extrae un protocolo de seguridad estructurado.

Identifica las secciones principales y los procedimientos/ítems dentro de cada sección.
Si el documento no es un protocolo de seguridad, extrae la información relevante que pueda ser útil para un guardia de seguridad.

Responde con este formato JSON exacto:
{
  "sections": [
    {
      "title": "Nombre de la sección",
      "icon": "🔒",
      "items": [
        {
          "title": "Título del ítem",
          "description": "Descripción detallada del procedimiento."
        }
      ]
    }
  ]
}`,
    },
  ];

  return anthropicJson<AiProtocolResult>(
    [{ role: "user", content }],
    { system: SYSTEM_PROMPT, maxTokens: 4096 },
  );
}

// ────────────────────────────────────────────────────────────
//  Generate a single item with AI
// ────────────────────────────────────────────────────────────

export async function generateProtocolItem(
  sectionTitle: string,
  userDescription: string,
  existingItems: Array<{ title: string; description: string }>,
): Promise<{ title: string; description: string }> {
  const existingContext =
    existingItems.length > 0
      ? `\nÍtems existentes en esta sección:\n${existingItems.map((i) => `- ${i.title}`).join("\n")}`
      : "";

  const prompt = `Dentro de la sección "${sectionTitle}" de un protocolo de seguridad, el administrador necesita un ítem para: "${userDescription}".${existingContext}

Genera un ítem con título conciso y descripción detallada y accionable.

Responde con este formato JSON exacto:
{
  "title": "Título del ítem",
  "description": "Descripción detallada del procedimiento."
}`;

  return anthropicJson<{ title: string; description: string }>(
    [{ role: "user", content: prompt }],
    { system: SYSTEM_PROMPT, maxTokens: 1024 },
  );
}

// ────────────────────────────────────────────────────────────
//  Generate a full section with AI
// ────────────────────────────────────────────────────────────

export async function generateProtocolSection(
  userDescription: string,
  existingSections: string[],
): Promise<AiProtocolSection> {
  const existingContext =
    existingSections.length > 0
      ? `\nSecciones existentes en el protocolo:\n${existingSections.map((s) => `- ${s}`).join("\n")}`
      : "";

  const prompt = `Para un protocolo de seguridad, el administrador necesita una nueva sección sobre: "${userDescription}".${existingContext}

Genera una sección completa con 3 a 6 ítems.

Responde con este formato JSON exacto:
{
  "title": "Nombre de la sección",
  "icon": "🔒",
  "items": [
    {
      "title": "Título del ítem",
      "description": "Descripción detallada del procedimiento."
    }
  ]
}`;

  return anthropicJson<AiProtocolSection>(
    [{ role: "user", content: prompt }],
    { system: SYSTEM_PROMPT, maxTokens: 2048 },
  );
}

// ────────────────────────────────────────────────────────────
//  Generate exam questions from protocol
// ────────────────────────────────────────────────────────────

export async function generateExamQuestions(
  installationName: string,
  protocolSections: AiProtocolSection[],
  questionCount: number = 10,
): Promise<AiExamResult> {
  const protocolJson = JSON.stringify(protocolSections, null, 2);

  const prompt = `Dado el siguiente protocolo de seguridad de la instalación "${installationName}":

${protocolJson}

Genera ${questionCount} preguntas de evaluación. Mezcla preguntas de selección múltiple (4 opciones, 1 correcta) y verdadero/falso.

Cada pregunta debe:
- Evaluar conocimiento práctico, no solo memorización
- Indicar de qué sección proviene
- Tener opciones plausibles (no obvias)
- Cubrir diferentes secciones del protocolo

Responde con este formato JSON exacto:
{
  "questions": [
    {
      "questionText": "¿Cuál es el procedimiento correcto para...?",
      "questionType": "multiple_choice",
      "options": ["Opción A", "Opción B", "Opción C", "Opción D"],
      "correctAnswer": "0",
      "sectionReference": "Control de Acceso"
    },
    {
      "questionText": "¿Es correcto que...?",
      "questionType": "true_false",
      "options": ["Verdadero", "Falso"],
      "correctAnswer": "true",
      "sectionReference": "Rondas de Seguridad"
    }
  ]
}

Para selección múltiple, correctAnswer es el índice (0-3) de la opción correcta.
Para verdadero/falso, correctAnswer es "true" o "false".`;

  return anthropicJson<AiExamResult>(
    [{ role: "user", content: prompt }],
    { system: SYSTEM_PROMPT, maxTokens: 4096, temperature: 0.7 },
  );
}

// ────────────────────────────────────────────────────────────
//  Generate security general exam questions
// ────────────────────────────────────────────────────────────

export async function generateSecurityGeneralQuestions(
  topic: string,
  questionCount: number = 10,
): Promise<AiExamResult> {
  const prompt = `Genera ${questionCount} preguntas de evaluación sobre seguridad general, específicamente sobre: "${topic}".

Temas comunes: primeros auxilios, prevención de riesgos, manejo de conflictos, uso de extintores, procedimientos legales en Chile, protocolos de emergencia, etc.

Mezcla preguntas de selección múltiple (4 opciones, 1 correcta) y verdadero/falso.

Responde con este formato JSON exacto:
{
  "questions": [
    {
      "questionText": "¿Cuál es el procedimiento correcto para...?",
      "questionType": "multiple_choice",
      "options": ["Opción A", "Opción B", "Opción C", "Opción D"],
      "correctAnswer": "0",
      "sectionReference": "Seguridad General - ${topic}"
    }
  ]
}

Para selección múltiple, correctAnswer es el índice (0-3) de la opción correcta.
Para verdadero/falso, correctAnswer es "true" o "false".`;

  return anthropicJson<AiExamResult>(
    [{ role: "user", content: prompt }],
    { system: SYSTEM_PROMPT, maxTokens: 4096, temperature: 0.7 },
  );
}
