'use client';

/**
 * Dashboard Header
 * 
 * Header principal del dashboard con:
 * - Logo de Gard Security
 * - Campana de notificaciones
 * - Modal selector de templates
 * - Responsive mobile-first
 */

import { useState, useMemo } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { FileText, Sparkles, X, Bell, LogOut, LayoutDashboard, Settings } from 'lucide-react';
import { Presentation, Template, PresentationView } from '@prisma/client';

type PresentationWithRelations = Presentation & {
  template: Template;
  views: PresentationView[];
};

interface DashboardHeaderProps {
  presentations: PresentationWithRelations[];
  userRole?: string;
}

export function DashboardHeader({ presentations, userRole }: DashboardHeaderProps) {
  const [showTemplateModal, setShowTemplateModal] = useState(false);
  const [showNotifications, setShowNotifications] = useState(false);
  const pathname = usePathname();
  const canManageUsers = userRole === 'owner' || userRole === 'admin';

  // Calcular notificaciones de presentaciones no vistas después de 3 días
  const notifications = useMemo(() => {
    const now = new Date();
    const threeDaysAgo = new Date(now.getTime() - 3 * 24 * 60 * 60 * 1000);
    
    return presentations.filter((p) => {
      if (p.status !== 'sent' || p.viewCount > 0) return false;
      if (!p.emailSentAt) return false;
      
      const sentDate = new Date(p.emailSentAt);
      return sentDate <= threeDaysAgo;
    });
  }, [presentations]);

  const templates = [
    {
      id: 'commercial',
      name: 'Propuesta Comercial',
      description: 'Template completo con 24 secciones',
      url: '/templates/commercial/preview?admin=true',
      color: 'from-blue-500 to-purple-600'
    },
    {
      id: 'email',
      name: 'Template de Email',
      description: 'Vista previa del email',
      url: '/templates/email/preview',
      color: 'from-amber-500 to-orange-600'
    },
    {
      id: 'pricing',
      name: 'Formato de Propuesta',
      description: 'Vista de pricing',
      url: '/templates/pricing-format?admin=true',
      color: 'from-purple-500 to-pink-600'
    }
  ];

  return (
    <>
      <header className="sticky top-0 z-40 bg-card/95 backdrop-blur-sm border-b border-white/10">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-14 sm:h-16">
            {/* Logo + Dashboard */}
            <Link href="/opai/inicio" className="flex items-center gap-2 sm:gap-3">
              <Image 
                src="/logo escudo blanco.png" 
                alt="Gard Security" 
                width={32} 
                height={32}
                className="w-7 h-7 sm:w-8 sm:h-8 object-contain"
              />
              <div className="flex items-center gap-2">
                <span className="text-base sm:text-lg font-bold text-foreground">
                  Gard Security
                </span>
                <span className="hidden sm:inline text-foreground/40">|</span>
                <span className="text-sm sm:text-base font-medium text-foreground/80">
                  Dashboard
                </span>
              </div>
            </Link>

            {/* Navegación + Acciones (derecha) */}
            <div className="flex items-center gap-1 sm:gap-2">
              {/* Navegación solo para Admin / Propietario */}
              {canManageUsers && (
                <nav className="hidden sm:flex items-center gap-1 mr-2">
                  <Link
                    href="/opai/inicio"
                    className={`flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                      pathname === '/opai/inicio' ? 'bg-white/10 text-foreground' : 'text-foreground/60 hover:text-foreground hover:bg-white/5'
                    }`}
                  >
                    <LayoutDashboard className="w-4 h-4" />
                    Presentaciones
                  </Link>
                  <Link
                    href="/opai/configuracion"
                    className={`flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                      pathname.startsWith('/opai/configuracion') ? 'bg-white/10 text-foreground' : 'text-foreground/60 hover:text-foreground hover:bg-white/5'
                    }`}
                  >
                    <Settings className="w-4 h-4" />
                    Configuración
                  </Link>
                </nav>
              )}

              {/* Campana de notificaciones */}
              <button
                onClick={() => setShowNotifications(!showNotifications)}
                className="relative p-2 rounded-lg text-foreground/60 hover:text-foreground hover:bg-white/5 transition-colors"
                title="Notificaciones"
              >
                <Bell className="w-5 h-5" />
                {notifications.length > 0 && (
                  <span className="absolute -top-1 -right-1 w-5 h-5 bg-red-500 rounded-full text-foreground text-xs font-bold flex items-center justify-center">
                    {notifications.length}
                  </span>
                )}
              </button>

              {/* Botón Templates - minimalista */}
              <button
                onClick={() => setShowTemplateModal(true)}
                className="flex items-center gap-2 px-3 py-2 rounded-lg text-foreground/60 hover:text-foreground hover:bg-white/5 text-sm font-medium transition-colors"
                title="Ver templates"
              >
                <FileText className="w-4 h-4" />
                <span className="hidden sm:inline">Templates</span>
              </button>

              {/* Cerrar sesión - minimalista */}
              <Link
                href="/api/auth/signout?callbackUrl=/login"
                className="p-2 rounded-lg text-foreground/60 hover:text-foreground hover:bg-white/5 transition-colors"
                title="Cerrar sesión"
              >
                <LogOut className="w-4 h-4" />
              </Link>
            </div>
          </div>
        </div>
      </header>

      {/* Panel de Notificaciones */}
      {showNotifications && (
        <div className="fixed top-20 right-4 left-4 sm:left-auto z-50 sm:w-96 bg-card rounded-xl border border-white/10 shadow-2xl max-h-[70vh] overflow-y-auto">
          {/* Header */}
          <div className="flex items-center justify-between p-4 border-b border-white/10 sticky top-0 bg-card">
            <div>
              <h3 className="text-lg font-bold text-foreground">Notificaciones</h3>
              <p className="text-xs text-foreground/60">
                Presentaciones sin ver hace más de 3 días
              </p>
            </div>
            <button
              onClick={() => setShowNotifications(false)}
              className="p-1 rounded-lg hover:bg-white/10 transition-colors"
            >
              <X className="w-4 h-4 text-foreground" />
            </button>
          </div>

          {/* Lista de notificaciones */}
          <div className="p-4 space-y-3">
            {notifications.length === 0 ? (
              <div className="text-center py-8 text-foreground/60">
                <Bell className="w-12 h-12 mx-auto mb-3 opacity-50" />
                <p className="text-sm">No hay notificaciones pendientes</p>
              </div>
            ) : (
              notifications.map((presentation) => {
                const clientData = presentation.clientData as any;
                const companyName = clientData?.account?.Account_Name || 'Sin nombre';
                const daysAgo = Math.floor((new Date().getTime() - new Date(presentation.emailSentAt!).getTime()) / (1000 * 60 * 60 * 24));
                
                return (
                  <div
                    key={presentation.id}
                    className="p-3 rounded-lg bg-red-500/10 border border-red-500/20 hover:bg-red-500/20 transition-all"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold text-foreground truncate">
                          {companyName}
                        </p>
                        <p className="text-xs text-foreground/70 mt-1">
                          Enviado hace <strong>{daysAgo} días</strong>
                        </p>
                        <p className="text-xs text-red-400 mt-1">
                          ⚠️ Sin vistas aún
                        </p>
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
              })
            )}
          </div>
        </div>
      )}

      {/* Modal Selector de Templates */}
      {showTemplateModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
          <div className="bg-card rounded-xl border border-white/10 shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto">
            {/* Header del modal */}
            <div className="flex items-center justify-between p-4 sm:p-6 border-b border-white/10">
              <div>
                <h2 className="text-xl sm:text-2xl font-bold text-foreground">
                  Selecciona un Template
                </h2>
                <p className="text-sm text-foreground/60 mt-1">
                  Elige qué template quieres visualizar
                </p>
              </div>
              <button
                onClick={() => setShowTemplateModal(false)}
                className="p-2 rounded-lg bg-white/5 hover:bg-white/10 transition-colors"
              >
                <X className="w-5 h-5 text-foreground" />
              </button>
            </div>

            {/* Lista de templates */}
            <div className="p-4 sm:p-6 space-y-3">
              {templates.map((template) => (
                <a
                  key={template.id}
                  href={template.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="block p-4 rounded-lg border border-white/10 bg-white/5 hover:bg-white/10 transition-all hover:scale-102 group"
                >
                  <div className="flex items-start gap-4">
                    <div className={`p-3 rounded-lg bg-gradient-to-br ${template.color} flex-shrink-0`}>
                      <FileText className="w-6 h-6 text-foreground" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <h3 className="text-lg font-bold text-foreground mb-1 group-hover:text-blue-400 transition-colors">
                        {template.name}
                      </h3>
                      <p className="text-sm text-foreground/60">
                        {template.description}
                      </p>
                    </div>
                    <Sparkles className="w-5 h-5 text-foreground/40 group-hover:text-blue-400 transition-colors flex-shrink-0" />
                  </div>
                </a>
              ))}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
