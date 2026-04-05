"use client";

import { ConfigPageLayout } from "@/components/configuracion/ConfigPageLayout";
import { EmpresaConfigTabs } from "@/components/configuracion/EmpresaConfigTabs";
import { Building } from "lucide-react";

export default function EmpresaConfigPage() {
  return (
    <ConfigPageLayout
      title="Empresa"
      description="Datos de la empresa empleadora. Estos datos se usan como tokens en contratos, finiquitos, cartas de aviso y otros documentos laborales."
      icon={Building}
    >
      <EmpresaConfigTabs />
    </ConfigPageLayout>
  );
}
