"use client";

import { useState } from "react";

interface Props {
  url: string;
  expiresAt: string;
  candidateName: string;
  phone: string | null;
  onClose: () => void;
}

export default function PsychShareLinkModal({
  url,
  expiresAt,
  candidateName,
  phone,
  onClose,
}: Props) {
  const [copied, setCopied] = useState(false);

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopied(false);
    }
  }

  const waText = encodeURIComponent(
    `Hola ${candidateName}, te enviamos el test psicolaboral. Ábrelo en tu celular:\n${url}\n(Demora ~25 minutos)`,
  );
  const waUrl = phone
    ? `https://wa.me/${phone.replace(/\D/g, "")}?text=${waText}`
    : `https://wa.me/?text=${waText}`;

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl p-6 max-w-md w-full shadow-xl space-y-4">
        <h3 className="text-lg font-semibold text-slate-900">
          Evaluación creada
        </h3>
        <p className="text-sm text-slate-600">
          Comparte este enlace con {candidateName}. Expira el{" "}
          {new Date(expiresAt).toLocaleDateString("es-CL")}.
        </p>
        <div className="rounded-lg border border-slate-200 bg-slate-50 p-3 text-xs break-all">
          {url}
        </div>
        <div className="flex gap-2">
          <button
            onClick={handleCopy}
            className="flex-1 rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-700"
          >
            {copied ? "✓ Copiado" : "Copiar link"}
          </button>
          <a
            href={waUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="flex-1 text-center rounded-lg bg-emerald-600 text-white px-3 py-2 text-sm"
          >
            Enviar por WhatsApp
          </a>
        </div>
        <button
          onClick={onClose}
          className="w-full rounded-lg bg-slate-900 text-white px-3 py-2 text-sm"
        >
          Listo
        </button>
      </div>
    </div>
  );
}
