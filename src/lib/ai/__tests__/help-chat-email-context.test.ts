import { describe, expect, it } from "vitest";
import {
  resolveCounterparty,
  resolveEmailThreadId,
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

describe("resolveCounterparty", () => {
  const ownGard = {
    addresses: new Set(["comercial@gard.cl", "noreply@gard.cl"]),
    domains: new Set(["gard.cl"]),
  };

  it("grupo Google: From propio + Reply-To externo → reply_to high + nombre", () => {
    const result = resolveCounterparty(
      [
        {
          direction: "in",
          fromEmail: "'Alvaro' via Comercial <comercial@gard.cl>",
          replyToEmail: "acontreras@iplacex.cl",
          toEmails: ["comercial@gard.cl"],
          ccEmails: [],
        },
      ],
      ownGard,
    );
    expect(result.counterparty?.email).toBe("acontreras@iplacex.cl");
    expect(result.source).toBe("reply_to");
    expect(result.confidence).toBe("high");
    expect(result.counterparty?.name).toBe("Alvaro");
  });

  it("From externo sin Reply-To → from high", () => {
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
      ownGard,
    );
    expect(result.counterparty?.email).toBe("acontreras@iplacex.cl");
    expect(result.source).toBe("from");
    expect(result.confidence).toBe("high");
  });

  it("From propio sin Reply-To → primer to/cc externo con low", () => {
    const result = resolveCounterparty(
      [
        {
          direction: "in",
          fromEmail: "Comercial <comercial@gard.cl>",
          replyToEmail: null,
          toEmails: ["comercial@gard.cl"],
          ccEmails: ["tercero@cliente.cl"],
        },
      ],
      ownGard,
    );
    expect(result.counterparty?.email).toBe("tercero@cliente.cl");
    expect(result.source).toBe("cc");
    expect(result.confidence).toBe("low");
  });

  it("mensaje saliente → primer to externo", () => {
    const result = resolveCounterparty(
      [
        {
          direction: "out",
          fromEmail: "comercial@gard.cl",
          replyToEmail: null,
          toEmails: ["cliente@iplacex.cl"],
          ccEmails: [],
        },
      ],
      ownGard,
    );
    expect(result.counterparty?.email).toBe("cliente@iplacex.cl");
    expect(result.source).toBe("to");
    expect(result.confidence).toBe("low");
  });

  it("hilo 100% interno → counterparty null", () => {
    const result = resolveCounterparty(
      [
        {
          direction: "in",
          fromEmail: "ops@gard.cl",
          replyToEmail: null,
          toEmails: ["comercial@gard.cl"],
          ccEmails: [],
        },
      ],
      ownGard,
    );
    expect(result.counterparty).toBeNull();
    expect(result.confidence).toBeNull();
    expect(result.source).toBeNull();
  });

  it("alias sendAs no primario tratado como propio", () => {
    const ownWithAlias = {
      addresses: new Set(["comercial@gard.cl", "ventas@gard.cl"]),
      domains: new Set(["gard.cl"]),
    };
    const result = resolveCounterparty(
      [
        {
          direction: "in",
          fromEmail: "Cliente <cliente@externo.cl>",
          replyToEmail: "ventas@gard.cl",
          toEmails: ["ventas@gard.cl"],
          ccEmails: [],
        },
      ],
      ownWithAlias,
    );
    // Reply-To es propio → cae a From externo
    expect(result.counterparty?.email).toBe("cliente@externo.cl");
    expect(result.source).toBe("from");
    expect(result.confidence).toBe("high");
  });

  it("Reply-To propio cae al siguiente candidato externo", () => {
    const result = resolveCounterparty(
      [
        {
          direction: "in",
          fromEmail: "Comercial <comercial@gard.cl>",
          replyToEmail: "no-reply@gard.cl",
          toEmails: ["otro@cliente.cl"],
          ccEmails: [],
        },
      ],
      ownGard,
    );
    expect(result.counterparty?.email).toBe("otro@cliente.cl");
    expect(result.source).toBe("to");
    expect(result.confidence).toBe("low");
  });
});
