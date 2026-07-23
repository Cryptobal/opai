import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  threadFindFirst: vi.fn(),
  threadUpdate: vi.fn(),
  messagesFindMany: vi.fn(),
  generateText: vi.fn(),
  logAiUsage: vi.fn(),
}));
vi.mock("@/lib/prisma", () => ({
  prisma: {
    crmEmailThread: { findFirst: mocks.threadFindFirst, update: mocks.threadUpdate },
    crmEmailMessage: { findMany: mocks.messagesFindMany },
  },
}));
vi.mock("@/lib/ai-service", () => ({ aiService: { generateText: mocks.generateText } }));
vi.mock("@/lib/platform-ai-service", () => ({ logAiUsage: mocks.logAiUsage }));

import { summarizeThread } from "../email-summary.service";
import { UNTRUSTED_OPEN } from "../ai-untrusted";

const MESSAGES = [
  {
    id: "m1",
    direction: "in",
    fromEmail: "cliente@acme.com",
    sentAt: new Date("2026-07-20T10:00:00Z"),
    textBody: "Necesitamos ampliar la dotación en la planta.",
    htmlBody: null,
  },
  {
    id: "m2",
    direction: "out",
    fromEmail: "yo@gard.cl",
    sentAt: new Date("2026-07-21T10:00:00Z"),
    textBody: "Perfecto, enviamos propuesta el viernes.",
    htmlBody: null,
  },
];

beforeEach(() => {
  vi.clearAllMocks();
  mocks.messagesFindMany.mockResolvedValue(MESSAGES);
  mocks.threadUpdate.mockResolvedValue({});
  mocks.generateText.mockResolvedValue("• Resumen generado");
});

const base = {
  tenantId: "t1",
  emailAccountId: "acc-1",
  threadId: "th-1",
};

describe("summarizeThread (A01/A02)", () => {
  it("full genera, cachea por último mensaje y delimita el contenido externo", async () => {
    mocks.threadFindFirst.mockResolvedValue({
      id: "th-1",
      subject: "Dotación planta",
      aiThreadSummary: null,
      lastReadAt: null,
    });
    const result = await summarizeThread({ ...base, mode: "full" });
    expect(result).toMatchObject({ ok: true, cached: false, messagesCovered: 2 });
    const prompt = mocks.generateText.mock.calls[0][0] as string;
    expect(prompt).toContain(UNTRUSTED_OPEN);
    expect(prompt).toContain("cliente@acme.com");
    // Persistió el caché con el último mensaje.
    expect(mocks.threadUpdate.mock.calls[0][0].data.aiThreadSummary).toMatchObject({
      lastMessageId: "m2",
    });
    expect(mocks.logAiUsage).toHaveBeenCalledWith(
      expect.objectContaining({ feature: "correo-thread-summary" }),
    );
  });

  it("reabrir sin cambios NO re-llama al modelo (caché por lastMessageId)", async () => {
    mocks.threadFindFirst.mockResolvedValue({
      id: "th-1",
      subject: "Dotación planta",
      aiThreadSummary: {
        summary: "• Ya resumido",
        lastMessageId: "m2",
        generatedAt: "2026-07-21T12:00:00Z",
      },
      lastReadAt: null,
    });
    const result = await summarizeThread({ ...base, mode: "full" });
    expect(result).toMatchObject({ ok: true, cached: true, summary: "• Ya resumido" });
    expect(mocks.generateText).not.toHaveBeenCalled();
  });

  it("since-read solo resume lo posterior a lastReadAt", async () => {
    mocks.threadFindFirst.mockResolvedValue({
      id: "th-1",
      subject: "Dotación planta",
      aiThreadSummary: null,
      lastReadAt: new Date("2026-07-20T12:00:00Z"), // leyó después de m1
    });
    const result = await summarizeThread({ ...base, mode: "since-read" });
    expect(result).toMatchObject({ ok: true, messagesCovered: 1 });
    const prompt = mocks.generateText.mock.calls[0][0] as string;
    expect(prompt).toContain("Perfecto, enviamos propuesta");
    expect(prompt).not.toContain("Necesitamos ampliar la dotación");
  });

  it("since-read sin novedades responde sin llamar al modelo", async () => {
    mocks.threadFindFirst.mockResolvedValue({
      id: "th-1",
      subject: "Dotación planta",
      aiThreadSummary: null,
      lastReadAt: new Date("2026-07-22T12:00:00Z"), // leyó todo
    });
    const result = await summarizeThread({ ...base, mode: "since-read" });
    expect(result).toMatchObject({ ok: true, cached: true, messagesCovered: 0 });
    expect(mocks.generateText).not.toHaveBeenCalled();
  });

  it("aísla por tenant + casilla (404 si el hilo no es de la casilla)", async () => {
    mocks.threadFindFirst.mockResolvedValue(null);
    const result = await summarizeThread({ ...base, mode: "full" });
    expect(result).toMatchObject({ ok: false, status: 404 });
    const where = mocks.threadFindFirst.mock.calls[0][0].where;
    expect(where).toMatchObject({ tenantId: "t1", emailAccountId: "acc-1" });
  });
});
