"use client";

// Stub — full implementation in Task 6
// This placeholder satisfies the import in PortalCotizaciones.tsx

interface Props {
  quoteId: string;
  accountRut?: string;
  accountName?: string;
  onComplete?: (signatureToken: string | null) => void;
}

export function PortalContractForm({ quoteId, accountName }: Props) {
  return (
    <div className="rounded-xl border border-teal-200 bg-teal-50/10 p-5 space-y-3 mt-4">
      <p className="text-sm font-semibold text-teal-300">Contrato en preparacion</p>
      <p className="text-xs text-zinc-400">
        Tu cotizacion <strong>{quoteId}</strong> ha sido aprobada
        {accountName ? ` para ${accountName}` : ""}. Un ejecutivo te contactara
        para continuar con el proceso de contratacion.
      </p>
      <p className="text-xs text-zinc-500">
        El formulario de datos de contrato estara disponible en breve.
      </p>
    </div>
  );
}
