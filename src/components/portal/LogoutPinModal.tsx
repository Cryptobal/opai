"use client";

import { useCallback, useRef, useState } from "react";
import { Loader2, Lock, X } from "lucide-react";

interface LogoutPinModalProps {
  open: boolean;
  deviceToken: string;
  onConfirm: () => void;
  onCancel: () => void;
}

export function LogoutPinModal({ open, deviceToken, onConfirm, onCancel }: LogoutPinModalProps) {
  const [pin, setPin] = useState<string[]>(["", "", "", ""]);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const inputRefs = useRef<(HTMLInputElement | null)[]>([]);

  const reset = useCallback(() => {
    setPin(["", "", "", ""]);
    setError("");
    setLoading(false);
  }, []);

  const handleCancel = useCallback(() => {
    reset();
    onCancel();
  }, [reset, onCancel]);

  const handleChange = useCallback((index: number, value: string) => {
    const digit = value.replace(/[^0-9]/g, "").slice(-1);
    setPin((prev) => {
      const next = [...prev];
      next[index] = digit;
      return next;
    });
    setError("");
    if (digit && index < 3) {
      inputRefs.current[index + 1]?.focus();
    }
  }, []);

  const handleKeyDown = useCallback(
    (index: number, e: React.KeyboardEvent<HTMLInputElement>) => {
      if (e.key === "Backspace" && !pin[index] && index > 0) {
        inputRefs.current[index - 1]?.focus();
      }
    },
    [pin],
  );

  const handleSubmit = useCallback(async () => {
    const fullPin = pin.join("");
    if (fullPin.length !== 4) return;

    setLoading(true);
    setError("");

    try {
      const res = await fetch("/api/portal/validate-logout-pin", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ deviceToken, pin: fullPin }),
      });
      const data = await res.json();

      if (data.success) {
        reset();
        onConfirm();
      } else {
        setError("PIN incorrecto");
        setPin(["", "", "", ""]);
        inputRefs.current[0]?.focus();
      }
    } catch {
      setError("Error de conexión");
    } finally {
      setLoading(false);
    }
  }, [pin, deviceToken, onConfirm, reset]);

  if (!open) return null;

  const isComplete = pin.every((d) => d !== "");

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/70 backdrop-blur-sm px-6">
      <div className="w-full max-w-xs rounded-2xl border border-zinc-800 bg-[#0A0F1C] p-6 shadow-2xl">
        <div className="flex items-center justify-between mb-5">
          <div className="flex items-center gap-2">
            <Lock className="h-5 w-5 text-status-info-fg" />
            <h2 className="text-base font-semibold text-white">PIN de seguridad</h2>
          </div>
          <button
            type="button"
            onClick={handleCancel}
            className="rounded-lg p-1.5 text-zinc-500 hover:bg-zinc-800 hover:text-zinc-300 transition-colors"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <p className="text-xs text-zinc-400 mb-5">
          Ingresa el PIN para cerrar sesión en este dispositivo.
        </p>

        {error && (
          <div className="mb-4 rounded-lg border border-status-danger-border bg-status-danger-soft px-3 py-2 text-xs text-status-danger-fg">
            {error}
          </div>
        )}

        <div className="flex items-center justify-center gap-3 mb-6">
          {[0, 1, 2, 3].map((i) => (
            <input
              key={i}
              ref={(el) => { inputRefs.current[i] = el; }}
              type="password"
              inputMode="numeric"
              maxLength={1}
              value={pin[i]}
              onChange={(e) => handleChange(i, e.target.value)}
              onKeyDown={(e) => handleKeyDown(i, e)}
              disabled={loading}
              autoFocus={i === 0}
              className="w-12 h-14 text-center text-xl font-bold rounded-xl border border-zinc-700 bg-zinc-900/60 text-white outline-none transition-colors focus:border-cyan-500 focus:ring-1 focus:ring-cyan-500"
            />
          ))}
        </div>

        <div className="flex gap-2">
          <button
            type="button"
            onClick={handleCancel}
            disabled={loading}
            className="flex-1 rounded-xl border border-zinc-700 px-4 py-3 text-sm font-medium text-zinc-400 transition-colors hover:bg-zinc-800 disabled:opacity-50"
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={handleSubmit}
            disabled={!isComplete || loading}
            className="flex-1 flex items-center justify-center gap-2 rounded-xl bg-cyan-500 px-4 py-3 text-sm font-semibold text-white transition-colors hover:bg-cyan-400 disabled:opacity-50 disabled:cursor-not-allowed"
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
