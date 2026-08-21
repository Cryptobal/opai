import type { Metadata, Viewport } from "next";
import { Archivo } from "next/font/google";
import { ForceLightHtml } from "./ForceLightHtml";
import "./reporte-public.css";

const archivo = Archivo({
  subsets: ["latin"],
  display: "swap",
  variable: "--font-reporte",
  weight: ["400", "500", "600", "700"],
});

export const dynamic = "force-dynamic";

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#f4f6f3",
};

export const metadata: Metadata = {
  title: "Reportar incidente",
  robots: { index: false, follow: false },
};

export default function ReportePublicLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div
      id="reporte-publico"
      className={archivo.variable}
      style={{
        fontFamily: "var(--font-reporte), Archivo, system-ui, sans-serif",
        paddingTop: "var(--safe-area-top, env(safe-area-inset-top, 0px))",
        paddingBottom: "var(--safe-area-bottom, env(safe-area-inset-bottom, 0px))",
        paddingLeft: "var(--safe-area-left, env(safe-area-inset-left, 0px))",
        paddingRight: "var(--safe-area-right, env(safe-area-inset-right, 0px))",
      }}
    >
      <ForceLightHtml />
      {children}
    </div>
  );
}
