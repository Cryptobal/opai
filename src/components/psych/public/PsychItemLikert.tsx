"use client";

import type { PublicItem } from "./types";

interface Props {
  item: PublicItem;
  selected: number | null;
  onSelect: (v: number) => void;
  primaryColor: string;
}

export default function PsychItemLikert({
  item,
  selected,
  onSelect,
  primaryColor,
}: Props) {
  const options = (item.options ?? []) as Array<{ value: number; label: string }>;
  return (
    <div>
      <p className="text-base md:text-lg text-slate-900 mb-5 leading-relaxed">
        {item.prompt}
      </p>
      <div className="space-y-2">
        {options.map((opt) => {
          const active = selected === opt.value;
          return (
            <button
              key={opt.value}
              type="button"
              onClick={() => onSelect(opt.value)}
              className={`w-full text-left px-4 py-4 rounded-xl border text-sm md:text-base transition ${
                active
                  ? "border-transparent text-white shadow-sm"
                  : "border-slate-200 bg-white text-slate-800 hover:border-slate-300"
              }`}
              style={active ? { background: primaryColor } : undefined}
            >
              {opt.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}
