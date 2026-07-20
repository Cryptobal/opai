"use client";

type Props = {
  title: string;
  daysLeft: number;
  onClick?: () => void;
};

export function LicAllDayChip({ title, daysLeft, onClick }: Props) {
  const tone =
    daysLeft <= 3
      ? "border-status-danger-border bg-status-danger-soft text-status-danger-fg"
      : daysLeft <= 7
        ? "border-status-warn-border bg-status-warn-soft text-status-warn-fg"
        : "border-ds-border-subtle bg-ds-surface-2 text-ds-text-2";

  return (
    <button
      type="button"
      onClick={onClick}
      className={`w-full rounded-lg border border-dashed px-2 py-1 text-left text-[12px] ds-tap ${tone}`}
    >
      <span className="font-medium">ENTREGA</span>
      <p className="truncate">{title}</p>
      <p className="text-[12px] opacity-80">T-{daysLeft}</p>
    </button>
  );
}
