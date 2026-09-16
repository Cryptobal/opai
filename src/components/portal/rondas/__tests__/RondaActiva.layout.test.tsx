/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { act, fireEvent, render, screen } from "@testing-library/react";
import type { RondaData } from "../RondaActiva";
import type { RondasSession } from "../RondasPortalClient";

vi.mock("next/dynamic", () => ({
  default: () => {
    function MockRondaMap() {
      return <div data-testid="ronda-map-stub">mapa</div>;
    }
    return MockRondaMap;
  },
}));

vi.mock("../useRondaTracking", () => ({
  useRondaTracking: () => undefined,
}));

import { RondaActiva } from "../RondaActiva";

const session: RondasSession = {
  guardiaId: "g1",
  tenantId: "t1",
  installationId: "i1",
  nombre: "Guardia Test",
  installationName: "Instalación",
  authenticatedAt: "2026-09-16T12:00:00.000Z",
};

function makeRonda(overrides: Partial<RondaData> = {}): RondaData {
  return {
    ejecucionId: "ej-1",
    templateId: "tpl-1",
    templateName: "Ronda Norte",
    status: "IN_PROGRESS",
    scheduledAt: "2026-09-16T12:00:00.000Z",
    startedAt: "2026-09-16T12:00:00.000Z",
    checkpointsTotal: 2,
    checkpointsCompletados: 0,
    qrRequerido: false,
    orderMode: "FREE",
    estimatedDurationMin: 30,
    frecuenciaMinutos: null,
    nextRoundAt: null,
    checkpoints: [
      {
        id: "cp-1",
        name: "ESTACIONAMIENTO",
        qrCode: null,
        lat: -33.4,
        lng: -70.6,
        geoRadiusM: 30,
        verificationType: "GEOFENCE",
        orderIndex: 0,
        isRequired: true,
        completed: false,
      },
      {
        id: "cp-2",
        name: "ACCESO",
        qrCode: null,
        lat: -33.41,
        lng: -70.61,
        geoRadiusM: 30,
        verificationType: "GEOFENCE",
        orderIndex: 1,
        isRequired: false,
        completed: false,
      },
    ],
    ...overrides,
  };
}

function setViewportHeight(height: number) {
  Object.defineProperty(window, "innerHeight", {
    configurable: true,
    writable: true,
    value: height,
  });
}

describe("RondaActiva layout", () => {
  beforeEach(() => {
    setViewportHeight(800);
  });

  afterEach(() => {
    setViewportHeight(768);
  });

  it("mantiene header y oculta card, chips y finalizar al ampliar el mapa", () => {
    const onBack = vi.fn();
    render(
      <RondaActiva
        session={session}
        rondaData={makeRonda()}
        onComplete={vi.fn()}
        onBack={onBack}
      />,
    );

    expect(screen.getByRole("heading", { name: "Ronda Norte" })).toBeInTheDocument();
    expect(screen.getByText("Siguiente checkpoint")).toBeInTheDocument();
    expect(screen.getByTestId("ronda-chips-list")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Finalizar ronda" })).toBeInTheDocument();

    const mapPane = screen.getByTestId("ronda-activa-map-pane");
    expect(mapPane.className).toContain("min-h-[220px]");
    expect(mapPane).toHaveAttribute("data-expanded", "false");

    fireEvent.click(screen.getByRole("button", { name: "Ampliar mapa" }));

    expect(screen.getByRole("heading", { name: "Ronda Norte" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Volver" })).toBeInTheDocument();
    expect(screen.queryByText("Siguiente checkpoint")).toBeNull();
    expect(screen.queryByTestId("ronda-chips-list")).toBeNull();
    expect(screen.queryByRole("button", { name: "Finalizar ronda" })).toBeNull();
    expect(screen.getByTestId("ronda-activa-map-pane")).toHaveAttribute(
      "data-expanded",
      "true",
    );
    expect(onBack).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: "Reducir mapa" }));

    expect(screen.getByText("Siguiente checkpoint")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Finalizar ronda" })).toBeInTheDocument();
    expect(screen.getByTestId("ronda-activa-map-pane")).toHaveAttribute(
      "data-expanded",
      "false",
    );
  });

  it("Volver y Escape reducen el mapa sin salir de la ronda", () => {
    const onBack = vi.fn();
    render(
      <RondaActiva
        session={session}
        rondaData={makeRonda()}
        onComplete={vi.fn()}
        onBack={onBack}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Ampliar mapa" }));
    expect(screen.queryByText("Siguiente checkpoint")).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "Volver" }));
    expect(onBack).not.toHaveBeenCalled();
    expect(screen.getByText("Siguiente checkpoint")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Ampliar mapa" }));
    act(() => {
      window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
    });
    expect(screen.getByText("Siguiente checkpoint")).toBeInTheDocument();
    expect(onBack).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: "Volver" }));
    expect(onBack).toHaveBeenCalledTimes(1);
  });

  it("colapsa los chips a una barra compacta si el viewport es bajo", () => {
    setViewportHeight(640);
    render(
      <RondaActiva
        session={session}
        rondaData={makeRonda()}
        onComplete={vi.fn()}
        onBack={vi.fn()}
      />,
    );

    expect(screen.queryByTestId("ronda-chips-list")).toBeNull();
    const compact = screen.getByTestId("ronda-chips-compact");
    expect(compact.className).toContain("h-7");
    expect(compact).toHaveTextContent("0/2");
    expect(compact).toHaveTextContent("ESTACIONAMIENTO");
  });

  it("en ronda ad-hoc oculta el panel inferior al ampliar", () => {
    render(
      <RondaActiva
        session={session}
        rondaData={makeRonda({
          templateId: "",
          templateName: "Ronda Libre",
          checkpoints: [],
          checkpointsTotal: 0,
        })}
        onComplete={vi.fn()}
        onBack={vi.fn()}
      />,
    );

    expect(screen.getByRole("button", { name: "Marcar GPS" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Ampliar mapa" }));
    expect(screen.queryByRole("button", { name: "Marcar GPS" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Marcar QR" })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Reducir mapa" }));
    expect(screen.getByRole("button", { name: "Marcar GPS" })).toBeInTheDocument();
  });
});
