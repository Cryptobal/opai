import { describe, expect, it } from "vitest";
import { plainTextToTiptapDoc } from "../email-inline-images";

describe("plainTextToTiptapDoc", () => {
  it("párrafos separados por línea en blanco", () => {
    const doc = plainTextToTiptapDoc("Hola\n\nChau") as {
      type: string;
      content: Array<{ type: string; content?: Array<{ type: string; text?: string }> }>;
    };
    expect(doc.type).toBe("doc");
    expect(doc.content).toHaveLength(2);
    expect(doc.content[0].content?.[0]).toEqual({ type: "text", text: "Hola" });
    expect(doc.content[1].content?.[0]).toEqual({ type: "text", text: "Chau" });
  });

  it("saltos simples se vuelven hardBreak dentro del párrafo", () => {
    const doc = plainTextToTiptapDoc("línea 1\nlínea 2") as {
      content: Array<{ content?: Array<{ type: string; text?: string }> }>;
    };
    expect(doc.content).toHaveLength(1);
    const nodes = doc.content[0].content ?? [];
    expect(nodes.map((n) => n.type)).toEqual(["text", "hardBreak", "text"]);
  });

  it("texto vacío produce un doc con párrafo vacío (editor válido)", () => {
    const doc = plainTextToTiptapDoc("") as { content: Array<{ type: string }> };
    expect(doc.content).toHaveLength(1);
    expect(doc.content[0]).toEqual({ type: "paragraph" });
  });
});
