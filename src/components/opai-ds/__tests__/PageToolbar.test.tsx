import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { PageToolbar } from "../PageToolbar";
import { KPIStrip } from "../KPIStrip";

describe("PageToolbar", () => {
  it("renders the provided slots", () => {
    render(
      <PageToolbar
        search={<input placeholder="Buscar" />}
        primaryAction={<button>Nuevo</button>}
      />,
    );
    expect(screen.getByPlaceholderText("Buscar")).toBeTruthy();
    expect(screen.getByText("Nuevo")).toBeTruthy();
  });

  it("renders a help trigger when helpText is provided", () => {
    render(<PageToolbar helpText="Explica la vista" />);
    expect(screen.getByLabelText("Ayuda")).toBeTruthy();
  });
});

describe("KPIStrip", () => {
  it("renders each item's label and value", () => {
    render(
      <KPIStrip
        items={[
          { label: "Activos", value: 128 },
          { label: "En turno", value: 96, variant: "ok" },
        ]}
      />,
    );
    expect(screen.getByText("Activos")).toBeTruthy();
    expect(screen.getByText("128")).toBeTruthy();
    expect(screen.getByText("En turno")).toBeTruthy();
  });

  it("renders nothing when items is empty", () => {
    const { container } = render(<KPIStrip items={[]} />);
    expect(container.firstChild).toBeNull();
  });
});
