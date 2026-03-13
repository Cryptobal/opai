/**
 * Página pública de oposición de marcación.
 * El trabajador accede via link único del email, sin login NextAuth.
 */

import { Metadata } from "next";
import { OpposicionMarcacionForm } from "@/components/ops/OpposicionMarcacionForm";

export const metadata: Metadata = {
  title: "Oposición a Modificación de Marcación",
};

type Props = { params: Promise<{ token: string }> };

export default async function OpossicionMarcacionPage({ params }: Props) {
  const { token } = await params;
  return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        <OpposicionMarcacionForm token={token} />
      </div>
    </div>
  );
}
