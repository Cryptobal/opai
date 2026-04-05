import type { ReactNode } from "react";

export const metadata = {
  title: "Portal Guardia Postulante | Opai",
  description: "Encuentra empleo como guardia de seguridad en Chile",
};

export default function PortalPostulanteLayout({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white border-b px-4 py-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="font-bold text-lg">Opai</span>
          <span className="text-sm text-muted-foreground">Portal Postulante</span>
        </div>
      </header>
      <main className="max-w-2xl mx-auto px-4 py-8">{children}</main>
    </div>
  );
}
