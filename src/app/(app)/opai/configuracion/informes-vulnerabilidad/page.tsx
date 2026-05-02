import { ShieldAlert } from "lucide-react";
import { ConfigPageLayout } from "@/components/configuracion/ConfigPageLayout";
import { SectionCatalogEditor } from "@/components/vra/SectionCatalogEditor";

export const dynamic = "force-dynamic";

export default function InformesVulnerabilidadConfigPage() {
  return (
    <ConfigPageLayout
      title="Informes de Vulnerabilidad"
      description="Configura las secciones que aparecerán en los informes generados por IA. Cada informe que se genere quedará automáticamente vinculado al tipo 'Informe de Vulnerabilidad' en Documentos Operacionales de la instalación, y será visible en la pestaña dedicada del detalle de instalación."
      icon={<ShieldAlert className="h-[18px] w-[18px]" />}
    >
      <SectionCatalogEditor />
    </ConfigPageLayout>
  );
}
