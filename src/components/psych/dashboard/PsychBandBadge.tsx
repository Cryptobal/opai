"use client";

interface Props {
  band: "FIT" | "FIT_CAUTION" | "NOT_RECOMMENDED" | string | null | undefined;
}

const MAP: Record<string, { label: string; cls: string }> = {
  FIT: {
    label: "Apto",
    cls: "bg-status-ok-soft text-status-ok-fg dark:text-status-ok-fg border-status-ok-border",
  },
  FIT_CAUTION: {
    label: "Con observación",
    cls: "bg-status-warn-soft text-status-warn-fg dark:text-status-warn-fg border-status-warn-border",
  },
  NOT_RECOMMENDED: {
    label: "No recomendado",
    cls: "bg-status-danger-soft text-status-danger-fg dark:text-status-danger-fg border-status-danger-border",
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
