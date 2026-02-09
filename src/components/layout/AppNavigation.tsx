'use client';

/**
 * AppNavigation - Navegación principal profesional y consistente
 * Se usa en todas las páginas protegidas de la app
 */

import { useState } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { 
  LayoutDashboard, 
  FileText, 
  Settings, 
  LogOut, 
  Bell,
  UserCircle,
} from 'lucide-react';
import { Presentation, PresentationView } from '@prisma/client';

interface AppNavigationProps {
  userRole?: string;
  presentations?: (Presentation & { views: PresentationView[] })[];
}

export function AppNavigation({ userRole, presentations = [] }: AppNavigationProps) {
  const pathname = usePathname();
  const [showNotifications, setShowNotifications] = useState(false);
  const canManageUsers = userRole === 'owner' || userRole === 'admin';

  // Calcular notificaciones
  const notifications = presentations.filter((p) => {
    if (p.status !== 'sent' || p.viewCount > 0 || !p.emailSentAt) return false;
    const threeDaysAgo = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000);
    return new Date(p.emailSentAt) <= threeDaysAgo;
  });

  const navItems = [
    { href: '/opai/inicio', label: 'Documentos', icon: FileText, show: true },
    { href: '/opai/configuracion/usuarios', label: 'Configuración', icon: Settings, show: canManageUsers },
  ];

  return (
    <header className="sticky top-0 z-40 bg-slate-900/95 backdrop-blur-sm border-b border-white/10">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-14 sm:h-16">
          {/* Logo */}
          <Link href="/opai/inicio" className="flex items-center gap-2 sm:gap-3">
            <Image 
              src="/logo escudo blanco.png" 
              alt="Gard Security" 
              width={32} 
              height={32}
              className="w-7 h-7 sm:w-8 sm:h-8 object-contain"
            />
                <span className="text-base sm:text-lg font-bold text-white">
                  Gard Security
                </span>
          </Link>

          {/* Navegación Principal + Acciones */}
          <div className="flex items-center gap-1">
            {/* Nav Items */}
            {navItems.map((item) => 
              item.show && (
                <Link
                  key={item.href}
                  href={item.href}
                  className={`flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                    pathname === item.href 
                      ? 'bg-white/10 text-white' 
                      : 'text-white/60 hover:text-white hover:bg-white/5'
                  }`}
                >
                  <item.icon className="w-4 h-4" />
                  <span className="hidden sm:inline">{item.label}</span>
                </Link>
              )
            )}

            {/* Templates */}
            <a
              href="/templates/commercial/preview?admin=true"
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium text-white/60 hover:text-white hover:bg-white/5 transition-colors"
            >
              <LayoutDashboard className="w-4 h-4" />
              <span className="hidden sm:inline">Templates</span>
            </a>

            {/* Notificaciones */}
            <button
              onClick={() => setShowNotifications(!showNotifications)}
              className="relative p-2 rounded-lg text-white/60 hover:text-white hover:bg-white/5 transition-colors"
              title="Notificaciones"
            >
              <Bell className="w-5 h-5" />
              {notifications.length > 0 && (
                <span className="absolute -top-1 -right-1 w-5 h-5 bg-red-500 rounded-full text-white text-xs font-bold flex items-center justify-center">
                  {notifications.length}
                </span>
              )}
            </button>

            {/* Perfil */}
            <Link
              href="/opai/perfil"
              className={`flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                pathname === '/opai/perfil'
                  ? 'bg-white/10 text-white'
                  : 'text-white/60 hover:text-white hover:bg-white/5'
              }`}
              title="Mi perfil"
            >
              <UserCircle className="w-4 h-4" />
              <span className="hidden sm:inline">Perfil</span>
            </Link>

            {/* Salir */}
            <Link
              href="/api/auth/signout?callbackUrl=/opai/login"
              className="flex items-center gap-2 px-3 py-2 rounded-lg text-white/60 hover:text-white hover:bg-white/5 transition-colors text-sm font-medium"
              title="Cerrar sesión"
            >
              <LogOut className="w-4 h-4" />
              <span className="hidden sm:inline">Salir</span>
            </Link>
          </div>
        </div>
      </div>

      {/* Panel de Notificaciones */}
      {showNotifications && notifications.length > 0 && (
        <div className="absolute top-16 right-4 z-50 w-80 sm:w-96 bg-slate-900 rounded-xl border border-white/10 shadow-2xl max-h-[70vh] overflow-y-auto">
          <div className="flex items-center justify-between p-4 border-b border-white/10 sticky top-0 bg-slate-900">
            <div>
              <h3 className="text-lg font-bold text-white">Notificaciones</h3>
              <p className="text-xs text-white/60">
                Presentaciones sin ver hace más de 3 días
              </p>
            </div>
            <button
              onClick={() => setShowNotifications(false)}
              className="p-1 rounded-lg hover:bg-white/10 transition-colors text-white"
            >
              ×
            </button>
          </div>
          <div className="p-4 space-y-3">
            {notifications.map((presentation) => {
              const clientData = presentation.clientData as any;
              const companyName = clientData?.account?.Account_Name || 'Sin nombre';
              const daysAgo = Math.floor(
                (Date.now() - new Date(presentation.emailSentAt!).getTime()) / (1000 * 60 * 60 * 24)
              );

              return (
                <div
                  key={presentation.id}
                  className="p-3 rounded-lg bg-red-500/10 border border-red-500/20 hover:bg-red-500/20 transition-all"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-white truncate">
                        {companyName}
                      </p>
                      <p className="text-xs text-white/70 mt-1">
                        Enviado hace <strong>{daysAgo} días</strong>
                      </p>
                      <p className="text-xs text-red-400 mt-1">⚠️ Sin vistas aún</p>
                    </div>
                    <a
                      href={`/p/${presentation.uniqueId}?preview=true`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="px-2 py-1 rounded-md bg-blue-500/20 text-blue-300 text-xs font-medium hover:bg-blue-500/30 transition-colors flex-shrink-0"
                    >
                      Ver
                    </a>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </header>
  );
}
