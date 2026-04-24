"use client";

import type { PublicAssessment, PublicBranding, PublicVersion } from "./types";

interface Props {
  assessment: PublicAssessment;
  version: PublicVersion;
  branding: PublicBranding;
  estimatedMinutes: number;
  onContinue: () => void;
}

export default function PsychWelcome({
  assessment,
  version,
  branding,
  estimatedMinutes,
  onContinue,
}: Props) {
  const color = branding.primaryColor ?? "#0f172a";
  return (
    <div className="max-w-lg mx-auto bg-white rounded-2xl shadow-sm p-6 md:p-8">
      {branding.logoUrl ? (
        <img
          src={branding.logoUrl}
          alt="Logo"
          className="h-12 mb-4 object-contain"
        />
      ) : null}
      <h1
        className="text-2xl md:text-3xl font-semibold mb-2"
        style={{ color }}
      >
        Hola {assessment.targetName}
      </h1>
      <p className="text-slate-700 text-base mb-4">
        Te damos la bienvenida al test psicolaboral{" "}
        <span className="font-medium">{version.name}</span>.
      </p>
      <ul className="text-sm text-slate-600 space-y-2 mb-6">
        <li>⏱ Duración estimada: <b>{estimatedMinutes} minutos</b>.</li>
        <li>📱 Puedes responder desde tu celular o computador.</li>
        <li>🔒 Tus respuestas son confidenciales y se usan solo para esta evaluación.</li>
        <li>🧘 No hay respuestas correctas ni incorrectas. Responde con honestidad.</li>
      </ul>
      <button
        className="w-full rounded-xl py-4 text-white text-base font-medium shadow-sm active:scale-[0.99] transition"
        style={{ background: color }}
        onClick={onContinue}
      >
        Empezar
      </button>
    </div>
  );
}
