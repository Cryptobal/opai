import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { MarcacionModificadaBadge } from "../MarcacionModificadaBadge";

describe("MarcacionModificadaBadge", () => {
  it("muestra Pendiente cuando isModified y sin consolidar ni oponer", () => {
    render(
      <MarcacionModificadaBadge
        isModified={true}
        consolidatedAt={null}
        opposedAt={null}
      />
    );
    expect(screen.getByText("Modificada")).toBeInTheDocument();
    expect(screen.getByTitle(/pendiente/i)).toBeInTheDocument();
  });

  it("muestra Opuesta cuando hay opposedAt", () => {
    render(
      <MarcacionModificadaBadge
        isModified={true}
        consolidatedAt={null}
        opposedAt={new Date("2026-03-10T10:00:00Z")}
      />
    );
    expect(screen.getByTitle(/opuesta/i)).toBeInTheDocument();
  });

  it("muestra Consolidada cuando hay consolidatedAt", () => {
    render(
      <MarcacionModificadaBadge
        isModified={true}
        consolidatedAt={new Date("2026-03-12T10:00:00Z")}
        opposedAt={null}
      />
    );
    expect(screen.getByTitle(/consolidada/i)).toBeInTheDocument();
  });

  it("no renderiza nada cuando isModified=false", () => {
    const { container } = render(
      <MarcacionModificadaBadge
        isModified={false}
        consolidatedAt={null}
        opposedAt={null}
      />
    );
    expect(container.firstChild).toBeNull();
  });
});
