import { type LucideIcon, Inbox } from "lucide-react";

interface Props {
  icon?: LucideIcon;
  title: string;
  description?: string;
}

export function EmptyReport({ icon: Icon = Inbox, title, description }: Props) {
  return (
    <div
      className="rounded-xl border bg-ds-surface p-10 flex flex-col items-center justify-center text-center"
      style={{ borderColor: "var(--ds-border)" }}
    >
      <div
        className="w-12 h-12 rounded-full flex items-center justify-center mb-3"
        style={{ background: "var(--ds-bg-2)" }}
      >
        <Icon className="w-5 h-5 text-ds-text-3" />
      </div>
      <h3 className="text-[14px] font-semibold text-ds-text-1" style={{ fontFamily: "var(--font-display)" }}>
        {title}
      </h3>
      {description && (
        <p className="text-[12px] text-ds-text-3 mt-1 max-w-md">{description}</p>
      )}
    </div>
  );
}
