import { describe, expect, it } from "vitest";
import { parseApiJsonText } from "../parse-json";

describe("parseApiJsonText", () => {
  it("no tira con body vacío", () => {
    expect(parseApiJsonText("")).toEqual({
      success: false,
      error: "Respuesta vacía del servidor",
    });
    expect(parseApiJsonText("   \n")).toEqual({
      success: false,
      error: "Respuesta vacía del servidor",
    });
  });

  it("no tira con JSON truncado y deja detail", () => {
    const result = parseApiJsonText('{"success":true,"data":{');
    expect(result.success).toBe(false);
    expect(result.error).toBe("No se pudo leer la respuesta del servidor");
    expect(result.detail).toContain('{"success":true');
  });

  it("acepta JSON de éxito con data", () => {
    const result = parseApiJsonText(
      JSON.stringify({ success: true, data: { enabled: false } })
    );
    expect(result).toEqual({
      success: true,
      error: undefined,
      detail: undefined,
      data: { enabled: false },
    });
  });

  it("acepta JSON de error con detail", () => {
    const result = parseApiJsonText(
      JSON.stringify({
        success: false,
        error: "Error generando el PDF",
        detail: "Could not resolve font",
      })
    );
    expect(result.success).toBe(false);
    expect(result.error).toBe("Error generando el PDF");
    expect(result.detail).toBe("Could not resolve font");
  });

  it("trata arrays y primitivos como inválidos", () => {
    expect(parseApiJsonText("[]").success).toBe(false);
    expect(parseApiJsonText("null").success).toBe(false);
    expect(parseApiJsonText('"ok"').success).toBe(false);
  });
});
