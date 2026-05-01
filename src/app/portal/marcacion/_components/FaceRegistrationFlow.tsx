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

// Versión del texto legal de consentimiento informado (Ley 21.719).
// Incrementar si cambia el texto — queda registrado en audit logs.
const CONSENT_TEXT_VERSION = "1.0";

export function FaceRegistrationFlow({
  installationId,
  onRegistered,
  onCancel,
  prefillRut = "",
}: FaceRegistrationFlowProps) {
  const [step, setStep] = useState<Step>("consent");
  const [rut, setRut] = useState(prefillRut);
  const [pin, setPin] = useState("");
  const [consentChecked, setConsentChecked] = useState(false);
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
            consentTextVersion: CONSENT_TEXT_VERSION,
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

  // Step: Biometric consent — Consentimiento informado Ley 21.719
  if (step === "consent") {
    return (
      <div className="min-h-dvh flex flex-col items-center justify-center px-4 py-8" style={{ background: "#060a13" }}>
        <div
          className="w-full max-w-md rounded-2xl p-6 overflow-y-auto"
          style={{
            background: "rgba(255,255,255,0.03)",
            border: "1px solid rgba(255,255,255,0.08)",
            maxHeight: "calc(100dvh - 4rem)",
          }}
        >
          <h2 className="text-lg font-bold text-white mb-1 text-center">
            Consentimiento informado — Face ID
          </h2>
          <p className="text-xs text-white/40 text-center mb-5">
            Ley 21.719 de Protección de Datos Personales · v{CONSENT_TEXT_VERSION}
          </p>

          <div className="text-sm text-white/70 space-y-3 leading-relaxed">
            <div>
              <p className="font-semibold text-white/90">¿Qué dato se recoge?</p>
              <p>
                Un <span className="text-white/90">template biométrico</span> (representación
                matemática de los rasgos de tu rostro) generado a partir de una fotografía
                que captures en este dispositivo. No se almacena la imagen como dato biométrico,
                solo el template cifrado en el proveedor de reconocimiento.
              </p>
            </div>

            <div>
              <p className="font-semibold text-white/90">¿Con qué finalidad?</p>
              <p>
                Verificar tu identidad al momento de marcar entrada y salida en tu puesto de
                trabajo, para cumplir con el control de asistencia laboral.
              </p>
            </div>

            <div>
              <p className="font-semibold text-white/90">Base legal</p>
              <p>
                Tu <span className="text-white/90">consentimiento libre, informado y específico</span>,
                conforme al Art. 12 de la Ley 21.719. Puedes no aceptar y usar el método
                alternativo de PIN sin ninguna consecuencia laboral.
              </p>
            </div>

            <div>
              <p className="font-semibold text-white/90">Plazo de conservación</p>
              <p>
                Durante toda tu relación laboral con la empresa. Al término del contrato, el
                template biométrico es eliminado de forma automática.
              </p>
            </div>

            <div>
              <p className="font-semibold text-white/90">Derecho a retirar el consentimiento</p>
              <p>
                Puedes <span className="text-white/90">revocar este consentimiento en cualquier momento</span>,
                sin expresar causa, desde el Portal del Guardia en la sección "Mis datos → Derechos ARCO".
                La revocación detendrá el uso de Face ID inmediatamente y podrás seguir marcando con PIN.
              </p>
            </div>
          </div>

          <label
            className="flex items-start gap-3 mt-6 p-3 rounded-xl cursor-pointer select-none"
            style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)" }}
          >
            <input
              type="checkbox"
              checked={consentChecked}
              onChange={(e) => setConsentChecked(e.target.checked)}
              className="mt-0.5 h-5 w-5 shrink-0 accent-emerald-500"
              aria-label="He leído y acepto el consentimiento informado"
            />
            <span className="text-sm text-white/80">
              He leído y acepto el tratamiento de mis datos biométricos en los términos descritos.
            </span>
          </label>

          <div className="flex gap-3 mt-5">
            <button
              type="button"
              onClick={onCancel}
              className="flex-1 rounded-xl px-4 py-3 text-sm font-medium text-white/70"
              style={{ background: "rgba(255,255,255,0.06)" }}
            >
              No acepto
            </button>
            <button
              type="button"
              disabled={!consentChecked}
              onClick={() => setStep("identify")}
              className="flex-1 rounded-xl px-4 py-3 text-sm font-bold text-white transition-opacity disabled:opacity-40 disabled:cursor-not-allowed"
              style={{ background: "rgba(16,185,129,0.4)" }}
            >
              Acepto y continúo
            </button>
          </div>

          <p className="text-xs text-white/30 text-center mt-4 leading-relaxed">
            Si no deseas utilizar reconocimiento facial, puedes seguir marcando con tu PIN
            sin ninguna consecuencia laboral.
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
          <p className="text-sm text-status-ok-fg mt-2">
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
        <p className="text-status-danger-fg font-medium">{error || "Error al registrar Face ID"}</p>
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
