import { describe, expect, it } from "vitest";
import { inferFromLegacyHtml } from "../signature-ui";

describe("inferFromLegacyHtml", () => {
  it("parte nombre y cargo por <br>", () => {
    const html =
      "<p>Carlos Irigoyen Garcés<br>Director Administración y Finanzas<br>Gard Security</p>" +
      '<a href="mailto:carlos@gard.cl">carlos@gard.cl</a> ' +
      '<a href="tel:+56987654321">+56 9 8765 4321</a>';
    const d = inferFromLegacyHtml(html);
    expect(d.fullName).toBe("Carlos Irigoyen Garcés");
    expect(d.role).toBe("Director Administración y Finanzas");
    expect(d.company).toBe("Gard Security");
    expect(d.email).toBe("carlos@gard.cl");
    expect(d.phone).toBe("+56987654321");
  });

  it("quita saludo Cordialmente y no deja todo de corrido", () => {
    const html =
      "<div>Cordialmente, Carlos Irigoyen Garcés</div>" +
      "<div>Director Administración y Finanzas</div>";
    const d = inferFromLegacyHtml(html);
    expect(d.fullName).toBe("Carlos Irigoyen Garcés");
    expect(d.role).toBe("Director Administración y Finanzas");
    expect(d.fullName).not.toMatch(/Director/i);
  });

  it("separa con · nombre y cargo en una línea", () => {
    const d = inferFromLegacyHtml("<p>Ana Pérez · Jefa de Operaciones</p>");
    expect(d.fullName).toBe("Ana Pérez");
    expect(d.role).toBe("Jefa de Operaciones");
  });
});
