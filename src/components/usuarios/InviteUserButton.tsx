'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { inviteUser } from '@/app/(app)/opai/actions/users';
import { ROLES, type Role } from '@/lib/rbac';
import { Plus } from 'lucide-react';

export default function InviteUserButton() {
  const [open, setOpen] = useState(false);
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<Role>(ROLES.VIEWER);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    const result = await inviteUser(email, role);

    setLoading(false);

    if (result.success) {
      setEmail('');
      setRole(ROLES.VIEWER);
      setOpen(false);
      window.location.reload();
    } else {
      setError(result.error || 'Error al enviar invitación');
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button>
          <Plus className="w-4 h-4 mr-2" />
          Invitar Usuario
        </Button>
      </DialogTrigger>
      <DialogContent className="bg-card border-border text-foreground">
        <DialogHeader>
          <DialogTitle className="text-foreground">Invitar Nuevo Usuario</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <Label htmlFor="email" className="text-muted-foreground">Email</Label>
            <Input
              id="email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="usuario@ejemplo.com"
              required
              className="bg-muted border-border text-foreground placeholder:text-muted-foreground mt-1.5"
            />
          </div>

          <div>
            <Label htmlFor="role" className="text-muted-foreground">Rol</Label>
            <Select value={role} onValueChange={(v) => setRole(v as Role)}>
              <SelectTrigger className="bg-muted border-border text-foreground mt-1.5">
                <SelectValue />
              </SelectTrigger>
              <SelectContent className="bg-muted border-border">
                <SelectItem value={ROLES.VIEWER} className="text-foreground hover:bg-slate-700">Visualizador</SelectItem>
                <SelectItem value={ROLES.EDITOR} className="text-foreground hover:bg-slate-700">Editor</SelectItem>
                <SelectItem value={ROLES.ADMIN} className="text-foreground hover:bg-slate-700">Administrador</SelectItem>
                <SelectItem value={ROLES.OWNER} className="text-foreground hover:bg-slate-700">Propietario</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {error && (
            <div className="text-sm text-red-400 bg-red-900/20 border border-red-800 p-3 rounded">
              {error}
            </div>
          )}

          <div className="flex justify-end gap-3 pt-4">
            <Button
              type="button"
              variant="outline"
              onClick={() => setOpen(false)}
              className="border-border text-muted-foreground hover:bg-muted"
            >
              Cancelar
            </Button>
            <Button 
              type="submit" 
              disabled={loading}
              className=""
            >
              {loading ? 'Enviando...' : 'Enviar Invitación'}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
