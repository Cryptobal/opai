"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Loader2, Lock, X } from "lucide-react";

interface LogoutPinModalProps {
  open: boolean;
  deviceToken: string;
  onConfirm: () => void;
  onCancel: () => void;
}

export function LogoutPinModal({ open, deviceToken, onConfirm, onCancel }: LogoutPinModalProps) {
  const [pin, setPin] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const submittingRef = useRef(false);

  const reset = useCallback(() => {
    setPin("");
    setError("");
    setLoading(false);
    submittingRef.current = false;
  }, []);

  useEffect(() => {
    if (!open) return;
    reset();
    const id = window.setTimeout(() => inputRef.current?.focus(), 50);
    return () => window.clearTimeout(id);
  }, [open, reset]);

  const handleCancel = useCallback(() => {
    reset();
    onCancel();
  }, [reset, onCancel]);

  const handleSubmit = useCallback(async (value: string) => {
    const fullPin = value.replace(/[^0-9]/g, "").slice(0, 4);
    if (fullPin.length !== 4 || submittingRef.current) return;

    submittingRef.current = true;
    setLoading(true);
    setError("");

    try {
      const res = await fetch("/api/portal/validate-logout-pin", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ deviceToken, pin: fullPin }),
      });
      const data = await res.json().catch(() => null);

      if (data?.success) {
        reset();
        onConfirm();
        return;
      }

      const code = data?.code as string | undefined;
      let msg: string;
      switch (code) {
        case "DEVICE_NOT_FOUND":
          msg = "Dispositivo no reconocido. Contacta a tu supervisor.";
          break;
        case "MISSING_FIELDS":
          msg = "Faltan datos. Intenta de nuevo.";
          break;
        case "SERVER_ERROR":
          msg = "Error del servidor. Intenta de nuevo en unos segundos.";
          break;
        case "PIN_NOT_CONFIGURED":
          msg = data?.error
            || "Este equipo no tiene el PIN de empresa. Prueba 0000 o vuelve a vincular el dispositivo.";
          break;
        case "PIN_MISMATCH":
          msg = "PIN incorrecto";
          break;
        default:
          msg = data?.error || "PIN incorrecto";
      }
      setError(msg);
      setPin("");
      inputRef.current?.focus();
    } catch {
      setError("Error de conexión");
    } finally {
      setLoading(false);
      submittingRef.current = false;
    }
  }, [deviceToken, onConfirm, reset]);

  const handleChange = useCallback((value: string) => {
    const next = value.replace(/[^0-9]/g, "").slice(0, 4);
    setPin(next);
    setError("");
    if (next.length === 4) {
      void handleSubmit(next);
    }
  }, [handleSubmit]);

  if (!open) return null;

  const isComplete = pin.length === 4;

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/70 backdrop-blur-sm px-6">
      <div className="w-full max-w-xs rounded-2xl bg-card opai-glass-strong-m border border-border p-6 shadow-2xl">
        <div className="flex items-center justify-between mb-5">
          <div className="flex items-center gap-2">
            <Lock className="h-5 w-5 text-status-info-fg" />
            <h2 className="text-base font-semibold text-foreground">PIN de seguridad</h2>
          </div>
          <button
            type="button"
            onClick={handleCancel}
            className="rounded-lg p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground transition-colors min-h-11 min-w-11 inline-flex items-center justify-center"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <p className="text-xs text-muted-foreground mb-5">
          Ingresa el PIN para cerrar sesión en este dispositivo.
        </p>

        {error && (
          <div className="mb-4 rounded-lg border border-status-danger-border bg-status-danger-soft px-3 py-2 text-xs text-status-danger-fg">
            {error}
          </div>
        )}

        <form
          className="mb-6"
          onSubmit={(e) => {
            e.preventDefault();
            void handleSubmit(pin);
          }}
        >
          <input
            ref={inputRef}
            type="text"
            inputMode="numeric"
            autoComplete="one-time-code"
            pattern="[0-9]*"
            maxLength={4}
            value={pin}
            onChange={(e) => handleChange(e.target.value)}
            disabled={loading}
            autoFocus
            aria-label="PIN de 4 dígitos"
            className="w-full h-14 text-center text-xl font-bold tracking-[0.4em] rounded-xl border border-border bg-muted text-foreground outline-none transition-colors focus:border-status-info-border focus:ring-1 focus:ring-status-info-border"
          />
        </form>

        <div className="flex gap-2">
          <button
            type="button"
            onClick={handleCancel}
            disabled={loading}
            className="flex-1 rounded-xl border border-border px-4 py-3 text-sm font-medium text-muted-foreground transition-colors hover:bg-muted disabled:opacity-50 min-h-11"
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={() => void handleSubmit(pin)}
            disabled={!isComplete || loading}
            className="flex-1 flex items-center justify-center gap-2 rounded-xl bg-status-info px-4 py-3 text-sm font-semibold text-white transition-colors hover:brightness-110 disabled:opacity-50 disabled:cursor-not-allowed min-h-11"
          >
            {loading ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              "Confirmar"
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
