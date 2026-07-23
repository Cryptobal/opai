import { describe, expect, it } from "vitest";
import {
  composerSnapshot,
  docPlainText,
  isComposerPristine,
  sameStringList,
} from "../composer-draft";

/** Documento Tiptap mínimo con un párrafo de texto. */
function doc(text: string): object {
  return { type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text }] }] };
}

describe("docPlainText", () => {
  it("vacío para null o doc sin texto", () => {
    expect(docPlainText(null)).toBe("");
    expect(docPlainText({ type: "doc", content: [] })).toBe("");
  });

  it("extrae y normaliza el texto del cuerpo", () => {
    expect(docPlainText(doc("Hola equipo"))).toBe("Hola equipo");
  });
});

describe("sameStringList", () => {
  it("compara listas por contenido y orden", () => {
    expect(sameStringList(["a@b.com"], ["a@b.com"])).toBe(true);
    expect(sameStringList([], [])).toBe(true);
    expect(sameStringList(["a@b.com"], ["c@d.com"])).toBe(false);
    expect(sameStringList(["a"], ["a", "b"])).toBe(false);
  });
});

describe("isComposerPristine", () => {
  it("una respuesta recién abierta (destinatario + asunto prefijados, sin cuerpo) es prístina", () => {
    // Regresión: abrir/leer un correo montaba el composer de respuesta y su
    // autosave creaba un borrador fantasma en Gmail con solo 'Re: …'.
    const baseline = composerSnapshot({
      to: ["cliente@example.com"],
      cc: [],
      bcc: [],
      subject: "Re: Facturas rechazadas",
      body: null,
    });
    const current = {
      to: ["cliente@example.com"],
      cc: [],
      bcc: [],
      subject: "Re: Facturas rechazadas",
      body: null,
    };
    expect(isComposerPristine(current, baseline)).toBe(true);
  });

  it("una composición nueva vacía es prístina", () => {
    const baseline = composerSnapshot({ to: [], cc: [], bcc: [], subject: "", body: null });
    expect(isComposerPristine({ to: [], cc: [], bcc: [], subject: "", body: null }, baseline)).toBe(true);
  });

  it("un borrador IA precargado sin tocar es prístino", () => {
    const ai = doc("Estimado, adjunto la información solicitada.");
    const baseline = composerSnapshot({
      to: ["cliente@example.com"],
      cc: [],
      bcc: [],
      subject: "Re: Facturas rechazadas",
      body: ai,
    });
    const current = {
      to: ["cliente@example.com"],
      cc: [],
      bcc: [],
      subject: "Re: Facturas rechazadas",
      body: ai,
    };
    expect(isComposerPristine(current, baseline)).toBe(true);
  });

  it("escribir en el cuerpo deja de ser prístino (sí se guarda)", () => {
    const baseline = composerSnapshot({
      to: ["cliente@example.com"],
      cc: [],
      bcc: [],
      subject: "Re: Facturas rechazadas",
      body: null,
    });
    const current = {
      to: ["cliente@example.com"],
      cc: [],
      bcc: [],
      subject: "Re: Facturas rechazadas",
      body: doc("Estimado, gracias por su mensaje."),
    };
    expect(isComposerPristine(current, baseline)).toBe(false);
  });

  it("cambiar destinatarios o asunto deja de ser prístino", () => {
    const baseline = composerSnapshot({
      to: ["cliente@example.com"],
      cc: [],
      bcc: [],
      subject: "Re: Facturas rechazadas",
      body: null,
    });
    expect(
      isComposerPristine(
        { to: ["cliente@example.com", "jefe@example.com"], cc: [], bcc: [], subject: "Re: Facturas rechazadas", body: null },
        baseline,
      ),
    ).toBe(false);
    expect(
      isComposerPristine(
        { to: ["cliente@example.com"], cc: [], bcc: [], subject: "Re: Facturas rechazadas — urgente", body: null },
        baseline,
      ),
    ).toBe(false);
  });
});
