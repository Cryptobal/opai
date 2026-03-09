"use client";

import { SupervisorInstallation } from "@/lib/portal-supervisor";
import { SupervisorPautaGrid } from "./SupervisorPautaGrid";

interface Props {
  installations: SupervisorInstallation[];
}

export function SupervisorPautas({ installations }: Props) {
  return (
    <div className="flex flex-col gap-3 px-4 py-4 pb-24">
      <h2 className="text-lg font-semibold">Pautas</h2>
      <SupervisorPautaGrid installations={installations} />
    </div>
  );
}
