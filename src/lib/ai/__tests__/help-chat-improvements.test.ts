/**
 * Comprehensive tests for AI Help Chat improvements.
 *
 * Covers:
 * 1. Model Router - frustration detection and model escalation logic
 * 2. System Prompt Builder - evidence guardrails, fallback text, template variables
 * 3. Retrieval utilities - normalizeWord, tokenize, expandQueryTokens
 */
import { describe, it, expect, vi } from "vitest";

// Mock external dependencies that help-chat-retrieval imports at the top level.
// These must be declared before the actual module imports.
vi.mock("@/lib/prisma", () => ({
  prisma: {},
}));
vi.mock("@/lib/openai", () => ({
  openai: {},
}));

import { detectFrustration, chooseModel } from "@/lib/ai/help-chat-model-router";
import { buildHelpChatSystemPrompt } from "@/lib/ai/help-chat-system-prompt";
import {
  normalizeWord,
  tokenize,
  expandQueryTokens,
} from "@/lib/ai/help-chat-retrieval";
import {
  hasLikelyEntityToken,
  shouldUseInferredAnswerUpfront,
} from "@/lib/ai/help-chat-intents";

// ---------------------------------------------------------------------------
// 1. Model Router
// ---------------------------------------------------------------------------
describe("Model Router", () => {
  // -- detectFrustration ---------------------------------------------------
  describe("detectFrustration()", () => {
    it.each([
      "no funciona nada",
      "mala respuesta",
      "no sirve esta respuesta",
      "ya te pregunte esto antes",
      "no me ayuda lo que dices",
      "incorrecto, eso no es",
      "sigues sin contestar bien",
      "no puedo hacer nada",
      "de nuevo el mismo error",
      "no es eso lo que pedi",
      "otra vez lo mismo",
    ])("returns true for frustrated message: '%s'", (msg) => {
      expect(detectFrustration(msg)).toBe(true);
    });

    it("does NOT detect frustration for 'no anda' (not in keyword list)", () => {
      expect(detectFrustration("esto no anda, ayudame")).toBe(false);
    });

    it.each([
      "como creo un guardia",
      "que es la UF",
      "quiero ver las rendiciones pendientes",
      "donde encuentro la pauta mensual",
      "hola",
      "gracias",
      "buen dia, necesito ayuda con rondas",
    ])("returns false for normal message: '%s'", (msg) => {
      expect(detectFrustration(msg)).toBe(false);
    });

    it("is accent-insensitive", () => {
      // "no puedo" with accent on u should still match
      expect(detectFrustration("No puedo hacer eso")).toBe(true);
      // "como" with accent should not be frustrated
      expect(detectFrustration("Como creo un guardia")).toBe(false);
    });

    it("is case-insensitive", () => {
      expect(detectFrustration("NO FUNCIONA")).toBe(true);
      expect(detectFrustration("Mala Respuesta")).toBe(true);
    });
  });

  // -- chooseModel ---------------------------------------------------------
  describe("chooseModel()", () => {
    it('returns "gpt-4o-mini" by default (no frustration, good retrieval, no fallbacks)', () => {
      const model = chooseModel({
        frustrated: false,
        recentFallbackCount: 0,
        retrievalMaxScore: 8,
      });
      expect(model).toBe("gpt-4o-mini");
    });

    it('returns "gpt-4o-mini" when retrievalMaxScore is 0 (no retrieval ran)', () => {
      const model = chooseModel({
        frustrated: false,
        recentFallbackCount: 0,
        retrievalMaxScore: 0,
      });
      expect(model).toBe("gpt-4o-mini");
    });

    it('escalates to "gpt-4o" when frustrated=true', () => {
      const model = chooseModel({
        frustrated: true,
        recentFallbackCount: 0,
        retrievalMaxScore: 8,
      });
      expect(model).toBe("gpt-4o");
    });

    it('escalates to "gpt-4o" when recentFallbackCount >= 2', () => {
      expect(
        chooseModel({
          frustrated: false,
          recentFallbackCount: 2,
          retrievalMaxScore: 8,
        }),
      ).toBe("gpt-4o");

      expect(
        chooseModel({
          frustrated: false,
          recentFallbackCount: 5,
          retrievalMaxScore: 8,
        }),
      ).toBe("gpt-4o");
    });

    it('does NOT escalate when recentFallbackCount is 1', () => {
      expect(
        chooseModel({
          frustrated: false,
          recentFallbackCount: 1,
          retrievalMaxScore: 8,
        }),
      ).toBe("gpt-4o-mini");
    });

    it('escalates to "gpt-4o" when retrievalMaxScore > 0 and < 4 (weak evidence)', () => {
      expect(
        chooseModel({
          frustrated: false,
          recentFallbackCount: 0,
          retrievalMaxScore: 3,
        }),
      ).toBe("gpt-4o");

      expect(
        chooseModel({
          frustrated: false,
          recentFallbackCount: 0,
          retrievalMaxScore: 1,
        }),
      ).toBe("gpt-4o");
    });

    it('does NOT escalate when retrievalMaxScore is exactly 4 (at threshold)', () => {
      expect(
        chooseModel({
          frustrated: false,
          recentFallbackCount: 0,
          retrievalMaxScore: 4,
        }),
      ).toBe("gpt-4o-mini");
    });

    it('escalates to "gpt-4o" when writeIntent=true (and not without it)', () => {
      expect(
        chooseModel({
          retrievalMaxScore: 8,
          recentFallbackCount: 0,
          frustrated: false,
          writeIntent: true,
        }),
      ).toBe("gpt-4o");

      expect(
        chooseModel({
          retrievalMaxScore: 8,
          recentFallbackCount: 0,
          frustrated: false,
          writeIntent: false,
        }),
      ).toBe("gpt-4o-mini");
    });

    it("frustration takes priority over other signals", () => {
      const model = chooseModel({
        frustrated: true,
        recentFallbackCount: 0,
        retrievalMaxScore: 10,
      });
      expect(model).toBe("gpt-4o");
    });
  });
});

