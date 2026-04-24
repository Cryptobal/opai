"use client";

interface Props {
  totalItems: number;
  estimatedMinutes: number;
  primaryColor: string;
  onContinue: () => void;
}

export default function PsychInstructions({
  totalItems,
  estimatedMinutes,
  primaryColor,
  onContinue,
}: Props) {
  return (
    <div className="max-w-lg mx-auto bg-white rounded-2xl shadow-sm p-6 md:p-8">
      <h2 className="text-xl font-semibold text-slate-900 mb-3">
        Antes de empezar
      </h2>
      <ul className="text-sm text-slate-700 space-y-3 mb-6">
        <li>📝 Tendrás {totalItems} preguntas en total.</li>
        <li>⏱ Tómate alrededor de {estimatedMinutes} minutos en total.</li>
        <li>🤔 Lee con calma cada pregunta antes de responder.</li>
        <li>🙅 No puedes retroceder una vez que respondiste.</li>
        <li>🔁 Si cierras la ventana, al volver a abrir el link retomas donde quedaste.</li>
        <li>💬 En las preguntas abiertas, escribe al menos 3 líneas con tus propias palabras.</li>
      </ul>
      <button
        className="w-full rounded-xl py-4 text-white text-base font-medium shadow-sm"
        style={{ background: primaryColor }}
        onClick={onContinue}
      >
        Comenzar test
      </button>
    </div>
  );
}
