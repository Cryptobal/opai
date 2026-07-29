"use client";

import { SignaturePanel } from "@/components/crm/correos/signature/SignaturePanel";
import type { SignatureRow } from "@/components/crm/correos/signature/signature-ui";

type Props = {
  initialSignatures: SignatureRow[];
};

/**
 * Página de configuración de firmas.
 * Scope empresa por defecto (el usuario con config.edit puede guardar tenant).
 */
export function SignatureManagerClient({ initialSignatures }: Props) {
  return (
    <SignaturePanel
      defaultScope="tenant"
      initialRows={initialSignatures}
    />
  );
}
