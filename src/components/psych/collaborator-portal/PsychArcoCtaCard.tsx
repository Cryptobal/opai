"use client";

interface Props {
  arcoRequestUrl: string;
}

export default function PsychArcoCtaCard({ arcoRequestUrl }: Props) {
  return (
    <div className="rounded-2xl border border-slate-700 bg-slate-800/50 p-4 text-sm text-slate-200">
      <h4 className="font-medium mb-1">¿Querés ver tu informe completo?</h4>
      <p className="text-slate-400 mb-3 text-xs leading-relaxed">
        Por Ley 21.719 tienes derecho a acceder a tus datos personales. Puedes
        solicitar el informe completo a través del proceso ARCO.
      </p>
      <a
        href={arcoRequestUrl}
        className="inline-block rounded-lg bg-slate-100 text-slate-900 px-3 py-2 text-xs font-medium"
      >
        Solicitar informe ARCO
      </a>
    </div>
  );
}
