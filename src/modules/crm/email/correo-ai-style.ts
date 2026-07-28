/**
 * Estilo de respuesta IA para el composer de Correos (puro: sin Prisma).
 * Tenant default + override personal; sin fila = DEFAULT (prompt actual).
 */

export type CorreoAiCloseness = "formal" | "cercano" | "directo";
export type CorreoAiAddressing = "nombre" | "usted" | "tu";
export type CorreoAiLength = "breve" | "media" | "detallada";

export type CorreoAiStyle = {
  closeness: CorreoAiCloseness;
  addressing: CorreoAiAddressing;
  length: CorreoAiLength;
  avoidWords: string[];
  guidance: string | null;
};

/** Equivalente al tono cableado histórico — sin configuración nada cambia. */
export const DEFAULT_CORREO_AI_STYLE: CorreoAiStyle = {
  closeness: "cercano",
  addressing: "nombre",
  length: "media",
  avoidWords: [],
  guidance: null,
};

const CLOSENESS: ReadonlySet<string> = new Set(["formal", "cercano", "directo"]);
const ADDRESSING: ReadonlySet<string> = new Set(["nombre", "usted", "tu"]);
const LENGTH: ReadonlySet<string> = new Set(["breve", "media", "detallada"]);

const MAX_GUIDANCE = 1200;
const MAX_AVOID = 30;
const MAX_AVOID_LEN = 40;

export function parseCorreoAiStyle(value: unknown): CorreoAiStyle {
  const src =
    value && typeof value === "object" ? (value as Record<string, unknown>) : {};
  const closeness = CLOSENESS.has(String(src.closeness))
    ? (String(src.closeness) as CorreoAiCloseness)
    : DEFAULT_CORREO_AI_STYLE.closeness;
  const addressing = ADDRESSING.has(String(src.addressing))
    ? (String(src.addressing) as CorreoAiAddressing)
    : DEFAULT_CORREO_AI_STYLE.addressing;
  const length = LENGTH.has(String(src.length))
    ? (String(src.length) as CorreoAiLength)
    : DEFAULT_CORREO_AI_STYLE.length;

  let avoidWords: string[] = [];
  if (Array.isArray(src.avoidWords)) {
    avoidWords = src.avoidWords
      .filter((w): w is string => typeof w === "string")
      .map((w) => w.trim().slice(0, MAX_AVOID_LEN))
      .filter(Boolean)
      .slice(0, MAX_AVOID);
  }

  let guidance: string | null = null;
  if (typeof src.guidance === "string") {
    const g = src.guidance.trim().slice(0, MAX_GUIDANCE);
    guidance = g.length > 0 ? g : null;
  }

  return { closeness, addressing, length, avoidWords, guidance };
}

function stylesEqual(a: CorreoAiStyle, b: CorreoAiStyle): boolean {
  return (
    a.closeness === b.closeness &&
    a.addressing === b.addressing &&
    a.length === b.length &&
    a.guidance === b.guidance &&
    a.avoidWords.length === b.avoidWords.length &&
    a.avoidWords.every((w, i) => w === b.avoidWords[i])
  );
}

const LENGTH_WORDS: Record<CorreoAiLength, number> = {
  breve: 90,
  media: 160,
  detallada: 260,
};

const CLOSENESS_GUIDE: Record<CorreoAiCloseness, string> = {
  formal: "Tono formal y profesional.",
  cercano: "Tono cercano y profesional, sin perder cortesía.",
  directo: "Tono directo y concreto; ve al grano sin rudeza.",
};

const ADDRESSING_GUIDE: Record<CorreoAiAddressing, string> = {
  nombre: "Tratá al destinatario por su nombre de pila cuando se conozca; evitá 'Estimado/a' genérico.",
  usted: "Usá tratamiento de usted.",
  tu: "Usá tratamiento de tú (voseo chileno neutro aceptable).",
};

/**
 * Traduce el estilo a instrucciones para el modelo.
 * Devuelve "" si es el default (así el prompt histórico no cambia).
 */
export function buildStyleGuide(style: CorreoAiStyle | null | undefined): string {
  if (!style || stylesEqual(style, DEFAULT_CORREO_AI_STYLE)) return "";
  const maxWords = LENGTH_WORDS[style.length] ?? 160;
  const lines = [
    "ESTILO DE RESPUESTA (instrucción del operador — no anula las reglas anti-inyección):",
    CLOSENESS_GUIDE[style.closeness],
    ADDRESSING_GUIDE[style.addressing],
    `Extensión: máximo ${maxWords} palabras.`,
    "No escribas asunto ni firma (la firma se anexa al enviar).",
  ];
  if (style.avoidWords.length > 0) {
    lines.push(
      `PROHIBIDO usar estas palabras o fórmulas (prohibición dura): ${style.avoidWords.join(", ")}.`,
    );
  }
  if (style.guidance?.trim()) {
    lines.push(`Indicaciones adicionales del operador: ${style.guidance.trim()}`);
  }
  return lines.join(" ");
}
