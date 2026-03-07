"use client";

import { LogOut, Shield, MapPin, User } from "lucide-react";
import type { RondasSession } from "./RondasPortalClient";

interface PortalPerfilProps {
  session: RondasSession;
  onLogout: () => void;
}

export function PortalPerfil({ session, onLogout }: PortalPerfilProps) {
  return (
    <div className="flex min-h-dvh flex-col bg-[#0a0a0f] pb-24">
      {/* Header */}
      <header className="sticky top-0 z-10 border-b border-gray-800 bg-[#0a0a0f]/90 px-4 py-4 backdrop-blur-sm">
        <h1 className="text-lg font-semibold text-white">Mi Perfil</h1>
      </header>

      <div className="flex-1 space-y-6 px-4 pt-6">
        {/* Avatar */}
        <div className="flex flex-col items-center gap-3">
          <div className="flex h-20 w-20 items-center justify-center rounded-full bg-teal-900/40 ring-2 ring-teal-600/30">
            <User className="h-10 w-10 text-teal-400" />
          </div>
          <h2 className="text-xl font-semibold text-white">{session.nombre}</h2>
        </div>

        {/* Info cards */}
        <div className="space-y-3">
          <div className="flex items-center gap-3 rounded-xl bg-gray-900/50 px-4 py-3">
            <MapPin className="h-5 w-5 text-gray-400" />
            <div>
              <p className="text-xs text-gray-500">Instalacion</p>
              <p className="text-sm text-gray-200">{session.installationName}</p>
            </div>
          </div>

          <div className="flex items-center gap-3 rounded-xl bg-gray-900/50 px-4 py-3">
            <Shield className="h-5 w-5 text-gray-400" />
            <div>
              <p className="text-xs text-gray-500">Estado</p>
              <p className="text-sm text-teal-400">Sesion activa</p>
            </div>
          </div>
        </div>

        {/* Logout */}
        <button
          onClick={onLogout}
          className="mt-8 flex w-full items-center justify-center gap-2 rounded-xl border border-red-800/50 bg-red-950/20 py-3.5 text-base font-medium text-red-400 transition-colors hover:bg-red-950/40 active:bg-red-900/30"
        >
          <LogOut className="h-5 w-5" />
          Cerrar sesion
        </button>
      </div>
    </div>
  );
}
