import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "OPAI Design System v3 — Playground",
  description: "Visual catalog of OPAI DS v3 primitives.",
  robots: { index: false, follow: false, nocache: true },
};

export default function PlaygroundLayout({ children }: { children: React.ReactNode }) {
  return <div className="min-h-dvh bg-ds-surface-0">{children}</div>;
}
