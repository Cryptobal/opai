import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { UfPriceBreakdownBox } from "../_UfPriceBreakdown";

describe("UfPriceBreakdownBox", () => {
  it("muestra monto UF, valor UF y precio en pesos", () => {
    render(
      <UfPriceBreakdownBox
        amountUf={40}
        ufValue={38_000}
        clp={1_520_000}
        priceEdited={false}
        ufValueInferred={false}
        ufSourceLabel="31/08/2026"
      />,
    );
    expect(screen.getByText("Origen UF")).toBeTruthy();
    expect(screen.getByText(/40,00 UF/)).toBeTruthy();
    expect(screen.getByText(/\$38.000,00/)).toBeTruthy();
    expect(screen.getByText(/\$1.520.000/)).toBeTruthy();
    expect(screen.getByText("UF tomada: 31/08/2026")).toBeTruthy();
  });

  it("avisa si el precio en pesos fue editado", () => {
    render(
      <UfPriceBreakdownBox
        amountUf={40}
        ufValue={38_000}
        clp={1_500_000}
        priceEdited
        ufValueInferred={false}
      />,
    );
    expect(
      screen.getByText(/El precio en pesos fue modificado/),
    ).toBeTruthy();
  });

  it("indica cuando el valor UF se infirió", () => {
    render(
      <UfPriceBreakdownBox
        amountUf={118.9}
        ufValue={39_498.7}
        clp={4_696_396}
        priceEdited={false}
        ufValueInferred
      />,
    );
    expect(
      screen.getByText("Valor UF inferido del precio en pesos"),
    ).toBeTruthy();
  });
});