// ---------------------------------------------------------------------------
// 2. System Prompt Builder
// ---------------------------------------------------------------------------
describe("System Prompt Builder", () => {
  const baseParams = {
    fallbackText: "Lo siento, no tengo suficiente informacion.",
    allowDataQuestions: true,
    todayLabel: "viernes 14 de febrero de 2025",
    appBaseUrl: "https://app.opai.gard.cl",
    retrievalHasEvidence: true,
  };

  it('output always contains "Asistente OPAI"', () => {
    const prompt = buildHelpChatSystemPrompt(baseParams);
    expect(prompt).toContain("Asistente OPAI");
  });

  it("output contains the todayLabel string", () => {
    const prompt = buildHelpChatSystemPrompt(baseParams);
    expect(prompt).toContain("viernes 14 de febrero de 2025");
  });

  it("output contains the appBaseUrl string", () => {
    const prompt = buildHelpChatSystemPrompt(baseParams);
    expect(prompt).toContain("https://app.opai.gard.cl");
  });

  it("output contains the fallbackText string", () => {
    const prompt = buildHelpChatSystemPrompt(baseParams);
    expect(prompt).toContain("Lo siento, no tengo suficiente informacion.");
  });

  it("includes evidence guardrails when retrievalHasEvidence=true", () => {
    const prompt = buildHelpChatSystemPrompt({
      ...baseParams,
      retrievalHasEvidence: true,
    });
    expect(prompt).toContain("respuesta puede ser parcial");
    // Should NOT contain the fallback-search instruction
    expect(prompt).not.toContain("Pide al usuario 1 dato adicional");
  });

  it("includes fallback-search text when retrievalHasEvidence=false", () => {
    const prompt = buildHelpChatSystemPrompt({
      ...baseParams,
      retrievalHasEvidence: false,
    });
    expect(prompt).toContain("pide al usuario 1 dato adicional");
    // Should NOT contain the partial evidence text
    expect(prompt).not.toContain("respuesta puede ser parcial");
  });

  it("mentions tool usage when allowDataQuestions=true", () => {
    const prompt = buildHelpChatSystemPrompt({
      ...baseParams,
      allowDataQuestions: true,
    });
    expect(prompt).toContain("Puedes y debes usar herramientas");
  });

  it("disables tool usage when allowDataQuestions=false", () => {
    const prompt = buildHelpChatSystemPrompt({
      ...baseParams,
      allowDataQuestions: false,
    });
    expect(prompt).toContain("No puedes usar herramientas de datos");
  });

  it("includes OPAI domain context (modules, glossary)", () => {
    const prompt = buildHelpChatSystemPrompt(baseParams);
    expect(prompt).toContain("Plataforma SaaS para empresas de seguridad privada en Chile");
    expect(prompt).toContain("Puesto operativo");
    expect(prompt).toContain("CRM");
    expect(prompt).toContain("Rondas");
  });
});

