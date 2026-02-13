import { AlertTriangle, CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";

interface Alerta {
  id: string;
  tipo: string;
  severidad: string;
  mensaje: string;
  resuelta: boolean;
  createdAt: string;
}

export function AlertaCard({
  alerta,
  onResolve,
}: {
  alerta: Alerta;
  onResolve?: (id: string) => void;
}) {
  return (
    <div className="rounded-lg border border-border bg-card p-3 space-y-2">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <AlertTriangle className="h-4 w-4 text-amber-400" />
          <p className="text-sm font-medium">{alerta.tipo}</p>
        </div>
        <span className="text-[10px] uppercase tracking-wide text-muted-foreground">{alerta.severidad}</span>
      </div>
      <p className="text-xs text-muted-foreground">{alerta.mensaje}</p>
      <p className="text-[10px] text-muted-foreground">{new Date(alerta.createdAt).toLocaleString("es-CL")}</p>
      {!alerta.resuelta && onResolve && (
        <Button size="sm" variant="outline" className="h-8 text-xs" onClick={() => onResolve(alerta.id)}>
          <CheckCircle2 className="mr-1 h-3.5 w-3.5" />
          Resolver
        </Button>
      )}
    </div>
  );
}
