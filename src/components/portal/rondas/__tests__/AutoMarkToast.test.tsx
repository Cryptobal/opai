/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { act, render, screen } from "@testing-library/react";
import {
  AutoMarkToast,
  shouldAutoDismissAutoMarkToast,
} from "../AutoMarkToast";

describe("shouldAutoDismissAutoMarkToast", () => {
  it("permite auto-cierre cuando la geo está verificada", () => {
    expect(shouldAutoDismissAutoMarkToast(false)).toBe(true);
    expect(shouldAutoDismissAutoMarkToast(undefined)).toBe(true);
  });

  it("bloquea auto-cierre cuando geoNoVerificada es true", () => {
    expect(shouldAutoDismissAutoMarkToast(true)).toBe(false);
  });
});

describe("AutoMarkToast", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("se cierra solo a los 8s cuando geoNoVerificada es false", () => {
    const onDismiss = vi.fn();
    render(
      <AutoMarkToast
        checkpointName="ESTACIONAMIENTO"
        onAddPhoto={vi.fn()}
        onDismiss={onDismiss}
      />,
    );

    expect(screen.getByText("ESTACIONAMIENTO marcado")).toBeInTheDocument();
    expect(screen.getByTestId("automark-toast-progress")).toBeInTheDocument();

    act(() => {
      vi.advanceTimersByTime(7999);
    });
    expect(onDismiss).not.toHaveBeenCalled();

    act(() => {
      vi.advanceTimersByTime(1);
    });
    expect(onDismiss).toHaveBeenCalledTimes(1);
  });

  it("no se auto-cierra cuando geoNoVerificada es true", () => {
    const onDismiss = vi.fn();
    render(
      <AutoMarkToast
        checkpointName="ESTACIONAMIENTO"
        geoNoVerificada
        onAddPhoto={vi.fn()}
        onDismiss={onDismiss}
      />,
    );

    expect(
      screen.getByText("ESTACIONAMIENTO — ubicación sin confirmar"),
    ).toBeInTheDocument();
    expect(screen.queryByTestId("automark-toast-progress")).toBeNull();

    act(() => {
      vi.advanceTimersByTime(20_000);
    });
    expect(onDismiss).not.toHaveBeenCalled();
  });

  it("reinicia el temporizador si cambia el checkpoint", () => {
    const onDismiss = vi.fn();
    const { rerender } = render(
      <AutoMarkToast
        checkpointName="ESTACIONAMIENTO"
        onAddPhoto={vi.fn()}
        onDismiss={onDismiss}
      />,
    );

    act(() => {
      vi.advanceTimersByTime(5000);
    });

    rerender(
      <AutoMarkToast
        checkpointName="ACCESO"
        onAddPhoto={vi.fn()}
        onDismiss={onDismiss}
      />,
    );

    act(() => {
      vi.advanceTimersByTime(5000);
    });
    expect(onDismiss).not.toHaveBeenCalled();

    act(() => {
      vi.advanceTimersByTime(3000);
    });
    expect(onDismiss).toHaveBeenCalledTimes(1);
  });
});