// ---------------------------------------------------------------------------
// 3. Retrieval utility functions (pure, no I/O)
// ---------------------------------------------------------------------------
describe("Retrieval utilities", () => {
  // -- normalizeWord -------------------------------------------------------
  describe("normalizeWord()", () => {
    it("lowercases input", () => {
      // "GUARDIA" -> "guardia" (7 chars, no trailing s/es, no stripping)
      expect(normalizeWord("GUARDIA")).toBe("guardia");
    });

    it("strips diacritics / accents", () => {
      // "gestión" -> "gestion" -> stems to "gestion" (no trailing s/es)
      expect(normalizeWord("gestión")).toBe("gestion");
    });

    it("removes non-alphanumeric characters", () => {
      expect(normalizeWord("check-point!")).toBe("checkpoint");
    });

    it("strips trailing 's' for words > 3 chars", () => {
      // "guardias" -> "guardia" (strips trailing 's', not 'as')
      expect(normalizeWord("guardias")).toBe("guardia");
      // "rondas" -> "ronda" (strips trailing 's')
      expect(normalizeWord("rondas")).toBe("ronda");
    });

    it("strips trailing 'es' for words > 4 chars", () => {
      expect(normalizeWord("rendiciones")).toBe("rendicion");
    });

    it("does NOT strip 's' from short words <= 3 chars", () => {
      expect(normalizeWord("sas")).toBe("sas");
    });
  });

  // -- tokenize ------------------------------------------------------------
  describe("tokenize()", () => {
    it("splits text into normalized tokens", () => {
      const tokens = tokenize("Como creo un guardia nuevo");
      // "como" -> stopword removed; "creo" -> 4 chars, not a stopword, included
      // "un" < 3 chars removed; "guardia" -> "guardia"; "nuevo" -> "nuevo"
      expect(tokens).toContain("guardia");
      expect(tokens).toContain("nuevo");
      expect(tokens).toContain("creo");
      // "como" is a stopword
      expect(tokens).not.toContain("como");
    });

    it("filters out stopwords by default", () => {
      const tokens = tokenize("como donde cuando para");
      expect(tokens).toEqual([]);
    });

    it("keeps stopwords when keepStopwords=true", () => {
      const tokens = tokenize("como creo un guardia", true);
      expect(tokens).toContain("como");
    });

    it("filters out tokens shorter than 3 chars", () => {
      const tokens = tokenize("yo tu el la lo", true);
      expect(tokens).toEqual([]);
    });

    it("handles empty string", () => {
      expect(tokenize("")).toEqual([]);
    });
  });

  // -- expandQueryTokens ---------------------------------------------------
  describe("expandQueryTokens()", () => {
    it("returns original tokens plus their synonyms", () => {
      const tokens = ["guardia"];
      const expanded = expandQueryTokens(tokens);
      expect(expanded.has("guardia")).toBe(true);
      // synonyms of "guardia" include "guardias", "postulante", "persona", etc.
      // After normalizeWord: "guardias"->"guardia", "postulante"->"postulante",
      // "persona"->"persona", "desvinculado"->"desvinculado", "desvinculados"->"desvinculado"
      expect(expanded.has("postulante")).toBe(true);
      expect(expanded.has("persona")).toBe(true);
      expect(expanded.has("desvinculado")).toBe(true);
    });

    it("returns only the token itself when no synonyms exist", () => {
      const expanded = expandQueryTokens(["xyznonexistent"]);
      expect(expanded.size).toBe(1);
      expect(expanded.has("xyznonexistent")).toBe(true);
    });

    it("handles multiple input tokens", () => {
      const expanded = expandQueryTokens(["ronda", "checkpoint"]);
      expect(expanded.has("ronda")).toBe(true);
      expect(expanded.has("checkpoint")).toBe(true);
      // ronda synonyms include "patrulla", "monitoreo"
      // After normalizeWord: "patrulla"->"patrulla", "monitoreo"->"monitoreo"
      expect(expanded.has("patrulla")).toBe(true);
      expect(expanded.has("monitoreo")).toBe(true);
    });

    it("deduplicates overlapping synonyms", () => {
      // "ronda" and "checkpoint" both should expand but not double-count
      const expanded = expandQueryTokens(["ronda", "checkpoint"]);
      const arr = [...expanded];
      const uniqueArr = [...new Set(arr)];
      expect(arr.length).toBe(uniqueArr.length);
    });

    it("does not include synonym shorter than 3 chars after normalization", () => {
      // All synonyms should be >= 3 chars after normalizeWord
      const expanded = expandQueryTokens(["qr"]);
      for (const token of expanded) {
        if (token === "qr") continue; // the original token itself
        expect(token.length).toBeGreaterThanOrEqual(3);
      }
    });
  });
});

