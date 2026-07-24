import { describe, expect, it } from "vitest";
import { formatFromHeaderForStorage } from "../email-address";

describe("formatFromHeaderForStorage", () => {
  it("conserva display name + email", () => {
    expect(formatFromHeaderForStorage("OPAi app <noreply@gard.cl>", "ops@gard.cl")).toBe(
      "OPAi app <noreply@gard.cl>",
    );
  });

  it('soporta nombre entre comillas', () => {
    expect(
      formatFromHeaderForStorage('"Gard Valores" <noreply@gard.cl>', "ops@gard.cl"),
    ).toBe("Gard Valores <noreply@gard.cl>");
  });

  it("email pelado sin nombre", () => {
    expect(formatFromHeaderForStorage("cliente@acme.com", "ops@gard.cl")).toBe(
      "cliente@acme.com",
    );
  });

  it("From vacío → fallback de la casilla", () => {
    expect(formatFromHeaderForStorage("", "ops@gard.cl")).toBe("ops@gard.cl");
    expect(formatFromHeaderForStorage(null, "ops@gard.cl")).toBe("ops@gard.cl");
  });
});
