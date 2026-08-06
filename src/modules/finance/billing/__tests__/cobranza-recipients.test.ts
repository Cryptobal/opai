import { describe, it, expect } from "vitest";

import {
  describeCobranzaSource,
  pickCobranzaRecipients,
  type CobranzaContactInput,
} from "../cobranza-recipients";

function contact(
  id: string,
  over: Partial<CobranzaContactInput> = {},
): CobranzaContactInput {
  return {
    id,
    firstName: id,
    lastName: "Test",
    email: `${id}@cliente.cl`,
    phone: "+56 9 1111 1111",
    recibeCobranza: false,
    isPrimary: false,
    ...over,
  };
}

describe("pickCobranzaRecipients — cascada", () => {
  it("1. el contacto explícito de la cuenta gana sobre flag y principal", () => {
    const out = pickCobranzaRecipients({
      contactoCobranzaId: "ana",
      contacts: [
        contact("ana"),
        contact("beto", { recibeCobranza: true }),
        contact("caro", { isPrimary: true }),
      ],
    });
    expect(out.source).toBe("explicit");
    expect(out.contacts.map((c) => c.id)).toEqual(["ana"]);
    expect(out.emails).toEqual(["ana@cliente.cl"]);
  });

  it("2. sin explícito toma TODOS los marcados con recibeCobranza", () => {
    const out = pickCobranzaRecipients({
      contacts: [
        contact("ana", { recibeCobranza: true }),
        contact("beto", { recibeCobranza: true }),
        contact("caro", { isPrimary: true }),
      ],
    });
    expect(out.source).toBe("flag");
    expect(out.contacts.map((c) => c.id)).toEqual(["ana", "beto"]);
    expect(out.emails).toEqual(["ana@cliente.cl", "beto@cliente.cl"]);
  });

  it("3. sin flags cae al contacto principal", () => {
    const out = pickCobranzaRecipients({
      contacts: [contact("ana"), contact("caro", { isPrimary: true })],
    });
    expect(out.source).toBe("primary");
    expect(out.contacts.map((c) => c.id)).toEqual(["caro"]);
  });

  it("4. sin nada: none y listas vacías (el caller avisa, no inventa)", () => {
    const out = pickCobranzaRecipients({ contacts: [contact("ana")] });
    expect(out).toEqual({ source: "none", contacts: [], emails: [], phones: [] });
  });

  it("sin contactos en la cuenta devuelve none", () => {
    expect(pickCobranzaRecipients({ contacts: [] }).source).toBe("none");
  });
});

describe("pickCobranzaRecipients — intención explícita", () => {
  it("respeta el explícito aunque no tenga email ni teléfono (no lo reemplaza)", () => {
    const out = pickCobranzaRecipients({
      contactoCobranzaId: "ana",
      contacts: [
        contact("ana", { email: null, phone: null }),
        contact("caro", { isPrimary: true }),
      ],
    });
    expect(out.source).toBe("explicit");
    expect(out.contacts.map((c) => c.id)).toEqual(["ana"]);
    expect(out.emails).toEqual([]);
    expect(out.phones).toEqual([]);
  });

  it("id colgado (contacto borrado o movido) sigue la cascada", () => {
    const out = pickCobranzaRecipients({
      contactoCobranzaId: "fantasma",
      contacts: [contact("beto", { recibeCobranza: true })],
    });
    expect(out.source).toBe("flag");
    expect(out.contacts.map((c) => c.id)).toEqual(["beto"]);
  });
});

describe("pickCobranzaRecipients — canales", () => {
  it("normaliza y deduplica emails", () => {
    const out = pickCobranzaRecipients({
      contacts: [
        contact("ana", { recibeCobranza: true, email: "  Pago@Cliente.CL " }),
        contact("beto", { recibeCobranza: true, email: "pago@cliente.cl" }),
      ],
    });
    expect(out.emails).toEqual(["pago@cliente.cl"]);
  });

  it("descarta emails y teléfonos placeholder", () => {
    const out = pickCobranzaRecipients({
      contacts: [
        contact("ana", { recibeCobranza: true, email: "n/a", phone: "-" }),
      ],
    });
    expect(out.contacts).toHaveLength(1);
    expect(out.emails).toEqual([]);
    expect(out.phones).toEqual([]);
  });

  it("deduplica teléfonos repetidos entre contactos", () => {
    const out = pickCobranzaRecipients({
      contacts: [
        contact("ana", { recibeCobranza: true, phone: "+56 9 2222 3333" }),
        contact("beto", { recibeCobranza: true, phone: "+56 9 2222 3333" }),
      ],
    });
    expect(out.phones).toEqual(["+56 9 2222 3333"]);
  });

  it("un contacto solo con teléfono sigue siendo destinatario válido", () => {
    const out = pickCobranzaRecipients({
      contacts: [
        contact("ana", { recibeCobranza: true, email: null, phone: "+56 9 4444 5555" }),
      ],
    });
    expect(out.source).toBe("flag");
    expect(out.emails).toEqual([]);
    expect(out.phones).toEqual(["+56 9 4444 5555"]);
  });
});

describe("describeCobranzaSource", () => {
  it("cubre los cuatro niveles", () => {
    expect(describeCobranzaSource("explicit")).toMatch(/cobranza/i);
    expect(describeCobranzaSource("flag")).toMatch(/marcados/i);
    expect(describeCobranzaSource("primary")).toMatch(/principal/i);
    expect(describeCobranzaSource("none")).toMatch(/sin destinatario/i);
  });
});
