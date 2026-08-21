"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

type GpsState =
  | { kind: "idle" }
  | { kind: "checking" }
  | { kind: "ok"; lat: number; lng: number; accuracy: number | null }
  | { kind: "denied" }
  | { kind: "unavailable" }
  | { kind: "out_of_range" };

export function GpsPill({ state, onRetry }: { state: GpsState; onRetry: () => void }) {
  const label =
    state.kind === "checking"
      ? "Verificando…"
      : state.kind === "ok"
        ? "Ubicación verificada · estás en la instalación"
        : state.kind === "denied"
          ? "Activa la ubicación para reportar"
          : state.kind === "out_of_range"
            ? "Debes estar en la instalación para reportar"
            : state.kind === "unavailable"
              ? "No pudimos obtener tu ubicación"
              : "Necesitamos tu ubicación";
  const color =
    state.kind === "ok"
      ? "var(--rp-ok)"
      : state.kind === "checking"
        ? "var(--rp-info)"
        : "var(--rp-warn)";
  return (
    <button
      type="button"
      onClick={state.kind === "ok" || state.kind === "checking" ? undefined : onRetry}
      style={{
        display: "inline-flex",
        alignItems: "center",
        minHeight: 44,
        padding: "8px 14px",
        borderRadius: 999,
        border: `1px solid ${color}33`,
        background: `${color}14`,
        color,
        fontSize: 13,
        fontWeight: 600,
        gap: 8,
        width: "100%",
        justifyContent: "center",
      }}
    >
      <span
        aria-hidden
        style={{
          width: 8,
          height: 8,
          borderRadius: 99,
          background: color,
        }}
      />
      {label}
    </button>
  );
}

export function useGpsFix() {
  const [state, setState] = useState<GpsState>({ kind: "idle" });
  const watchRef = useRef<number | null>(null);

  const request = useCallback(() => {
    if (!navigator.geolocation) {
      setState({ kind: "unavailable" });
      return;
    }
    setState({ kind: "checking" });
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setState({
          kind: "ok",
          lat: pos.coords.latitude,
          lng: pos.coords.longitude,
          accuracy: Number.isFinite(pos.coords.accuracy) ? pos.coords.accuracy : null,
        });
      },
      (err) => {
        if (err.code === err.PERMISSION_DENIED) setState({ kind: "denied" });
        else setState({ kind: "unavailable" });
      },
      { enableHighAccuracy: true, timeout: 12000, maximumAge: 15000 },
    );
  }, []);

  useEffect(() => {
    request();
    return () => {
      if (watchRef.current != null) navigator.geolocation.clearWatch(watchRef.current);
    };
  }, [request]);

  return { state, request, setOutOfRange: () => setState({ kind: "out_of_range" }) };
}

export type { GpsState };
