import Link from "next/link";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function SupervisionLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // Tabs de Supervisión en la barra superior (AppShell). La acción "Nueva
  // visita" se preserva como botón suelto sobre el contenido (desktop);
  // migrará a PageToolbar en el sweep de páginas.
  return (
    <div className="space-y-3 min-w-0">
      <div className="hidden lg:flex justify-end">
        <Button asChild size="sm" className="shrink-0 gap-1.5">
          <Link href="/ops/supervision/nueva-visita">
            <Plus className="h-3.5 w-3.5" />
            <span>Nueva visita</span>
          </Link>
        </Button>
      </div>
      {children}
    </div>
  );
}
