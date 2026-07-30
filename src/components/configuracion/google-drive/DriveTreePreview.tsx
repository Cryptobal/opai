"use client";

type Props = { config: Record<string, boolean> };

export function DriveTreePreview({ config }: Props) {
  const lines: string[] = ["Opai/"];
  if (config.cotizacion || config.factura || config.personas) {
    lines.push("  Clientes/{Cuenta}/{Instalación}/");
    if (config.cotizacion) lines.push("    Cotizaciones/");
    if (config.factura) lines.push("    Facturas/");
    lines.push("    Documentos/");
    if (config.personas) lines.push("  Clientes/{Cuenta}/Personas/{Contacto}/");
  }
  if (config.negocios) {
    lines.push("  Negocios/{Año}/{NombreDeal}/");
  }
  if (config.licitacion) {
    lines.push("  Licitaciones/{Año}/{NombreDeal}/");
  }
  // TODO(drive-mirror): estado_pago, liquidacion, informe_supervision aún no persisten PDF

  return (
    <div className="space-y-2">
      <pre className="overflow-x-auto rounded-xl border border-ds-border-subtle bg-ds-surface-1 p-3 font-mono text-[12px] leading-relaxed text-ds-text-3">
        {lines.join("\n")}
      </pre>
      <p className="text-ds-body text-ds-text-4">
        Las carpetas de cada cliente/negocio se crean automáticamente con el primer documento.
      </p>
    </div>
  );
}
