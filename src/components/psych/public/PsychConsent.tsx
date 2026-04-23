"use client";

import { useState } from "react";

interface Props {
  onAccept: () => Promise<void> | void;
  primaryColor: string;
}

export default function PsychConsent({ onAccept, primaryColor }: Props) {
  const [accepted, setAccepted] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  async function handleAccept() {
    if (!accepted) return;
    setSubmitting(true);
    try {
      await onAccept();
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="max-w-lg mx-auto bg-white rounded-2xl shadow-sm p-6 md:p-8">
      <h2 className="text-xl font-semibold text-slate-900 mb-3">
        Consentimiento informado
      </h2>
      <div className="text-sm text-slate-700 space-y-3 mb-5">
        <p>
          Esta evaluación forma parte del proceso de selección de personal de
          seguridad privada, y es utilizada como herramienta de apoyo por el
          área de Recursos Humanos.
        </p>
        <p>
          <b>Finalidad:</b> apoyar la decisión de postulación al cargo.
          <br />
          <b>Responsable:</b> la empresa que te envió este enlace.
          <br />
          <b>Base legal:</b> Ley 21.719 sobre Protección de Datos Personales.
          <br />
          <b>Derechos ARCO:</b> puedes acceder, rectificar, cancelar u oponerte
          al tratamiento de tus datos contactando a la empresa.
        </p>
        <p>
          Los resultados son confidenciales y se guardan únicamente para los
          fines de esta evaluación.
        </p>
      </div>
      <label className="flex items-start gap-3 text-sm text-slate-800 mb-5">
        <input
          type="checkbox"
          checked={accepted}
          onChange={(e) => setAccepted(e.target.checked)}
          className="mt-0.5 size-5 accent-slate-900"
        />
        <span>
          He leído y acepto el uso de mis respuestas para esta evaluación.
        </span>
      </label>
      <button
        className="w-full rounded-xl py-4 text-white text-base font-medium shadow-sm disabled:opacity-50 transition"
        style={{ background: primaryColor }}
        onClick={handleAccept}
        disabled={!accepted || submitting}
      >
        {submitting ? "Registrando..." : "Aceptar y continuar"}
      </button>
    </div>
  );
}
