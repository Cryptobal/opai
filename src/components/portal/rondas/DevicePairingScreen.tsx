"use client";

import { FormEvent, useState, useCallback, useRef } from "react";
import { ShieldCheck, Loader2 } from "lucide-react";
import { collectDeviceMetadata } from "@/lib/device-metadata";
import { DEVICE_TOKEN_KEY } from "@/lib/device-constants";

interface Props {
  onPaired: (data: {
    deviceToken: string;
    installationId: string;
    installationName: string;
  }) => void;
  onLegacyLogin?: () => void;
}

export function DevicePairingScreen({ onPaired, onLegacyLogin }: Props) {
  const [code, setCode] = useState<string[]>(["", "", "", "", "", ""]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const inputRefs = useRef<(HTMLInputElement | null)[]>([]);

  const isComplete = code.every((c) => c !== "");

  const handleChange = useCallback(
    (index: number, value: string) => {
      const char = value.replace(/[^a-zA-Z0-9]/g, "").toUpperCase().slice(-1);
      setCode((prev) => {
        const next = [...prev];
        next[index] = char;
        return next;
      });
      if (char && index < 5) {
        inputRefs.current[index + 1]?.focus();
      }
    },
    []
  );

  const handleKeyDown = useCallback(
    (index: number, e: React.KeyboardEvent<HTMLInputElement>) => {
      if (e.key === "Backspace" && !code[index] && index > 0) {
        inputRefs.current[index - 1]?.focus();
      }
    },
    [code]
  );

  const handlePaste = useCallback((e: React.ClipboardEvent) => {
    e.preventDefault();
    const pasted = e.clipboardData
      .getData("text")
      .replace(/[^a-zA-Z0-9]/g, "")
      .toUpperCase()
      .slice(0, 6);
    if (!pasted) return;
    setCode((prev) => {
      const next = [...prev];
      for (let i = 0; i < pasted.length; i++) {
        next[i] = pasted[i];
      }
      return next;
    });
    const focusIdx = Math.min(pasted.length, 5);
    inputRefs.current[focusIdx]?.focus();
  }, []);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!isComplete) return;

    setError("");
    setLoading(true);

    const raw = code.join("");
    const fullCode = `${raw.slice(0, 3)}-${raw.slice(3)}`;

    try {
      const metadata = await collectDeviceMetadata();

      const res = await fetch("/api/devices/pair", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pairingCode: fullCode.replace(/-/g, ""), metadata }),
      });

      const json = await res.json();

      if (!res.ok || !json.success) {
        setError(json.error || "Código inválido o expirado");
        return;
      }

      const { deviceToken, installationId, installationName } = json.data;
      localStorage.setItem(DEVICE_TOKEN_KEY, deviceToken);
      onPaired({ deviceToken, installationId, installationName });
    } catch {
      setError("Error de conexión. Intenta de nuevo.");
    } finally {
      setLoading(false);
    }
  }

  function renderInput(index: number) {
    return (
      <input
        key={index}
        ref={(el) => {
          inputRefs.current[index] = el;
        }}
        type="text"
        inputMode="text"
        autoCapitalize="characters"
        maxLength={1}
        value={code[index]}
        onChange={(e) => handleChange(index, e.target.value)}
        onKeyDown={(e) => handleKeyDown(index, e)}
        onPaste={index === 0 ? handlePaste : undefined}
        className="w-12 h-14 text-center text-xl font-bold rounded-xl border border-gray-700 bg-gray-900/60 text-white outline-none transition-colors focus:border-cyan-500 focus:ring-1 focus:ring-cyan-500 placeholder-gray-600"
        disabled={loading}
      />
    );
  }

  return (
    <div className="flex min-h-dvh flex-col items-center justify-center bg-[#0A0F1C] px-6">
      {/* Logo area */}
      <div className="mb-8 flex flex-col items-center">
        <div className="flex h-20 w-20 items-center justify-center rounded-2xl bg-gradient-to-br from-cyan-500 to-blue-600 shadow-lg shadow-cyan-500/20">
          <ShieldCheck className="h-10 w-10 text-white" />
        </div>
        <h1 className="mt-5 text-2xl font-bold text-white">Portal de Rondas</h1>
        <p className="mt-1 text-sm text-gray-400">Gard Security</p>
      </div>

      {/* Description */}
      <div className="mb-8 max-w-sm text-center">
        <p className="text-sm text-gray-300">
          Vincula este dispositivo a una instalación para comenzar.
        </p>
        <p className="mt-2 text-xs text-gray-500">
          Ingresa el código de vinculación que encontrarás en OPAI, en la ficha de la instalación.
        </p>
      </div>

      {/* OTP-style input */}
      <form onSubmit={handleSubmit} className="w-full max-w-sm">
        {error && (
          <div className="mb-5 rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-400">
            {error}
          </div>
        )}

        <div className="mb-8 flex items-center justify-center gap-2">
          {renderInput(0)}
          {renderInput(1)}
          {renderInput(2)}
          <span className="mx-1 text-2xl font-bold text-gray-500">–</span>
          {renderInput(3)}
          {renderInput(4)}
          {renderInput(5)}
        </div>

        <button
          type="submit"
          disabled={!isComplete || loading}
          className="flex w-full items-center justify-center gap-2 rounded-xl bg-cyan-500 px-4 py-3.5 text-sm font-semibold text-white transition-colors hover:bg-cyan-400 disabled:opacity-60 disabled:cursor-not-allowed active:bg-cyan-600"
        >
          {loading ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" />
              Vinculando...
            </>
          ) : (
            "VINCULAR DISPOSITIVO"
          )}
        </button>
      </form>

      {onLegacyLogin && (
        <button
          type="button"
          onClick={onLegacyLogin}
          className="mt-6 text-xs text-gray-500 hover:text-gray-300 transition-colors underline underline-offset-2"
        >
          ¿Problemas? Ingresar con RUT + PIN
        </button>
      )}

      <p className="mt-8 text-xs text-gray-600">
        Si no tienes el código, contacta a tu supervisor.
      </p>
    </div>
  );
}
