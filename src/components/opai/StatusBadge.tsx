import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';

type Status = 'draft' | 'sent' | 'approved' | 'rejected' | 'viewed' | 'open' | 'won' | 'lost' | 'active' | 'inactive' | 'pending' | 'in_review' | 'postulante' | 'seleccionado' | 'contratado' | 'te' | 'inactivo' | 'solicitado' | 'en_curso' | 'realizado' | 'facturado';

interface StatusBadgeProps {
  status: Status | string;
  className?: string;
}

const STATUS_MAP: Record<Status, { label: string; variant: 'default' | 'secondary' | 'success' | 'warning' | 'destructive' | 'outline' }> = {
  draft: { label: 'Borrador', variant: 'secondary' },
  sent: { label: 'Enviada', variant: 'default' },
  approved: { label: 'Aprobada', variant: 'success' },
  rejected: { label: 'Rechazada', variant: 'destructive' },
  viewed: { label: 'Vista', variant: 'success' },
  open: { label: 'Abierto', variant: 'default' },
  won: { label: 'Ganado', variant: 'success' },
  lost: { label: 'Perdido', variant: 'destructive' },
  active: { label: 'Activo', variant: 'success' },
  inactive: { label: 'Inactivo', variant: 'secondary' },
  pending: { label: 'Pendiente', variant: 'warning' },
  in_review: { label: 'En revisión', variant: 'default' },
  postulante: { label: 'Postulante', variant: 'outline' },
  seleccionado: { label: 'Seleccionado', variant: 'default' },
  contratado: { label: 'Contratado', variant: 'success' },
  te: { label: 'Turno Extra', variant: 'secondary' },
  inactivo: { label: 'Inactivo', variant: 'warning' },
  solicitado: { label: 'Solicitado', variant: 'warning' },
  en_curso: { label: 'En curso', variant: 'default' },
  realizado: { label: 'Realizado', variant: 'success' },
  facturado: { label: 'Facturado', variant: 'secondary' },
};

/**
 * StatusBadge - Badge con mapping automático de estados
 * 
 * Mapea estados comunes (draft/sent/approved/etc.) a variantes de Badge.
 */
export function StatusBadge({ status, className }: StatusBadgeProps) {
  const normalized = status.toLowerCase() as Status;
  const config = STATUS_MAP[normalized] || { label: status, variant: 'secondary' as const };

  return (
    <Badge variant={config.variant} className={cn('gap-1', className)}>
      <span className="inline-flex h-1.5 w-1.5 rounded-full bg-current" />
      {config.label}
    </Badge>
  );
}
