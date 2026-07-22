import { describe, expect, it } from "vitest";
import { normalizeLeadExtraction } from "../email-to-lead.service";

describe("normalizeLeadExtraction", () => {
  it("extrae mapsUrl del cuerpo si la IA no lo devolvió", () => {
    const result = normalizeLeadExtraction(
      {
        empresa: "Costaventura",
        contacto: { nombre: "Daniela" },
        requerimiento: "8 guardias 7x7",
        dotacionEstimada: 8,
        esLicitacion: false,
        confianza: {},
      },
      {
        bodyText:
          "Dirección Oficina Poderosa 175\nhttps://maps.app.goo.gl/AbCdEfGhIjKlMnOp",
      },
    );
    expect(result.mapsUrl).toContain("maps.app.goo.gl");
    expect(result.puestos).toHaveLength(2);
    expect(result.puestos[0].horaInicio).toBe("08:00");
    expect(result.puestos[1].horaInicio).toBe("20:00");
    const total = result.puestos.reduce((a, p) => a + (p.numGuards ?? 0), 0);
    expect(total).toBe(8);
  });

  it("marca servicio continuo por defecto y respeta meses", () => {
    const continuo = normalizeLeadExtraction({
      empresa: "X",
      contacto: {},
      isOngoingService: true,
      mesesContrato: 12,
      confianza: {},
    });
    expect(continuo.isOngoingService).toBe(true);
    expect(continuo.mesesContrato).toBeNull();

    const plazo = normalizeLeadExtraction({
      empresa: "X",
      contacto: {},
      isOngoingService: false,
      mesesContrato: 6,
      confianza: {},
    });
    expect(plazo.isOngoingService).toBe(false);
    expect(plazo.mesesContrato).toBe(6);
  });

  it("conserva puestos estructurados de la IA", () => {
    const result = normalizeLeadExtraction({
      empresa: "Y",
      contacto: {},
      puestos: [
        {
          nombre: "Acceso",
          rol: "Guardia",
          dias: ["lunes", "martes"],
          horaInicio: "09:00",
          horaFin: "18:00",
          numGuards: 2,
          numPuestos: 2,
          sueldoBruto: 600000,
        },
      ],
      confianza: {},
    });
    expect(result.puestos).toHaveLength(1);
    expect(result.puestos[0].sueldoBruto).toBe(600000);
    expect(result.dotacionEstimada).toBe(2);
  });
});
