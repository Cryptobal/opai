'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { revokeInvitation } from '@/app/(app)/opai/actions/users';
import { X } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { es } from 'date-fns/locale';

interface Invitation {
  id: string;
  email: string;
  role: string;
  createdAt: Date;
  expiresAt: Date;
}

interface Props {
  invitations: Invitation[];
}

export default function InvitationsTable({ invitations }: Props) {
  const [loading, setLoading] = useState<string | null>(null);

  const handleRevoke = async (id: string) => {
    if (!confirm('¿Seguro que deseas revocar esta invitación?')) return;
    setLoading(id);
    await revokeInvitation(id);
    setLoading(null);
    window.location.reload();
  };

  const getRoleLabel = (role: string) => {
    const labels: Record<string, string> = {
      owner: 'Propietario',
      admin: 'Administrador',
      editor: 'Editor',
      viewer: 'Visualizador',
    };
    return labels[role] || role;
  };

  return (
    <div className="overflow-x-auto">
      <table className="w-full">
        <thead className="bg-slate-800 border-b border-slate-700">
          <tr>
            <th className="px-6 py-3 text-left text-xs font-medium text-slate-400 uppercase tracking-wider">
              Email
            </th>
            <th className="px-6 py-3 text-left text-xs font-medium text-slate-400 uppercase tracking-wider">
              Rol
            </th>
            <th className="px-6 py-3 text-left text-xs font-medium text-slate-400 uppercase tracking-wider">
              Enviada
            </th>
            <th className="px-6 py-3 text-left text-xs font-medium text-slate-400 uppercase tracking-wider">
              Expira
            </th>
            <th className="px-6 py-3 text-right text-xs font-medium text-slate-400 uppercase tracking-wider">
              Acciones
            </th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-800">
          {invitations.map((inv) => (
            <tr key={inv.id} className="hover:bg-slate-800/50 transition-colors">
              <td className="px-6 py-4 font-medium text-white">
                {inv.email}
              </td>
              <td className="px-6 py-4">
                <span className="bg-amber-600 text-white text-xs px-2.5 py-1 rounded-full font-medium">
                  {getRoleLabel(inv.role)}
                </span>
              </td>
              <td className="px-6 py-4 text-sm text-slate-400">
                {formatDistanceToNow(new Date(inv.createdAt), {
                  addSuffix: true,
                  locale: es,
                })}
              </td>
              <td className="px-6 py-4 text-sm text-slate-400">
                {formatDistanceToNow(new Date(inv.expiresAt), {
                  addSuffix: true,
                  locale: es,
                })}
              </td>
              <td className="px-6 py-4 text-right">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => handleRevoke(inv.id)}
                  disabled={loading === inv.id}
                  className="text-red-400 hover:text-red-300 hover:bg-red-900/20"
                >
                  <X className="w-4 h-4 mr-1" />
                  Revocar
                </Button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
