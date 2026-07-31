import { describe, expect, it } from "vitest";
import {
  parseReplyIntentsCache,
  parseReplyIntentsResponse,
} from "../reply-intents.service";

describe("parseReplyIntentsResponse", () => {
  it("parsea un array JSON limpio y numera los ids", () => {
    const out = parseReplyIntentsResponse(
      '[{"label":"Confirmar reunión","hint":"proponer horario esta semana"},{"label":"Pedir dotación","hint":"cuántos guardias por turno"},{"label":"Enviar cotización","hint":"adjuntar propuesta vigente"}]',
    );
    expect(out).toHaveLength(3);
    expect(out[0]).toEqual({
      id: "intent-1",
      label: "Confirmar reunión",
      hint: "proponer horario esta semana",
    });
    expect(out[2].id).toBe("intent-3");
  });

  it("tolera fences y texto alrededor", () => {
    const out = parseReplyIntentsResponse(
      'Claro:\n```json\n[{"label":"A","hint":"h"},{"label":"B","hint":"h"},{"label":"C","hint":"h"}]\n```\n',
    );
    expect(out.map((i) => i.label)).toEqual(["A", "B", "C"]);
  });

  it("recorta label a 5 palabras y hint a 8", () => {
    const long = "uno dos tres cuatro cinco seis siete";
    const hint = "a b c d e f g h i j";
    const out = parseReplyIntentsResponse(
      JSON.stringify([
        { label: long, hint },
        { label: "B", hint: "h" },
        { label: "C", hint: "h" },
      ]),
    );
    expect(out[0].label).toBe("uno dos tres cuatro cinco");
    expect(out[0].hint.split(" ")).toHaveLength(8);
  });

  it("devuelve [] si no hay exactamente 3 válidas o el JSON está roto", () => {
    expect(parseReplyIntentsResponse('[{"label":"A","hint":"h"}]')).toEqual([]);
    expect(parseReplyIntentsResponse("no soy json")).toEqual([]);
    expect(parseReplyIntentsResponse("")).toEqual([]);
    expect(
      parseReplyIntentsResponse('[{"label":"  "},{"label":"B"},{"label":"C"}]'),
    ).toEqual([]);
  });

  it("descarta más de 3 quedándose con las primeras", () => {
    const out = parseReplyIntentsResponse(
      JSON.stringify([
        { label: "A", hint: "" },
        { label: "B", hint: "" },
        { label: "C", hint: "" },
        { label: "D", hint: "" },
      ]),
    );
    expect(out.map((i) => i.label)).toEqual(["A", "B", "C"]);
  });
});

describe("parseReplyIntentsCache", () => {
  const intents = [
    { id: "intent-1", label: "A", hint: "h" },
    { id: "intent-2", label: "B", hint: "h" },
    { id: "intent-3", label: "C", hint: "h" },
  ];

  it("acepta un caché bien formado", () => {
    const cache = parseReplyIntentsCache({
      intents,
      lastMessageId: "m9",
      generatedAt: "2026-01-01T00:00:00.000Z",
    });
    expect(cache?.lastMessageId).toBe("m9");
    expect(cache?.intents).toHaveLength(3);
  });

  it("rechaza formas inválidas (null, array, sin lastMessageId, incompletas)", () => {
    expect(parseReplyIntentsCache(null)).toBeNull();
    expect(parseReplyIntentsCache([])).toBeNull();
    expect(parseReplyIntentsCache({ intents })).toBeNull();
    expect(
      parseReplyIntentsCache({ intents: intents.slice(0, 2), lastMessageId: "m9" }),
    ).toBeNull();
  });
});
