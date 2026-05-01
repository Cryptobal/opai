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
import { MoreVertical, UserCheck, UserX } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { es } from 'date-fns/locale';

interface RoleTemplate {
  id: string;
  name: string;
  slug: string;
}

interface User {
  id: string;
  email: string;
  name: string;
  role: string;
  roleTemplateId: string | null;
  status: string;
  lastLoginAt: Date | null;
  createdAt: Date;
  roleTemplate?: { id: string; name: string; slug: string } | null;
}

interface Props {
  users: User[];
  roleTemplates: RoleTemplate[];
  currentUserId: string;
  currentUserRole: string;
}

const ROLE_BADGE_VARIANTS: Record<string, 'default' | 'secondary' | 'outline'> = {
  owner: 'default',
  admin: 'secondary',
  editor: 'outline',
  viewer: 'outline',
};

export default function UsersTable({ users, roleTemplates, currentUserId, currentUserRole }: Props) {
  const [loading, setLoading] = useState<string | null>(null);
  const [roleChanging, setRoleChanging] = useState<string | null>(null);

  const getRoleDisplay = (user: User) => {
    if (user.roleTemplate) return user.roleTemplate.name;
    const t = roleTemplates.find((r) => r.slug === user.role);
    if (t) return t.name;
    return user.role;
  };

  const getRoleBadge = (user: User) => {
    const label = getRoleDisplay(user);
    const variant = ROLE_BADGE_VARIANTS[user.role] ?? 'outline';
    const isOrphaned = !user.roleTemplate && user.roleTemplateId;
    return (
      <Badge variant={variant} className={isOrphaned ? 'border-status-warn-border' : ''}>
        {label}
        {isOrphaned && ' (obsoleto)'}
      </Badge>
    );
  };

  const getStatusBadge = (status: string) => {
    const config: Record<string, { variant: 'success' | 'destructive' | 'warning' | 'secondary'; label: string }> = {
      active: { variant: 'success', label: 'Activo' },
      disabled: { variant: 'destructive', label: 'Desactivado' },
      invited: { variant: 'warning', label: 'Invitado' },
    };
    const cfg = config[status] || { variant: 'secondary' as const, label: status };
    return <Badge variant={cfg.variant}>{cfg.label}</Badge>;
  };

  const handleToggleStatus = async (userId: string) => {
    setLoading(userId);
    await toggleUserStatus(userId);
    setLoading(null);
    window.location.reload();
  };

  const handleRoleChange = async (userId: string, roleTemplateId: string) => {
    setRoleChanging(userId);
    await changeUserRole(userId, roleTemplateId);
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
                        value={
                          user.roleTemplateId ??
                          roleTemplates.find((t) => t.slug === user.role)?.id ??
                          ''
                        }
                        onValueChange={(id) => handleRoleChange(user.id, id)}
                        disabled={roleChanging === user.id}
                      >
                        <SelectTrigger className="w-[160px]">
                          <SelectValue placeholder="Seleccionar rol" />
                        </SelectTrigger>
                        <SelectContent>
                          {roleTemplates.map((t) => (
                            <SelectItem key={t.id} value={t.id}>
                              {t.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    ) : (
                      getRoleBadge(user)
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
                      >
                        Acciones
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem
                        onClick={() => handleToggleStatus(user.id)}
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
                      <span className="text-xs text-status-warn-fg">Invita usuarios para ver acciones</span>
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
        <tbody className="divide-y divide-border">
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
                      value={
                        user.roleTemplateId ??
                        roleTemplates.find((t) => t.slug === user.role)?.id ??
                        ''
                      }
                      onValueChange={(id) => handleRoleChange(user.id, id)}
                      disabled={roleChanging === user.id}
                    >
                      <SelectTrigger className="w-[140px]">
                        <SelectValue placeholder="Seleccionar rol" />
                      </SelectTrigger>
                      <SelectContent>
                        {roleTemplates.map((t) => (
                          <SelectItem key={t.id} value={t.id}>
                            {t.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  ) : (
                    getRoleBadge(user)
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
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem
                          onClick={() => handleToggleStatus(user.id)}
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
                        <span className="text-xs text-status-warn-fg">← Invita usuarios para ver acciones</span>
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
