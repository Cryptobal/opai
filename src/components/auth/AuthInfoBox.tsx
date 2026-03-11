import type { ReactNode } from "react";

interface AuthInfoBoxProps {
  accent: string;
  icon: ReactNode;
  children: ReactNode;
}

export function AuthInfoBox({ accent, icon, children }: AuthInfoBoxProps) {
  return (
    <div
      className="flex items-start gap-2.5 mt-5 p-3 rounded-xl"
      style={{
        background: `${accent}06`,
        border: `1px solid ${accent}10`,
      }}
    >
      <div className="shrink-0 mt-px">{icon}</div>
      <span className="text-xs text-[#6b7280] leading-relaxed">{children}</span>
    </div>
  );
}
