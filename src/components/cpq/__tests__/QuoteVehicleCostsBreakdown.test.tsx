import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { QuoteVehicleCostsBreakdown } from "../QuoteVehicleCostsBreakdown";
import type { CpqQuoteVehicle } from "@/types/cpq";

const CPQ_287_VEHICLE: CpqQuoteVehicle = {
  vehiclesCount: 1,
  rentMonthly: 1_800_000,
  kmPerDay: 80,
  daysPerMonth: 30,
  kmPerLiter: 10,
  fuelPrice: 1250,
  maintenanceMonthly: 80_000,
  isEnabled: true,
  visibility: "visible",
};

describe("QuoteVehicleCostsBreakdown", () => {
  it("extra enabled muestra arriendo, combustible y mantención", () => {
    render(
      <QuoteVehicleCostsBreakdown
        vehicles={[CPQ_287_VEHICLE]}
        displayCurrency="CLP"
        ufValue={40_876}
      />,
    );

    expect(screen.getByTestId("quote-vehicle-breakdown")).toBeInTheDocument();
    expect(screen.getByTestId("quote-vehicle-part-rent")).toHaveTextContent("Arriendo");
    expect(screen.getByTestId("quote-vehicle-part-fuel")).toHaveTextContent("Combustible");
    expect(screen.getByTestId("quote-vehicle-part-maintenance")).toHaveTextContent(
      "Mantención",
    );
    expect(screen.getByTestId("quote-vehicle-part-rent")).toHaveTextContent("1.800.000");
    expect(screen.getByTestId("quote-vehicle-part-fuel")).toHaveTextContent("300.000");
    expect(screen.getByTestId("quote-vehicle-part-maintenance")).toHaveTextContent("80.000");
  });

  it("extra disabled o ausente no renderiza desglose", () => {
    const { rerender } = render(
      <QuoteVehicleCostsBreakdown
        vehicles={[{ ...CPQ_287_VEHICLE, isEnabled: false }]}
        displayCurrency="CLP"
      />,
    );
    expect(screen.queryByTestId("quote-vehicle-breakdown")).not.toBeInTheDocument();

    rerender(<QuoteVehicleCostsBreakdown vehicles={[]} displayCurrency="CLP" />);
    expect(screen.queryByTestId("quote-vehicle-breakdown")).not.toBeInTheDocument();
  });
});
