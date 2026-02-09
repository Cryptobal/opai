'use client';

import { useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
} from '@/components/ui/dropdown-menu';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { changeUserRole, toggleUserStatus } from '@/app/(app)/opai/actions/users';
import { MoreVertical, Shield, UserCheck, UserX } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { es } from 'date-fns/locale';
import { ROLES, type Role } from '@/lib/rbac';

interface User {
  id: string;
  email: string;
  name: string;
  role: string;
  status: string;
  lastLoginAt: Date | null;
  createdAt: Date;
}

interface Props {
  users: User[];
  currentUserId: string;
  currentUserRole: string;
}

export default function UsersTable({ users, currentUserId, currentUserRole }: Props) {
  const [loading, setLoading] = useState<string | null>(null);
  const [roleChanging, setRoleChanging] = useState<string | null>(null);

  const getRoleBadge = (role: string) => {
    const config: Record<string, { variant: 'default' | 'secondary' | 'destructive' | 'outline', label: string, color: string }> = {
      owner: { variant: 'default', label: 'Propietario', color: 'bg-purple-600' },
      admin: { variant: 'secondary', label: 'Admin', color: 'bg-blue-600' },
      editor: { variant: 'outline', label: 'Editor', color: 'bg-green-600' },
      viewer: { variant: 'outline', label: 'Visualizador', color: 'bg-gray-600' },
    };
    const cfg = config[role] || config.viewer;
    return (
      <span className={`${cfg.color} text-foreground text-xs px-2.5 py-1 rounded-full font-medium`}>
        {cfg.label}
      </span>
    );
  };

  const getStatusBadge = (status: string) => {
    if (status === 'active') return <span className="bg-emerald-600 text-foreground text-xs px-2.5 py-1 rounded-full font-medium">Activo</span>;
    if (status === 'disabled') return <span className="bg-red-600 text-foreground text-xs px-2.5 py-1 rounded-full font-medium">Desactivado</span>;
    if (status === 'invited') return <span className="bg-amber-600 text-foreground text-xs px-2.5 py-1 rounded-full font-medium">Invitado</span>;
    return <span className="bg-gray-600 text-foreground text-xs px-2.5 py-1 rounded-full font-medium">{status}</span>;
  };

  const handleToggleStatus = async (userId: string) => {
    setLoading(userId);
    await toggleUserStatus(userId);
    setLoading(null);
    window.location.reload();
  };

  const handleRoleChange = async (userId: string, newRole: string) => {
    setRoleChanging(userId);
    await changeUserRole(userId, newRole as Role);
    setRoleChanging(null);
    window.location.reload();
  };

  if (users.length === 0) {
    return (
      <div className="p-12 text-center text-muted-foreground">
        No hay usuarios registrados
      </div>
    );
  }

  const isOnlyUser = users.length === 1 && users[0].id === currentUserId;

  return (
    <div>
      {/* Mobile cards */}
      <div className="md:hidden space-y-3">
        {users.map((user) => {
          const isCurrentUser = user.id === currentUserId;
          const canChangeRole = currentUserRole === 'owner' || currentUserRole === 'admin';
          return (
            <div key={user.id} className="rounded-lg border border-border bg-card/40 p-4">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="font-medium text-foreground">{user.name}</div>
                  <div className="text-sm text-muted-foreground truncate">{user.email}</div>
                </div>
                {getStatusBadge(user.status)}
              </div>

              <div className="mt-3 space-y-2">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-sm text-muted-foreground">Rol</span>
                  <div className="text-right">
                    {!isCurrentUser && canChangeRole && user.status === 'active' ? (
                      <Select
                        value={user.role}
                        onValueChange={(newRole) => handleRoleChange(user.id, newRole)}
                        disabled={roleChanging === user.id}
                      >
                        <SelectTrigger className="w-[160px] bg-muted border-border text-foreground">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent className="bg-muted border-border">
                          <SelectItem value={ROLES.VIEWER} className="text-foreground hover:bg-slate-700">Visualizador</SelectItem>
                          <SelectItem value={ROLES.EDITOR} className="text-foreground hover:bg-slate-700">Editor</SelectItem>
                          <SelectItem value={ROLES.ADMIN} className="text-foreground hover:bg-slate-700">Admin</SelectItem>
                          <SelectItem value={ROLES.OWNER} className="text-foreground hover:bg-slate-700">Propietario</SelectItem>
                        </SelectContent>
                      </Select>
                    ) : (
                      getRoleBadge(user.role)
                    )}
                  </div>
                </div>

                <div className="flex items-center justify-between gap-2 text-sm text-muted-foreground">
                  <span>Último login</span>
                  <span>
                    {user.lastLoginAt
                      ? formatDistanceToNow(new Date(user.lastLoginAt), {
                          addSuffix: true,
                          locale: es,
                        })
                      : 'Nunca'}
                  </span>
                </div>
              </div>

              <div className="mt-3 flex items-center justify-between">
                {!isCurrentUser && canChangeRole && (
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button
                        variant="outline"
                        size="sm"
                        disabled={loading === user.id}
                        className="text-foreground border-border bg-muted"
                      >
                        Acciones
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" className="bg-muted border-border">
                      <DropdownMenuItem
                        onClick={() => handleToggleStatus(user.id)}
                        className="text-foreground hover:bg-slate-700 cursor-pointer"
                      >
                        {user.status === 'active' ? (
                          <>
                            <UserX className="w-4 h-4 mr-2" />
                            Desactivar
                          </>
                        ) : (
                          <>
                            <UserCheck className="w-4 h-4 mr-2" />
                            Activar
                          </>
                        )}
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                )}
                {isCurrentUser && (
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-muted-foreground">(Tú)</span>
                    {isOnlyUser && (
                      <span className="text-xs text-amber-500">Invita usuarios para ver acciones</span>
                    )}
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Desktop table */}
      <div className="hidden md:block overflow-x-auto">
        <table className="w-full">
        <thead className="bg-muted border-b border-border">
          <tr>
            <th className="px-6 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">
              Usuario
            </th>
            <th className="px-6 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">
              Rol
            </th>
            <th className="px-6 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">
              Estado
            </th>
            <th className="px-6 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">
              Último Login
            </th>
            <th className="px-6 py-3 text-right text-xs font-medium text-muted-foreground uppercase tracking-wider">
              Acciones
            </th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-800">
          {users.map((user) => {
            const isCurrentUser = user.id === currentUserId;
            const canChangeRole = currentUserRole === 'owner' || currentUserRole === 'admin';
            
            return (
              <tr key={user.id} className="hover:bg-muted/50 transition-colors">
                <td className="px-6 py-4">
                  <div>
                    <div className="font-medium text-foreground">{user.name}</div>
                    <div className="text-sm text-muted-foreground">{user.email}</div>
                  </div>
                </td>
                <td className="px-6 py-4">
                  {!isCurrentUser && canChangeRole && user.status === 'active' ? (
                    <Select
                      value={user.role}
                      onValueChange={(newRole) => handleRoleChange(user.id, newRole)}
                      disabled={roleChanging === user.id}
                    >
                      <SelectTrigger className="w-[140px] bg-muted border-border text-foreground">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent className="bg-muted border-border">
                        <SelectItem value={ROLES.VIEWER} className="text-foreground hover:bg-slate-700">Visualizador</SelectItem>
                        <SelectItem value={ROLES.EDITOR} className="text-foreground hover:bg-slate-700">Editor</SelectItem>
                        <SelectItem value={ROLES.ADMIN} className="text-foreground hover:bg-slate-700">Admin</SelectItem>
                        <SelectItem value={ROLES.OWNER} className="text-foreground hover:bg-slate-700">Propietario</SelectItem>
                      </SelectContent>
                    </Select>
                  ) : (
                    getRoleBadge(user.role)
                  )}
                </td>
                <td className="px-6 py-4">{getStatusBadge(user.status)}</td>
                <td className="px-6 py-4 text-sm text-muted-foreground">
                  {user.lastLoginAt
                    ? formatDistanceToNow(new Date(user.lastLoginAt), {
                        addSuffix: true,
                        locale: es,
                      })
                    : 'Nunca'}
                </td>
                <td className="px-6 py-4 text-right">
                  {!isCurrentUser && canChangeRole && (
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button
                          variant="ghost"
                          size="sm"
                          disabled={loading === user.id}
                          className="text-muted-foreground hover:text-foreground hover:bg-muted"
                        >
                          <MoreVertical className="w-4 h-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end" className="bg-muted border-border">
                        <DropdownMenuItem
                          onClick={() => handleToggleStatus(user.id)}
                          className="text-foreground hover:bg-slate-700 cursor-pointer"
                        >
                          {user.status === 'active' ? (
                            <>
                              <UserX className="w-4 h-4 mr-2" />
                              Desactivar
                            </>
                          ) : (
                            <>
                              <UserCheck className="w-4 h-4 mr-2" />
                              Activar
                            </>
                          )}
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  )}
                  {isCurrentUser && (
                    <div className="flex items-center justify-end gap-2">
                      <span className="text-xs text-muted-foreground">(Tú)</span>
                      {isOnlyUser && (
                        <span className="text-xs text-amber-500">← Invita usuarios para ver acciones</span>
                      )}
                    </div>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
        </table>
      </div>
    </div>
  );
}
