"use client";

import { useState } from "react";

export type RondasScreen = "login" | "mis-rondas" | "ronda-activa" | "marcar" | "completada";

export interface RondasSession {
  guardiaId: string;
  tenantId: string;
  installationId: string;
  nombre: string;
  installationName: string;
  authenticatedAt: string;
}

export function RondasPortalClient() {
  const [screen, setScreen] = useState<RondasScreen>("login");
  const [session, setSession] = useState<RondasSession | null>(null);

  return (
    <div className="flex min-h-dvh flex-col">
      {/* Screens will be added in subsequent tasks */}
      <div className="flex flex-1 items-center justify-center p-6">
        <p className="text-lg text-gray-400">Portal de Rondas — En construcción</p>
      </div>
    </div>
  );
}