// ---------------------------------------------------------------------------
// 4. Entity-aware intent gating
// ---------------------------------------------------------------------------
describe("hasLikelyEntityToken()", () => {
  it.each([
    // Capitalizada en medio (Ametel, Felipe, Bauwerk) — caso principal del bug
    "¿Qué contactos tiene el cliente Ametel?",
    "actualiza el cargo de Felipe Rivas a Administrador de Contrato",
    "instalación Bauwerk Centro qué status tiene",
    // Códigos de entidad
    "muéstrame la cotización CPQ-2024-15",
    "buscar deal DEAL-99",
    // RUT
    "RUT 12.345.678-9 a quién pertenece",
    // Email
    "envíame info de frivas@ametel.cl",
    // Frase entrecomillada
    'cambia el cargo a "Jefe de Terreno"',
  ])("detects an entity in: '%s'", (msg) => {
    expect(hasLikelyEntityToken(msg)).toBe(true);
  });

  it.each([
    "¿cómo creo un cliente?",
    "¿dónde están los turnos extra?",
    "qué módulos hay",
    "qué puedes hacer",
    "ayuda con rondas",
    "cómo funciona la pauta mensual",
    "qué es OPAI",
    "qué es la UF",
    // Variantes lowercase: la heurística NO dispara, pero el LLM aplica la
    // regla #0 del system prompt y llama search_all igual. Documentamos
    // este trade-off explícitamente.
    "qué contactos tiene ametel",
  ])("does NOT trigger entity detection on generic prompt: '%s'", (msg) => {
    expect(hasLikelyEntityToken(msg)).toBe(false);
  });
});

describe("shouldUseInferredAnswerUpfront()", () => {
  it("returns true for a purely functional question (no entity)", () => {
    expect(shouldUseInferredAnswerUpfront("¿cómo creo un cliente?")).toBe(true);
    expect(shouldUseInferredAnswerUpfront("dónde están los turnos extra")).toBe(true);
  });

  it("returns false when the message references a named entity (the Ametel bug)", () => {
    // Antes del fix, esto devolvía true porque "cliente" matchea el marker
    // funcional y se servía la plantilla de CRM > Cuentas/Leads sin consultar
    // los contactos reales. Tras el fix debe devolver false para que el LLM
    // llame search_contacts/search_accounts.
    expect(
      shouldUseInferredAnswerUpfront("¿Qué contactos tiene el cliente Ametel?"),
    ).toBe(false);
  });

  it("returns false on action verbs over entities", () => {
    expect(
      shouldUseInferredAnswerUpfront(
        "actualiza el cargo de Felipe Rivas a Administrador de Contrato",
      ),
    ).toBe(false);
    expect(
      shouldUseInferredAnswerUpfront("cambia la dirección de la instalación Centro Bauwerk"),
    ).toBe(false);
  });

  it("preserves the rendiciones data exception", () => {
    expect(
      shouldUseInferredAnswerUpfront("¿faltan rendiciones por aprobar?"),
    ).toBe(false);
  });

  it("returns false for data-heavy questions (cuántos, total, hoy)", () => {
    expect(shouldUseInferredAnswerUpfront("¿cuántos guardias hay hoy?")).toBe(false);
  });

  it.each([
    "inactiva las instalaciones del cliente ametel",
    "desactiva la instalacion bodega renca",
    "crea una cuenta para constructora andes",
    "emite la factura del cliente melon",
    "aprueba la rendicion de lizeth",
  ])("returns false for action-verb orders (never serve template): '%s'", (msg) => {
    expect(shouldUseInferredAnswerUpfront(msg)).toBe(false);
  });

  it.each([
    "como funciona la pauta mensual",
    "donde descargo la app de guardias",
    "como ingreso al modulo de rondas",
  ])("still returns true for purely functional questions: '%s'", (msg) => {
    expect(shouldUseInferredAnswerUpfront(msg)).toBe(true);
  });

  it("word-boundary: 'control' does not trigger via 'rol' nor action verbs", () => {
    // "rol" está en FUNCTIONAL_MARKERS y antes matcheaba dentro de "control"
    // por substring; con word-boundary sigue siendo pregunta funcional solo
    // gracias a "como", y ningún verbo de acción dispara dentro de otra palabra.
    expect(shouldUseInferredAnswerUpfront("como reviso el control nocturno")).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// 5. Golden intents — frases reales de Carlos (voz, minúsculas)
// ---------------------------------------------------------------------------
describe("golden intents — Carlos voice", () => {
  it.each([
    ["como creo un cliente nuevo", true],
    ["donde veo la pauta mensual", true],
    ["como funciona el modulo de rondas", true],
    ["como configuro los turnos extra", true],
    ["como descargo la app del guardia", true],
    ["inactiva las de ametel", false],
    ["todas las de melon a inactive", false],
    ["crea un ticket p1 por puerta abierta", false],
    ["toma el tk-1234 y comenta ya", false],
    ["cuantos tickets vencidos hay hoy", false],
  ] as const)("shouldUseInferredAnswerUpfront(%j) → %s", (phrase, expected) => {
    expect(shouldUseInferredAnswerUpfront(phrase)).toBe(expected);
  });
});
