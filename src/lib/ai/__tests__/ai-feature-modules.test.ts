import { describe, it, expect } from "vitest";
import {
  AI_MODULES,
  moduleForFeature,
  isValidAiModule,
} from "@/lib/ai/ai-feature-modules";

describe("moduleForFeature", () => {
  it("mapea features conocidos por match exacto", () => {
    expect(moduleForFeature("correo-radar-classify")).toBe("crm");
    expect(moduleForFeature("correo-embeddings")).toBe("crm");
    expect(moduleForFeature("vra_vision")).toBe("ops");
    expect(moduleForFeature("help_chat")).toBe("config");
    expect(moduleForFeature("voice_transcription")).toBe("config");
  });

  it("usa heurística por substrings para features nuevos", () => {
    expect(moduleForFeature("payroll-liquidacion-x")).toBe("payroll");
    expect(moduleForFeature("ocr-mrz")).toBe("portales");
    expect(moduleForFeature("some-ronda-thing")).toBe("ops");
    expect(moduleForFeature("factoring-extraction")).toBe("finance");
    expect(moduleForFeature("cpq-service-description")).toBe("crm");
  });

  it("cae a 'general' cuando no hay match", () => {
    expect(moduleForFeature(undefined)).toBe("general");
    expect(moduleForFeature("")).toBe("general");
    expect(moduleForFeature("zzz-desconocido")).toBe("general");
  });
});

describe("AI_MODULES", () => {
  it("incluye TODOS los módulos de la app (los que el usuario marcó como faltantes)", () => {
    const ids = AI_MODULES.map((m) => m.id);
    for (const id of ["payroll", "docs", "reportes_dt", "portales", "compliance"]) {
      expect(ids).toContain(id);
      expect(isValidAiModule(id)).toBe(true);
    }
  });

  it("rechaza módulos inválidos", () => {
    expect(isValidAiModule("no-existe")).toBe(false);
  });
});
