"use client";

interface Props {
  band: "FIT" | "FIT_CAUTION" | "NOT_RECOMMENDED" | string | null | undefined;
}

const MAP: Record<string, { label: string; cls: string }> = {
  FIT: {
    label: "Apto",
    cls: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20",
  },
  FIT_CAUTION: {
    label: "Con observación",
    cls: "bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20",
  },
  NOT_RECOMMENDED: {
    label: "No recomendado",
    cls: "bg-red-500/10 text-red-600 dark:text-red-400 border-red-500/20",
  },
};

export default function PsychBandBadge({ band }: Props) {
  if (!band) {
    return (
      <span className="text-xs px-2 py-1 rounded-md bg-muted text-muted-foreground border border-border">
        Pendiente
      </span>
    );
  }
  const meta = MAP[band] ?? {
    label: band,
    cls: "bg-muted text-muted-foreground border-border",
  };
  return (
    <span
      className={`text-xs px-2 py-1 rounded-md font-medium border ${meta.cls}`}
    >
      {meta.label}
    </span>
  );
}
