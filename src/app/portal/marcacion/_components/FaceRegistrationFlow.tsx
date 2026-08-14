"use client";

import { useCallback, useState } from "react";
import { FaceCameraCapture } from "./FaceCameraCapture";
import { ResultScreen, XlButton } from "@/components/opai/terreno";

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
      <div className="flex flex-1 flex-col items-center justify-center px-4 py-8">
        <div className="max-h-[calc(100dvh-4rem)] w-full max-w-md overflow-y-auto rounded-2xl border border-ds-border-default bg-ds-surface-1 p-6">
          <h2 className="mb-1 text-center text-lg font-bold text-ds-text-1">
            Consentimiento informado — Face ID
          </h2>
          <p className="mb-5 text-center text-[12px] text-ds-text-3">
            Ley 21.719 de Protección de Datos Personales · v{CONSENT_TEXT_VERSION}
          </p>

          <div className="space-y-3 text-sm leading-relaxed text-ds-text-2">
            <div>
              <p className="font-semibold text-ds-text-1">¿Qué dato se recoge?</p>
              <p>
                Un <span className="text-ds-text-1">template biométrico</span> (representación
                matemática de los rasgos de tu rostro) generado a partir de una fotografía
                que captures en este dispositivo. No se almacena la imagen como dato biométrico,
                solo el template cifrado en el proveedor de reconocimiento.
              </p>
            </div>

            <div>
              <p className="font-semibold text-ds-text-1">¿Con qué finalidad?</p>
              <p>
                Verificar tu identidad al momento de marcar entrada y salida en tu puesto de
                trabajo, para cumplir con el control de asistencia laboral.
              </p>
            </div>

            <div>
              <p className="font-semibold text-ds-text-1">Base legal</p>
              <p>
                Tu <span className="text-ds-text-1">consentimiento libre, informado y específico</span>,
                conforme al Art. 12 de la Ley 21.719. Puedes no aceptar y usar el método
                alternativo de PIN sin ninguna consecuencia laboral.
              </p>
            </div>

            <div>
              <p className="font-semibold text-ds-text-1">Plazo de conservación</p>
              <p>
                Durante toda tu relación laboral con la empresa. Al término del contrato, el
                template biométrico es eliminado de forma automática.
              </p>
            </div>

            <div>
              <p className="font-semibold text-ds-text-1">Derecho a retirar el consentimiento</p>
              <p>
                Puedes <span className="text-ds-text-1">revocar este consentimiento en cualquier momento</span>,
                sin expresar causa, desde el Portal del Guardia en la sección &quot;Mis datos → Derechos ARCO&quot;.
                La revocación detendrá el uso de Face ID inmediatamente y podrás seguir marcando con PIN.
              </p>
            </div>
          </div>

          <label
            className="mt-6 flex cursor-pointer select-none items-start gap-3 rounded-xl border border-ds-border-default bg-ds-surface-2 p-3"
          >
            <input
              type="checkbox"
              checked={consentChecked}
              onChange={(e) => setConsentChecked(e.target.checked)}
              className="mt-0.5 h-5 w-5 shrink-0 accent-primary"
              aria-label="He leído y acepto el consentimiento informado"
            />
            <span className="text-sm text-ds-text-2">
              He leído y acepto el tratamiento de mis datos biométricos en los términos descritos.
            </span>
          </label>

          <div className="mt-5 flex gap-3">
            <XlButton variant="ghost" size="md" className="flex-1" onClick={onCancel}>
              No acepto
            </XlButton>
            <XlButton
              variant="teal"
              size="md"
              className="flex-1"
              disabled={!consentChecked}
              onClick={() => setStep("identify")}
            >
              Acepto y continúo
            </XlButton>
          </div>

          <p className="mt-4 text-center text-[12px] leading-relaxed text-ds-text-3">
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
      <div className="flex flex-1 flex-col items-center justify-center px-4">
        <div className="w-full max-w-md rounded-2xl border border-ds-border-default bg-ds-surface-1 p-6">
          <h2 className="mb-2 text-center text-lg font-bold text-ds-text-1">
            Activar Face ID
          </h2>
          <p className="mb-6 text-center text-sm text-ds-text-3">
            Ingresa tu RUT y PIN para verificar tu identidad
          </p>

          <form onSubmit={handleIdentifySubmit} className="space-y-4">
            <div>
              <label className="mb-1 block text-sm text-ds-text-3">RUT</label>
              <input
                type="text"
                value={rut}
                onChange={(e) => setRut(e.target.value)}
                placeholder="12.345.678-9"
                className="h-12 w-full rounded-xl border border-ds-border-default bg-ds-surface-2 px-4 text-sm text-ds-text-1 outline-none placeholder:text-ds-text-4"
                inputMode="text"
                autoComplete="off"
              />
            </div>
            <div>
              <label className="mb-1 block text-sm text-ds-text-3">PIN</label>
              <input
                type="password"
                value={pin}
                onChange={(e) => setPin(e.target.value)}
                placeholder="****"
                maxLength={6}
                className="h-12 w-full rounded-xl border border-ds-border-default bg-ds-surface-2 px-4 text-sm text-ds-text-1 outline-none placeholder:text-ds-text-4"
                inputMode="numeric"
                autoComplete="off"
              />
            </div>
            <div className="flex gap-3">
              <XlButton type="button" variant="ghost" size="md" className="flex-1" onClick={onCancel}>
                Cancelar
              </XlButton>
              <XlButton type="submit" variant="teal" size="md" className="flex-1" disabled={!rut || !pin}>
                Continuar
              </XlButton>
            </div>
          </form>
        </div>
      </div>
    );
  }

  // Step: Capture face
  if (step === "capture") {
    return (
      <div className="flex flex-1 flex-col items-center justify-center px-4 py-8">
        <h2 className="mb-4 text-center text-lg font-bold text-ds-text-1">
          Mira a la cámara
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
      <div className="flex flex-1 items-center justify-center">
        <div className="text-center">
          <div className="mx-auto h-12 w-12 animate-spin rounded-full border-2 border-ds-border-default border-t-primary" />
          <p className="mt-4 text-ds-text-2">Registrando Face ID...</p>
        </div>
      </div>
    );
  }

  // Step: Success
  if (step === "success") {
    return (
      <ResultScreen
        tone="ok"
        icon={
          <svg xmlns="http://www.w3.org/2000/svg" className="h-12 w-12" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
          </svg>
        }
        title="FACE ID ACTIVADO"
        who="Ahora puedes marcar entrada y salida con tu rostro"
      />
    );
  }

  // Step: Error
  return (
    <ResultScreen
      tone="bad"
      icon={
        <svg xmlns="http://www.w3.org/2000/svg" className="h-12 w-12" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
        </svg>
      }
      title="NO SE PUDO REGISTRAR"
      who={error || "Error al registrar Face ID"}
      footer={
        <div className="flex gap-3">
          <XlButton variant="ghost" size="md" className="flex-1" onClick={onCancel}>
            Cancelar
          </XlButton>
          <XlButton variant="teal" size="md" className="flex-1" onClick={() => setStep("capture")}>
            Reintentar
          </XlButton>
        </div>
      }
    />
  );
}
