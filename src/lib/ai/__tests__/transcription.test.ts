/**
 * Unit tests: resolución de capacidad de transcripción (desacoplada del chat).
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const hoisted = vi.hoisted(() => ({
  tenantOpenAI: null as null | { id: string },
  openaiClient: {
    audio: {
      transcriptions: {
        create: vi.fn(),
      },
    },
  },
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    tenantAiProvider: {
      findFirst: vi.fn(async () => hoisted.tenantOpenAI),
    },
  },
}));

vi.mock("@/lib/ai/tenant-openai", () => ({
  getTenantOpenAIClient: vi.fn(async () => hoisted.openaiClient),
}));

vi.mock("openai", () => ({
  default: vi.fn(),
  toFile: vi.fn(async (buf: Buffer, name: string) => ({ name, size: buf.length })),
}));

import {
  hasPlatformOpenAIKey,
  mimeToAudioExt,
  resolveTranscriptionCapability,
  transcribeAudioBuffer,
} from "@/lib/ai/transcription";
import { prisma } from "@/lib/prisma";

describe("mimeToAudioExt", () => {
  it("audio/mp4 (iOS Safari) → .m4a", () => {
    expect(mimeToAudioExt("audio/mp4")).toBe(".m4a");
  });

  it("audio/webm → .webm", () => {
    expect(mimeToAudioExt("audio/webm;codecs=opus")).toBe(".webm");
  });
});

describe("hasPlatformOpenAIKey", () => {
  const prev = process.env.OPENAI_API_KEY;

  afterEach(() => {
    if (prev === undefined) delete process.env.OPENAI_API_KEY;
    else process.env.OPENAI_API_KEY = prev;
  });

  it("placeholder de build no cuenta", () => {
    process.env.OPENAI_API_KEY = "sk-build-placeholder";
    expect(hasPlatformOpenAIKey()).toBe(false);
  });

  it("string vacío no cuenta", () => {
    process.env.OPENAI_API_KEY = "";
    expect(hasPlatformOpenAIKey()).toBe(false);
  });

  it("key válida sí cuenta", () => {
    process.env.OPENAI_API_KEY = "sk-proj-real";
    expect(hasPlatformOpenAIKey()).toBe(true);
  });
});

describe("resolveTranscriptionCapability", () => {
  const prev = process.env.OPENAI_API_KEY;

  beforeEach(() => {
    hoisted.tenantOpenAI = null;
    delete process.env.OPENAI_API_KEY;
    vi.mocked(prisma.tenantAiProvider.findFirst).mockImplementation(
      async () => hoisted.tenantOpenAI,
    );
  });

  afterEach(() => {
    if (prev === undefined) delete process.env.OPENAI_API_KEY;
    else process.env.OPENAI_API_KEY = prev;
  });

  it("prioriza OpenAI del tenant sobre env", async () => {
    hoisted.tenantOpenAI = { id: "prov-openai" };
    process.env.OPENAI_API_KEY = "sk-proj-platform";
    const cap = await resolveTranscriptionCapability("tenant-a", {
      providerType: "anthropic",
      apiKey: "x",
      baseUrl: "https://api.anthropic.com",
      model: "claude",
    });
    expect(cap).toEqual({ kind: "openai", source: "tenant" });
  });

  it("usa env válida cuando no hay provider de tenant", async () => {
    process.env.OPENAI_API_KEY = "sk-proj-platform";
    const cap = await resolveTranscriptionCapability("tenant-b", {
      providerType: "anthropic",
      apiKey: "x",
      baseUrl: "https://api.anthropic.com",
      model: "claude",
    });
    expect(cap).toEqual({ kind: "openai", source: "platform" });
  });

  it("sk-build-placeholder y vacío se tratan como ausencia", async () => {
    process.env.OPENAI_API_KEY = "sk-build-placeholder";
    expect(await resolveTranscriptionCapability("t1", null)).toEqual({ kind: "none" });
    process.env.OPENAI_API_KEY = "   ";
    expect(await resolveTranscriptionCapability("t1", null)).toEqual({ kind: "none" });
  });

  it("chat Google sin key OpenAI → kind google", async () => {
    const cap = await resolveTranscriptionCapability("tenant-c", {
      providerType: "google",
      apiKey: "gemini-key",
      baseUrl: "https://generativelanguage.googleapis.com",
      model: "gemini-2.0-flash",
    });
    expect(cap).toEqual({
      kind: "google",
      apiKey: "gemini-key",
      baseUrl: "https://generativelanguage.googleapis.com",
      model: "gemini-2.0-flash",
    });
  });

  it("chat Anthropic sin key OpenAI ni Google → none", async () => {
    const cap = await resolveTranscriptionCapability("tenant-d", {
      providerType: "anthropic",
      apiKey: "claude-key",
      baseUrl: "https://api.anthropic.com",
      model: "claude-haiku",
    });
    expect(cap).toEqual({ kind: "none" });
  });
});

describe("transcribeAudioBuffer", () => {
  const prev = process.env.OPENAI_API_KEY;

  beforeEach(() => {
    hoisted.tenantOpenAI = { id: "prov-openai" };
    process.env.OPENAI_API_KEY = "sk-proj-platform";
    hoisted.openaiClient.audio.transcriptions.create.mockReset();
  });

  afterEach(() => {
    if (prev === undefined) delete process.env.OPENAI_API_KEY;
    else process.env.OPENAI_API_KEY = prev;
  });

  it("devuelve texto + telemetría openai/whisper-1", async () => {
    hoisted.openaiClient.audio.transcriptions.create.mockResolvedValue({
      text: "  hola desde el micrófono  ",
    });
    const result = await transcribeAudioBuffer(
      "tenant-a",
      Buffer.from("fake-audio"),
      "audio/mp4",
      { providerType: "anthropic", apiKey: "x", baseUrl: "y", model: "z" },
    );
    expect(result).toEqual({
      text: "hola desde el micrófono",
      providerType: "openai",
      model: "whisper-1",
      keySource: "tenant",
    });
    expect(hoisted.openaiClient.audio.transcriptions.create).toHaveBeenCalledWith(
      expect.objectContaining({ model: "whisper-1", language: "es" }),
    );
  });

  it("null cuando no hay capacidad", async () => {
    hoisted.tenantOpenAI = null;
    delete process.env.OPENAI_API_KEY;
    const result = await transcribeAudioBuffer(
      "tenant-a",
      Buffer.from("x"),
      "audio/webm",
      { providerType: "anthropic", apiKey: "x", baseUrl: "y", model: "z" },
    );
    expect(result).toBeNull();
  });
});
