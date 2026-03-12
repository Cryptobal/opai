'use client';

/**
 * Página /portales — Vista con cards para cada portal disponible.
 * Solo accesible para propietario y administrador.
 */

import { useState } from 'react';
import { Shield, Route, Monitor, Users, ClipboardCheck, ScanLine, Fingerprint } from 'lucide-react';
import { PageHeader } from '@/components/opai';
import { PortalCard } from '@/components/portales/PortalCard';
import { PortalViewer } from '@/components/portales/PortalViewer';
import type { LucideIcon } from 'lucide-react';

interface PortalDef {
    id: string;
    name: string;
    description: string;
    href: string;
    icon: LucideIcon;
    accentColor: string;
}

const PORTALS: PortalDef[] = [
    {
        id: 'guardia',
        name: 'Portal Guardia',
        description:
            'Portal de autoservicio para guardias de seguridad. Permite ver turnos, marcaciones y documentos.',
        href: '/portal/guardia',
        icon: Shield,
        accentColor: 'from-blue-500/25 to-blue-400/5',
    },
    {
        id: 'rondas',
        name: 'Portal Rondas',
        description:
            'Portal para el registro de rondas de seguridad. Los guardias marcan sus rondas con RUT y PIN.',
        href: '/portal/rondas',
        icon: Route,
        accentColor: 'from-emerald-500/25 to-emerald-400/5',
    },
    {
        id: 'cliente',
        name: 'Portal de clientes',
        description:
            'Portal para clientes. Los contactos con PIN pueden ingresar con el RUT de la empresa y su PIN personal.',
        href: '/portal/cliente',
        icon: Users,
        accentColor: 'from-teal-500/25 to-teal-400/5',
    },
    {
        id: 'supervisor',
        name: 'Portal de supervisor',
        description:
            'Hub para supervisores de terreno. Visitas de supervisión, asignaciones, check-in y actividades del día.',
        href: '/portal/supervisor',
        icon: ClipboardCheck,
        accentColor: 'from-violet-500/25 to-violet-400/5',
    },
    {
        id: 'marcacion',
        name: 'Portal Marcación',
        description:
            'Portal para el registro de asistencia con Face ID y PIN. Los guardias marcan entrada y salida desde un dispositivo fijo en la instalación.',
        href: '/portal/marcacion',
        icon: Fingerprint,
        accentColor: 'from-orange-500/25 to-orange-400/5',
    },
    {
        id: 'acceso',
        name: 'Portal Control de Acceso',
        description:
            'Control de ingreso y salida de personas y vehículos. Se vincula a una instalación mediante código de emparejamiento.',
        href: '/portal/acceso',
        icon: ScanLine,
        accentColor: 'from-cyan-500/25 to-cyan-400/5',
    },
];

export default function PortalesPage() {
    const [activePortal, setActivePortal] = useState<PortalDef | null>(null);

    return (
        <>
            <PageHeader
                title="Portales"
                description="Accede y gestiona los portales externos de OPAI."
            />

            {/* Info banner */}
            <div className="mb-6 flex items-start gap-3 rounded-lg border border-border/50 bg-card/50 px-4 py-3">
                <Monitor className="h-5 w-5 text-muted-foreground/60 shrink-0 mt-0.5" />
                <div className="text-sm text-muted-foreground leading-relaxed">
                    <p>
                        Los portales son interfaces especializadas para guardias y personal en terreno.
                        Puedes abrirlos en un panel lateral para previsualizar o en una nueva pestaña.
                    </p>
                    <p className="mt-1 text-xs text-muted-foreground/60">
                        Si tienes un rol simulado activo, el portal reflejará esa vista.
                    </p>
                </div>
            </div>

            {/* Portal Cards Grid */}
            <div className="grid gap-6 sm:grid-cols-2">
                {PORTALS.map((portal) => (
                    <PortalCard
                        key={portal.id}
                        name={portal.name}
                        description={portal.description}
                        href={portal.href}
                        icon={portal.icon}
                        accentColor={portal.accentColor}
                        onOpen={() => setActivePortal(portal)}
                    />
                ))}
            </div>

            {/* Portal Viewer Drawer */}
            {activePortal && (
                <PortalViewer
                    name={activePortal.name}
                    href={activePortal.href}
                    icon={activePortal.icon}
                    isOpen={!!activePortal}
                    onClose={() => setActivePortal(null)}
                />
            )}
        </>
    );
}
