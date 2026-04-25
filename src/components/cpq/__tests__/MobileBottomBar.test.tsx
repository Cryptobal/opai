import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { MobileBottomBar } from "../MobileBottomBar";

describe("MobileBottomBar", () => {
  it("muestra un menu de acciones secundarias desde la barra inferior", () => {
    render(
      <MobileBottomBar
        salePriceMonthly={1200000}
        additionalLinesTotal={0}
        marginPct={13}
        ufValue={null}
        actionMenu={<button type="button">Clonar cotizacion</button>}
        portalButton={<button type="button">Enviar</button>}
      />
    );

    fireEvent.click(screen.getByRole("button", { name: /mas acciones/i }));

    expect(screen.getByText("Clonar cotizacion")).toBeInTheDocument();
  });
});
