import type { Metadata, Viewport } from "next";
import { TerrenoModeSwitcher } from "@/components/portal/TerrenoModeSwitcher";
import { GlassAmbient } from "@/components/opai-ds/GlassAmbient";

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#060a13",
};

export const metadata: Metadata = {
  title: "Incidentes en terreno",
  robots: { index: false, follow: false },
};

export default function PortalIncidentesLayout({ children }: { children: React.ReactNode }) {
  return (
    <div
      className="flex flex-col min-h-dvh bg-background text-foreground"
      style={{
        paddingTop: "var(--safe-area-top)",
        paddingBottom: "var(--safe-area-bottom)",
      }}
    >
      <GlassAmbient />
      <TerrenoModeSwitcher active="incidentes" />
      <div className="flex-1 min-h-0 overflow-y-auto">{children}</div>
    </div>
  );
}
