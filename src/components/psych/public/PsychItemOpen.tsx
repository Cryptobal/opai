"use client";

import type { PublicItem } from "./types";

interface Props {
  item: PublicItem;
  value: string;
  onChange: (v: string) => void;
  minChars: number;
}

export default function PsychItemOpen({
  item,
  value,
  onChange,
  minChars,
}: Props) {
  const missing = Math.max(0, minChars - value.trim().length);
  return (
    <div>
      <p className="text-base md:text-lg text-slate-900 mb-4 leading-relaxed">
        {item.prompt}
      </p>
      <textarea
        value={value}
        onChange={(e) => onChange(e.target.value)}
        rows={6}
        placeholder="Escribe aquí tu respuesta. Detalla qué harías y por qué."
        className="w-full rounded-xl border border-slate-300 px-4 py-3 text-sm md:text-base leading-relaxed focus:border-slate-500 focus:outline-none"
      />
      <p className="mt-2 text-xs text-slate-500">
        {missing > 0
          ? `Te faltan al menos ${missing} caracteres más.`
          : "Listo. Puedes continuar."}
      </p>
    </div>
  );
}
