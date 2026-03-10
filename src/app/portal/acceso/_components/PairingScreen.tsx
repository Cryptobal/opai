"use client";

import { FormEvent, useCallback, useRef, useState } from "react";
import { ShieldCheck, Loader2 } from "lucide-react";

interface PairingScreenProps {
  onPaired: (data: {
    deviceToken: string;
    installationId: string;
    installationName: string;
    installationAddress: string;
  }) => void;
}

function safe(fn: () => string, fallback = "unknown"): string {
  try {
    return fn() ?? fallback;
  } catch {
    return fallback;
  }
}

function generateFingerprint(): string {
  return [
    safe(() => navigator.userAgent),
    safe(() => `${screen.width}x${screen.height}`, "0x0"),
    safe(() => Intl.DateTimeFormat().resolvedOptions().timeZone),
    safe(() => navigator.language),
  ].join("|");
}

export function PairingScreen({ onPaired }: PairingScreenProps) {
  const [code, setCode] = useState<string[]>(["", "", "", "", "", ""]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputRefs = useRef<(HTMLInputElement | null)[]>([]);

  const isComplete = code.every((c) => c !== "");

  const handleChange = useCallback(
    (index: number, value: string) => {
      // Only allow alphanumeric
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

    setError(null);
    setLoading(true);

    const raw = code.join("");
    const fullCode = `${raw.slice(0, 3)}-${raw.slice(3)}`;

    try {
      let result: Record<string, any> | null = null;

      // Try unified endpoint first
      try {
        const unifiedRes = await fetch("/api/devices/pair", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            code: fullCode,
            metadata: {
              userAgent: safe(() => navigator.userAgent),
              screenWidth: safe(() => String(screen.width), "0"),
              screenHeight: safe(() => String(screen.height), "0"),
              screenResolution: safe(() => `${screen.width}x${screen.height}`, "0x0"),
              timezone: safe(() => Intl.DateTimeFormat().resolvedOptions().timeZone),
              language: safe(() => navigator.language),
              deviceFingerprint: generateFingerprint(),
            },
          }),
        });

        if (unifiedRes.ok) {
          const unifiedData = await unifiedRes.json().catch(() => null);
          result = unifiedData?.data ?? unifiedData;
        }
      } catch {
        // Unified endpoint not available, fall through to legacy
      }

      // Fall back to legacy endpoint
      if (!result) {
        const res = await fetch("/api/access-control/pair", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            code: fullCode,
            deviceFingerprint: generateFingerprint(),
            userAgent: safe(() => navigator.userAgent),
            screenResolution: safe(() => `${screen.width}x${screen.height}`, "0x0"),
          }),
        });

        const data = await res.json().catch(() => null);

        if (!res.ok) {
          throw new Error(
            data?.error ?? "Código inválido o expirado. Verifica e intenta de nuevo."
          );
        }

        result = data?.data ?? data;
      }

      onPaired({
        deviceToken: result!.deviceToken,
        installationId: result!.installationId,
        installationName: result!.installationName,
        installationAddress: result!.installationAddress ?? "",
      });
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Error al vincular. Intenta de nuevo."
      );
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
        <h1 className="mt-5 text-2xl font-bold text-white">Control de Acceso</h1>
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

      <p className="mt-8 text-xs text-gray-600">
        Si no tienes el código, contacta a tu supervisor.
      </p>
    </div>
  );
}
