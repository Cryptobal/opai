"use client";

import { useCallback, useState } from "react";
import { FaceCameraCapture } from "./FaceCameraCapture";

interface FaceRegistrationFlowProps {
  installationId: string;
  onRegistered: () => void;
  onCancel: () => void;
  prefillRut?: string; // Pre-fill RUT from Step 1 lookup
}

type Step = "consent" | "identify" | "capture" | "processing" | "success" | "error";

export function FaceRegistrationFlow({
  installationId,
  onRegistered,
  onCancel,
  prefillRut = "",
}: FaceRegistrationFlowProps) {
  const [step, setStep] = useState<Step>("consent");
  const [rut, setRut] = useState(prefillRut);
  const [pin, setPin] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const handleCapture = useCallback(
    async (imageBase64: string) => {
      setStep("processing");
      setError(null);

      try {
        const res = await fetch("/api/public/marcacion/face-register", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            rut,
            pin,
            image: imageBase64,
            installationId,
          }),
        });

        const data = await res.json();

        if (!res.ok) {
          throw new Error(data.error || "Error al registrar Face ID");
        }

        setStep("success");
        setTimeout(() => onRegistered(), 2000);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Error desconocido");
        setStep("error");
      }
    },
    [rut, pin, installationId, onRegistered]
  );

  function handleIdentifySubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!rut || !pin) return;
    setStep("capture");
  }

  // Step: Biometric consent (Resolucion 38)
  if (step === "consent") {
    return (
      <div className="min-h-dvh flex flex-col items-center justify-center px-4" style={{ background: "#060a13" }}>
        <div className="w-full max-w-md rounded-2xl p-6" style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.08)" }}>
          <h2 className="text-lg font-bold text-white mb-4 text-center">
            Consentimiento para Uso de Datos Biometricos
          </h2>
          <div className="text-sm text-white/60 space-y-3">
            <p>
              OPAI utilizara tecnologia de reconocimiento facial
              exclusivamente para verificar su identidad al momento de registrar
              asistencia laboral.
            </p>
            <p className="font-medium text-white/80">Sus datos biometricos:</p>
            <ul className="list-disc list-inside space-y-1 pl-2">
              <li>Se almacenan de forma encriptada</li>
              <li>Solo se usan para verificacion de identidad en marcacion</li>
              <li>
                Seran eliminados entre 90 y 120 dias despues del termino de su
                relacion laboral
              </li>
              <li>Usted puede revocar este consentimiento en cualquier momento</li>
            </ul>
            <p className="mt-4 text-white/70">
              Acepta el uso de reconocimiento facial para marcacion de asistencia?
            </p>
          </div>
          <button
            onClick={() => setStep("identify")}
            className="w-full rounded-xl px-4 py-3 text-sm font-bold text-white mt-6"
            style={{ background: "rgba(16,185,129,0.4)" }}
          >
            Acepto — Registrar Face ID
          </button>
          <p className="text-sm text-white/25 text-center mt-4 leading-relaxed">
            Si no desea utilizar reconocimiento facial, contacte a su supervisor para coordinar un método alternativo de verificación.
          </p>
        </div>
      </div>
    );
  }

  // Step: Identify with RUT + PIN
  if (step === "identify") {
    return (
      <div className="min-h-dvh flex flex-col items-center justify-center px-4" style={{ background: "#060a13" }}>
        <div className="w-full max-w-md rounded-2xl p-6" style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.08)" }}>
          <h2 className="text-lg font-bold text-white mb-2 text-center">
            Activar Face ID
          </h2>
          <p className="text-sm text-white/50 text-center mb-6">
            Ingresa tu RUT y PIN para verificar tu identidad
          </p>

          <form onSubmit={handleIdentifySubmit} className="space-y-4">
            <div>
              <label className="block text-sm text-white/40 mb-1">RUT</label>
              <input
                type="text"
                value={rut}
                onChange={(e) => setRut(e.target.value)}
                placeholder="12.345.678-9"
                className="w-full rounded-xl px-4 py-3 text-white text-sm placeholder-white/20 outline-none"
                style={{ background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.1)" }}
                inputMode="text"
                autoComplete="off"
              />
            </div>
            <div>
              <label className="block text-sm text-white/40 mb-1">PIN</label>
              <input
                type="password"
                value={pin}
                onChange={(e) => setPin(e.target.value)}
                placeholder="****"
                maxLength={6}
                className="w-full rounded-xl px-4 py-3 text-white text-sm placeholder-white/20 outline-none"
                style={{ background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.1)" }}
                inputMode="numeric"
                autoComplete="off"
              />
            </div>
            <div className="flex gap-3">
              <button
                type="button"
                onClick={onCancel}
                className="flex-1 rounded-xl px-4 py-3 text-sm font-medium text-white/70"
                style={{ background: "rgba(255,255,255,0.06)" }}
              >
                Cancelar
              </button>
              <button
                type="submit"
                disabled={!rut || !pin}
                className="flex-1 rounded-xl px-4 py-3 text-sm font-bold text-white transition-opacity disabled:opacity-40"
                style={{ background: "rgba(16,185,129,0.4)" }}
              >
                Continuar
              </button>
            </div>
          </form>
        </div>
      </div>
    );
  }

  // Step: Capture face
  if (step === "capture") {
    return (
      <div className="min-h-dvh flex flex-col items-center justify-center px-4 py-8" style={{ background: "#060a13" }}>
        <h2 className="text-lg font-bold text-white mb-4 text-center">
          Mira directamente a la camara
        </h2>
        <FaceCameraCapture
          onCapture={handleCapture}
          onCancel={() => setStep("identify")}
        />
      </div>
    );
  }

  // Step: Processing
  if (step === "processing") {
    return (
      <div className="min-h-dvh flex items-center justify-center" style={{ background: "#060a13" }}>
        <div className="text-center">
          <div className="h-12 w-12 mx-auto animate-spin rounded-full border-3 border-white/20 border-t-emerald-400" />
          <p className="mt-4 text-white/70">Registrando Face ID...</p>
        </div>
      </div>
    );
  }

  // Step: Success
  if (step === "success") {
    return (
      <div className="min-h-dvh flex items-center justify-center px-4" style={{ background: "#060a13" }}>
        <div className="w-full max-w-sm rounded-2xl p-6 text-center" style={{ background: "rgba(16,185,129,0.1)", border: "1px solid rgba(16,185,129,0.3)" }}>
          <div className="text-5xl mb-3">{"\u2705"}</div>
          <p className="text-xl font-bold text-white">Face ID activado</p>
          <p className="text-sm text-emerald-400 mt-2">
            Ahora puedes marcar entrada y salida con tu rostro
          </p>
        </div>
      </div>
    );
  }

  // Step: Error
  return (
    <div className="min-h-dvh flex items-center justify-center px-4" style={{ background: "#060a13" }}>
      <div className="w-full max-w-sm rounded-2xl p-6 text-center" style={{ background: "rgba(239,68,68,0.1)", border: "1px solid rgba(239,68,68,0.3)" }}>
        <div className="text-5xl mb-3">{"\u274C"}</div>
        <p className="text-red-400 font-medium">{error || "Error al registrar Face ID"}</p>
        <div className="flex gap-3 mt-4">
          <button
            onClick={onCancel}
            className="flex-1 rounded-xl px-4 py-2 text-sm text-white/70"
            style={{ background: "rgba(255,255,255,0.06)" }}
          >
            Cancelar
          </button>
          <button
            onClick={() => setStep("capture")}
            className="flex-1 rounded-xl px-4 py-2 text-sm font-medium text-white"
            style={{ background: "rgba(16,185,129,0.3)" }}
          >
            Reintentar
          </button>
        </div>
      </div>
    </div>
  );
}
