"use client";

interface Props {
  band: "FIT" | "FIT_CAUTION" | "NOT_RECOMMENDED" | string | null | undefined;
}

const MAP: Record<string, { label: string; cls: string }> = {
  FIT: { label: "Apto", cls: "bg-emerald-100 text-emerald-900" },
  FIT_CAUTION: {
    label: "Con observación",
    cls: "bg-amber-100 text-amber-900",
  },
  NOT_RECOMMENDED: {
    label: "No recomendado",
    cls: "bg-rose-100 text-rose-900",
  },
};

export default function PsychBandBadge({ band }: Props) {
  if (!band) {
    return (
      <span className="text-xs px-2 py-1 rounded-md bg-slate-100 text-slate-600">
        Pendiente
      </span>
    );
  }
  const meta = MAP[band] ?? { label: band, cls: "bg-slate-100 text-slate-700" };
  return (
    <span className={`text-xs px-2 py-1 rounded-md font-medium ${meta.cls}`}>
      {meta.label}
    </span>
  );
}
