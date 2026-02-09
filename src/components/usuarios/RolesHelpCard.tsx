'use client';

/**
 * RolesHelpCard - Modal con matriz de permisos por rol
 * Muestra una tabla visual de qué puede hacer cada rol
 */

import { ROLES, PERMISSIONS, hasPermission, type Role } from '@/lib/rbac';
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
  viewer: 'Visualizador',
};

const PERMISSION_GROUPS = [
  {
    name: 'Usuarios',
    permissions: [
      { key: PERMISSIONS.MANAGE_USERS, label: 'Gestionar usuarios' },
      { key: PERMISSIONS.INVITE_USERS, label: 'Invitar usuarios' },
    ],
  },
  {
    name: 'Templates',
    permissions: [
      { key: PERMISSIONS.MANAGE_TEMPLATES, label: 'Gestionar templates' },
      { key: PERMISSIONS.EDIT_TEMPLATES, label: 'Editar templates' },
      { key: PERMISSIONS.VIEW_TEMPLATES, label: 'Ver templates' },
    ],
  },
  {
    name: 'Presentaciones',
    permissions: [
      { key: PERMISSIONS.SEND_PRESENTATIONS, label: 'Enviar propuestas' },
      { key: PERMISSIONS.CREATE_PRESENTATIONS, label: 'Crear presentaciones' },
      { key: PERMISSIONS.VIEW_PRESENTATIONS, label: 'Ver presentaciones' },
    ],
  },
  {
    name: 'Sistema',
    permissions: [
      { key: PERMISSIONS.VIEW_ANALYTICS, label: 'Ver analytics' },
      { key: PERMISSIONS.MANAGE_SETTINGS, label: 'Configuración' },
    ],
  },
];

export default function RolesHelpCard() {
  const [open, setOpen] = useState(false);
  const rolesOrder: Role[] = ['owner', 'admin', 'editor', 'viewer'];

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" className="gap-2 bg-card border-border text-foreground hover:bg-muted hover:text-foreground">
          <HelpCircle className="w-5 h-5 text-amber-400" />
          <span>Ver permisos</span>
        </Button>
      </DialogTrigger>
      <DialogContent className="bg-card border-border text-foreground max-w-5xl h-[95vh] flex flex-col">
        <DialogHeader className="flex-shrink-0">
          <DialogTitle className="text-foreground text-xl">Matriz de Permisos por Rol</DialogTitle>
        </DialogHeader>
        
        <div className="space-y-4 flex-1 overflow-y-auto">
          <p className="text-sm text-muted-foreground">
            Permisos reales del sistema. Los roles superiores heredan todos los permisos de los inferiores.
          </p>

          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-sm">
              <thead>
                <tr className="border-b border-border">
                  <th className="text-left py-3 px-4 text-muted-foreground font-medium">Permiso</th>
                  {rolesOrder.map((role) => (
                    <th key={role} className="text-center py-3 px-4 text-foreground font-medium">
                      {ROLE_LABELS[role]}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {PERMISSION_GROUPS.map((group, groupIdx) => (
                  <>
                    <tr key={`group-${groupIdx}`} className="border-t border-border">
                      <td colSpan={rolesOrder.length + 1} className="py-2 px-4 text-xs uppercase tracking-wider text-muted-foreground font-semibold bg-muted/50">
                        {group.name}
                      </td>
                    </tr>
                    {group.permissions.map((perm, permIdx) => (
                      <tr key={`${groupIdx}-${permIdx}`} className="border-t border-border/30 hover:bg-muted/30">
                        <td className="py-3 px-4 text-muted-foreground">{perm.label}</td>
                        {rolesOrder.map((role) => {
                          const has = hasPermission(role, perm.key);
                          return (
                            <td key={role} className="text-center py-3 px-4">
                              {has ? (
                                <Check className="w-5 h-5 text-emerald-400 mx-auto" />
                              ) : (
                                <XIcon className="w-5 h-5 text-slate-600 mx-auto" />
                              )}
                            </td>
                          );
                        })}
                      </tr>
                    ))}
                  </>
                ))}
              </tbody>
            </table>
          </div>

          <div className="bg-muted/50 rounded-lg p-4 text-xs text-muted-foreground space-y-2">
            <p><strong className="text-foreground">Nota:</strong> Esta matriz muestra los permisos REALES del sistema.</p>
            <p><strong className="text-purple-400">Propietario:</strong> Control total, puede gestionar configuración del tenant.</p>
            <p><strong className="text-blue-400">Administrador:</strong> Igual que Propietario excepto configuración.</p>
            <p><strong className="text-green-400">Editor:</strong> Puede crear y enviar presentaciones, editar templates.</p>
            <p><strong className="text-muted-foreground">Visualizador:</strong> Solo puede ver presentaciones y templates (sin editar ni enviar).</p>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
