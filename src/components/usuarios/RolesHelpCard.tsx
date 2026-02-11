'use client';

import React from 'react';
/**
 * RolesHelpCard - Modal con matriz de permisos por rol
 * Dos tablas: (1) Permisos por rol, (2) Visibilidad de módulos.
 * Orden fijo: Permiso / Módulo a la izquierda, roles en columnas a la derecha.
 */

import { PERMISSIONS, hasPermission, type Role } from '@/lib/rbac';
import { hasAppAccess } from '@/lib/app-access';
import {
  hasConfigSubmoduleAccess,
  hasCrmSubmoduleAccess,
  hasDocsSubmoduleAccess,
} from '@/lib/module-access';
import { HelpCircle, Check, X as XIcon } from 'lucide-react';
import { useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';

const ROLE_LABELS: Record<string, string> = {
  owner: 'Propietario',
  admin: 'Admin',
  editor: 'Editor',
  rrhh: 'RRHH',
  operaciones: 'Operaciones',
  reclutamiento: 'Reclutamiento',
  solo_documentos: 'Solo Documentos',
  solo_crm: 'Solo CRM',
  solo_ops: 'Solo Ops',
  solo_payroll: 'Solo Payroll',
  viewer: 'Visualizador',
};

const ROLES_ORDER: Role[] = [
  'owner',
  'admin',
  'editor',
  'rrhh',
  'operaciones',
  'reclutamiento',
  'solo_documentos',
  'solo_crm',
  'solo_ops',
  'solo_payroll',
  'viewer',
];

// Permisos agrupados: coincide con lo que usa el sistema (role-policy.ts)
const PERMISSION_GROUPS: Array<{
  groupName: string;
  items: Array<{ label: string; key: (typeof PERMISSIONS)[keyof typeof PERMISSIONS] }>;
}> = [
  {
    groupName: 'Usuarios',
    items: [
      { label: 'Gestionar usuarios', key: PERMISSIONS.MANAGE_USERS },
      { label: 'Invitar usuarios', key: PERMISSIONS.INVITE_USERS },
    ],
  },
  {
    groupName: 'Templates',
    items: [
      { label: 'Gestionar templates', key: PERMISSIONS.MANAGE_TEMPLATES },
      { label: 'Editar templates', key: PERMISSIONS.EDIT_TEMPLATES },
      { label: 'Ver templates', key: PERMISSIONS.VIEW_TEMPLATES },
    ],
  },
  {
    groupName: 'Presentaciones',
    items: [
      { label: 'Enviar propuestas', key: PERMISSIONS.SEND_PRESENTATIONS },
      { label: 'Crear presentaciones', key: PERMISSIONS.CREATE_PRESENTATIONS },
      { label: 'Ver presentaciones', key: PERMISSIONS.VIEW_PRESENTATIONS },
    ],
  },
  {
    groupName: 'Sistema',
    items: [
      { label: 'Ver analytics', key: PERMISSIONS.VIEW_ANALYTICS },
      { label: 'Configuración', key: PERMISSIONS.MANAGE_SETTINGS },
    ],
  },
];

// Visibilidad: primero módulos principales, luego submódulos clave
const MODULE_VISIBILITY: Array<{ label: string; check: (role: Role) => boolean }> = [
  { label: 'Hub', check: (r) => hasAppAccess(r, 'hub') },
  { label: 'Documentos', check: (r) => hasAppAccess(r, 'docs') },
  { label: 'CRM', check: (r) => hasAppAccess(r, 'crm') },
  { label: 'CPQ', check: (r) => hasAppAccess(r, 'cpq') },
  { label: 'Payroll', check: (r) => hasAppAccess(r, 'payroll') },
  { label: 'Ops', check: (r) => hasAppAccess(r, 'ops') },
  { label: 'Configuración', check: (r) => hasConfigSubmoduleAccess(r, 'overview') },
  { label: 'Docs · Editor de texto', check: (r) => hasDocsSubmoduleAccess(r, 'document_editor') },
  { label: 'CRM · Leads', check: (r) => hasCrmSubmoduleAccess(r, 'leads') },
  { label: 'Configuración · Usuarios', check: (r) => hasConfigSubmoduleAccess(r, 'users') },
  { label: 'Configuración · Integraciones', check: (r) => hasConfigSubmoduleAccess(r, 'integrations') },
  { label: 'Configuración · Notificaciones', check: (r) => hasConfigSubmoduleAccess(r, 'notifications') },
];

function Cell({ has }: { has: boolean }) {
  return (
    <td className="text-center py-2 px-2 whitespace-nowrap">
      {has ? (
        <Check className="w-4 h-4 text-emerald-400 mx-auto" aria-hidden />
      ) : (
        <XIcon className="w-4 h-4 text-muted-foreground/50 mx-auto" aria-hidden />
      )}
    </td>
  );
}

export default function RolesHelpCard() {
  const [open, setOpen] = useState(false);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" className="gap-2">
          <HelpCircle className="w-5 h-5 text-amber-400" />
          <span>Ver permisos</span>
        </Button>
      </DialogTrigger>
      <DialogContent className="w-[95vw] sm:!max-w-[min(95vw,1920px)] max-w-[1920px] h-[92vh] flex flex-col overflow-x-hidden">
        <DialogHeader className="flex-shrink-0 pb-2">
          <DialogTitle className="text-xl">Matriz de Permisos por Rol</DialogTitle>
        </DialogHeader>

        <div className="space-y-6 flex-1 overflow-y-auto overflow-x-auto pr-1 min-w-0">
          <p className="text-sm text-muted-foreground">
            Copia exacta de los permisos reales ({' '}
            <code className="text-xs bg-muted px-1 rounded">src/lib/role-policy.ts</code>
            ). Izquierda: permiso o módulo. Derecha: qué rol lo tiene.
          </p>

          {/* Tabla 1: Permisos por rol */}
          <section>
            <h3 className="text-sm font-semibold text-foreground mb-2">1. Permisos por rol</h3>
            <div className="rounded-lg border border-border overflow-hidden">
              <table className="w-full border-collapse text-sm">
                <thead>
                  <tr className="border-b border-border bg-muted/50">
                    <th className="text-left py-2.5 px-3 text-muted-foreground font-medium w-48">
                      Permiso
                    </th>
                    {ROLES_ORDER.map((role) => (
                      <th
                        key={role}
                        className="text-center py-2.5 px-2 text-foreground font-medium min-w-[4rem]"
                      >
                        {ROLE_LABELS[role]}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {PERMISSION_GROUPS.map((group) => (
                    <React.Fragment key={group.groupName}>
                      <tr className="border-t border-border">
                        <td
                          colSpan={ROLES_ORDER.length + 1}
                          className="py-1.5 px-3 text-xs uppercase tracking-wider text-muted-foreground font-semibold bg-muted/30"
                        >
                          {group.groupName}
                        </td>
                      </tr>
                      {group.items.map((item) => (
                        <tr
                          key={item.key}
                          className="border-t border-border/50 hover:bg-muted/20"
                        >
                          <td className="py-2 px-3 text-muted-foreground">{item.label}</td>
                          {ROLES_ORDER.map((role) => (
                            <Cell key={role} has={hasPermission(role, item.key)} />
                          ))}
                        </tr>
                      ))}
                    </React.Fragment>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          {/* Tabla 2: Visibilidad de módulos y submódulos */}
          <section>
            <h3 className="text-sm font-semibold text-foreground mb-2">
              2. Visibilidad de módulos y submódulos
            </h3>
            <div className="rounded-lg border border-border overflow-hidden">
              <table className="w-full border-collapse text-sm">
                <thead>
                  <tr className="border-b border-border bg-muted/50">
                    <th className="text-left py-2.5 px-3 text-muted-foreground font-medium w-48">
                      Módulo / Submódulo
                    </th>
                    {ROLES_ORDER.map((role) => (
                      <th
                        key={role}
                        className="text-center py-2.5 px-2 text-foreground font-medium min-w-[4rem]"
                      >
                        {ROLE_LABELS[role]}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {MODULE_VISIBILITY.map((row) => (
                    <tr
                      key={row.label}
                      className="border-t border-border/50 hover:bg-muted/20"
                    >
                      <td className="py-2 px-3 text-muted-foreground">{row.label}</td>
                      {ROLES_ORDER.map((role) => (
                        <Cell key={role} has={row.check(role)} />
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          <div className="bg-muted/50 rounded-lg p-4 text-xs text-muted-foreground space-y-2">
            <p>
              <strong className="text-foreground">Resumen:</strong> Propietario y Admin tienen los
              mismos permisos y ven los mismos módulos. Editor ve todo excepto Configuración. El resto
              de roles solo accede a su módulo asignado.
            </p>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
