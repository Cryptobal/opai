import type { Metadata } from "next";
import { getAppVersion, PROVIDER_DISPLAY_NAME } from "@/lib/app-version";

export const metadata: Metadata = {
  title: "Portal de Fiscalización — Dirección del Trabajo",
  description: "Sitio de fiscalización de OPAI para funcionarios de la Dirección del Trabajo.",
  robots: { index: true, follow: true },
};

export default function FiscalizacionDtLayout({ children }: { children: React.ReactNode }) {
  return (
    <div data-portal="fiscalizacion-dt" lang="es">
      <span className="sr-only">
        {PROVIDER_DISPLAY_NAME} v{getAppVersion()}
      </span>
      {children}
    </div>
  );
}
