"use client";

import type { PublicItem } from "./types";

interface Props {
  item: PublicItem;
  selected: string | null;
  onSelect: (v: string) => void;
  primaryColor: string;
}

/**
 * Render compartido para SJT y COGNITIVE (ambos son 4 alternativas single-choice).
 */
export default function PsychItemChoice({
  item,
  selected,
  onSelect,
  primaryColor,
}: Props) {
  const options = (item.options ?? []) as Array<{ value: string; label: string }>;
  return (
    <div>
      <p className="text-base md:text-lg text-slate-900 mb-5 leading-relaxed">
        {item.prompt}
      </p>
      <div className="space-y-3">
        {options.map((opt) => {
          const active = selected === opt.value;
          return (
            <button
              key={opt.value}
              type="button"
              onClick={() => onSelect(opt.value)}
              className={`w-full text-left px-4 py-4 rounded-xl border text-sm md:text-base leading-relaxed transition ${
                active
                  ? "border-transparent text-white shadow-sm"
                  : "border-slate-200 bg-white text-slate-800 hover:border-slate-300"
              }`}
              style={active ? { background: primaryColor } : undefined}
            >
              <span className="font-semibold mr-2">{opt.value}.</span>
              {opt.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}
