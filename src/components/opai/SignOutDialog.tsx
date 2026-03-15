'use client';

import { useState } from 'react';
import { signOut } from 'next-auth/react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';

interface SignOutDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function SignOutDialog({ open, onOpenChange }: SignOutDialogProps) {
  const [isSigningOut, setIsSigningOut] = useState(false);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>Cerrar Sesión</DialogTitle>
          <DialogDescription>
            ¿Estás seguro que deseas cerrar sesión?
          </DialogDescription>
        </DialogHeader>
        <DialogFooter className="gap-2 sm:gap-0">
          <button
            type="button"
            onClick={() => onOpenChange(false)}
            disabled={isSigningOut}
            className="inline-flex items-center justify-center rounded-md px-4 py-2 text-sm font-medium transition-colors border border-border bg-background hover:bg-accent hover:text-accent-foreground disabled:opacity-50"
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={async () => {
              setIsSigningOut(true);
              await signOut({ callbackUrl: '/opai/login' });
            }}
            disabled={isSigningOut}
            className="inline-flex items-center justify-center rounded-md px-4 py-2 text-sm font-medium transition-colors bg-destructive text-destructive-foreground hover:bg-destructive/90 disabled:opacity-50"
          >
            {isSigningOut ? 'Cerrando sesión...' : 'Cerrar Sesión'}
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
