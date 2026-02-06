import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Gard Security - Presentación Comercial",
  description: "Presentación comercial interactiva de Gard Security",
};

/**
 * Layout para rutas de templates y presentaciones (Template UI)
 * 
 * Aplica a:
 * - /p/[id] - Presentaciones públicas
 * - /templates/* - Previews de templates
 * - /preview/* - Preview de emails
 * 
 * Características:
 * - SIN AppShell (no sidebar, no topbar)
 * - Estilos aislados (template-ui-scope)
 * - No contamina con estilos del dashboard
 * - Permite glassmorphism, gradients, etc.
 */
export default function TemplatesLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <div className="template-ui-scope">
      {children}
    </div>
  );
}
