import { describe, expect, it } from "vitest";
import {
  resolveCounterparty,
  resolveEmailThreadId,
  resolveOwnAndCounterparty,
  stripHtmlForAi,
} from "@/lib/ai/help-chat-email-context";

describe("resolveEmailThreadId", () => {
  it("prioriza threadId del args", () => {
    expect(
      resolveEmailThreadId(
        { threadId: " abc " },
        {
          entityType: "crm_email_thread",
          entityId: "from-context",
          entityName: "Mail",
        },
      ),
    ).toBe("abc");
  });

  it("usa page context crm_email_thread si no hay args", () => {
    expect(
      resolveEmailThreadId(
        {},
        {
          entityType: "crm_email_thread",
          entityId: "thread-1",
          entityName: "Servicio de vigilancia",
        },
      ),
    ).toBe("thread-1");
  });

  it("ignora page context de otro tipo", () => {
    expect(
      resolveEmailThreadId(
        {},
        {
          entityType: "crm_account",
          entityId: "acc-1",
          entityName: "Minsal",
        },
      ),
    ).toBe("");
  });

  it("devuelve vacío sin args ni contexto", () => {
    expect(resolveEmailThreadId({}, null)).toBe("");
  });
});

describe("stripHtmlForAi", () => {
  it("elimina tags y colapsa espacios", () => {
    expect(stripHtmlForAi("<p>Hola&nbsp;<b>mundo</b></p>")).toBe("Hola mundo");
  });
});

const OWN = {
  addresses: new Set(["comercial@gard.cl", "noreply@gard.cl"]),
  domains: new Set(["gard.cl"]),
};

describe("resolveCounterparty", () => {
  it("grupo Google: replyTo externo gana sobre From propio", () => {
    const result = resolveCounterparty(
      [
        {
          direction: "in",
          fromEmail:
            "'Alvaro Enrique Contreras Peralta' via Comercial <comercial@gard.cl>",
          replyToEmail: "acontreras@iplacex.cl",
          toEmails: ["comercial@gard.cl"],
          ccEmails: [],
        },
      ],
      OWN,
    );
    expect(result.counterparty?.email).toBe("acontreras@iplacex.cl");
    expect(result.source).toBe("reply_to");
    expect(result.confidence).toBe("high");
  });

  it("sin replyTo y from externo → from con confidence low", () => {
    const result = resolveCounterparty(
      [
        {
          direction: "in",
          fromEmail: "Alvaro Contreras <acontreras@iplacex.cl>",
          replyToEmail: null,
          toEmails: ["comercial@gard.cl"],
          ccEmails: [],
        },
      ],
      OWN,
    );
    expect(result.counterparty?.email).toBe("acontreras@iplacex.cl");
    expect(result.source).toBe("from");
    expect(result.confidence).toBe("low");
  });

  it("mensaje saliente → primer to externo", () => {
    const result = resolveCounterparty(
      [
        {
          direction: "out",
          fromEmail: "comercial@gard.cl",
          replyToEmail: null,
          toEmails: ["cliente@iplacex.cl", "otro@ejemplo.cl"],
          ccEmails: ["cc@externo.cl"],
        },
      ],
      OWN,
    );
    expect(result.counterparty?.email).toBe("cliente@iplacex.cl");
    expect(result.source).toBe("to");
    expect(result.externalParticipants.map((p) => p.email)).toEqual([
      "cliente@iplacex.cl",
      "otro@ejemplo.cl",
      "cc@externo.cl",
    ]);
  });

  it("hilo 100% interno → counterparty null", () => {
    const result = resolveCounterparty(
      [
        {
          direction: "in",
          fromEmail: "operaciones@gard.cl",
          replyToEmail: null,
          toEmails: ["comercial@gard.cl"],
          ccEmails: ["noreply@gard.cl"],
        },
        {
          direction: "out",
          fromEmail: "comercial@gard.cl",
          toEmails: ["operaciones@gard.cl"],
          ccEmails: [],
        },
      ],
      OWN,
    );
    expect(result.counterparty).toBeNull();
    expect(result.source).toBeNull();
    expect(result.externalParticipants).toHaveLength(0);
  });

  it("replyTo propio cae al siguiente candidato externo", () => {
    const result = resolveCounterparty(
      [
        {
          direction: "in",
          fromEmail: "comercial@gard.cl",
          replyToEmail: "noreply@gard.cl",
          toEmails: ["comercial@gard.cl"],
          ccEmails: ["tercero@cliente.cl"],
        },
      ],
      OWN,
    );
    expect(result.counterparty?.email).toBe("tercero@cliente.cl");
    expect(result.source).toBe("cc");
  });

  it("alias sendAs no primario tratado como propio", () => {
    const { resolution } = resolveOwnAndCounterparty({
      mailboxEmail: "comercial@gard.cl",
      sendAsEmails: ["ventas@gard.cl"],
      company: { email: "comercial@gard.cl" },
      messages: [
        {
          direction: "in",
          fromEmail: "ventas@gard.cl",
          replyToEmail: "persona@iplacex.cl",
          toEmails: ["comercial@gard.cl"],
          ccEmails: [],
        },
      ],
    });
    expect(resolution.counterparty?.email).toBe("persona@iplacex.cl");
    expect(resolution.source).toBe("reply_to");
  });

  it("from con replyTo en otro mensaje del hilo → confidence high", () => {
    const result = resolveCounterparty(
      [
        {
          direction: "in",
          fromEmail: "primera@cliente.cl",
          replyToEmail: "primera@cliente.cl",
          toEmails: ["comercial@gard.cl"],
          ccEmails: [],
        },
        {
          direction: "in",
          fromEmail: "segunda@cliente.cl",
          replyToEmail: null,
          toEmails: ["comercial@gard.cl"],
          ccEmails: [],
        },
      ],
      OWN,
    );
    // Más reciente sin replyTo → from; pero el hilo sí tiene replyTo → high
    expect(result.counterparty?.email).toBe("segunda@cliente.cl");
    expect(result.source).toBe("from");
    expect(result.confidence).toBe("high");
  });
});
