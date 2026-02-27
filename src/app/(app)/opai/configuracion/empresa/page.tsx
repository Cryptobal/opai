"use client";

import { PageHeader } from "@/components/opai";
import { EmpresaConfigTabs } from "@/components/configuracion/EmpresaConfigTabs";

export default function EmpresaConfigPage() {
  return (
    <div className="space-y-6 min-w-0">
      <PageHeader
        title="Configuración · Empresa"
        description="Datos de la empresa empleadora. Estos datos se usan como tokens en contratos, finiquitos, cartas de aviso y otros documentos laborales."
        backHref="/opai/configuracion"
        backLabel="Configuración"
      />
      <EmpresaConfigTabs />
    </div>
  );
}
