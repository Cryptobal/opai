"use client";

import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Mail,
  Check,
  X,
  ChevronLeft,
  ChevronRight,
  Loader2,
} from "lucide-react";

type EmailLogItem = {
  id: string;
  asunto: string;
  tipo: string;
  trigger: string | null;
  destinatario: string;
  guardiaNombre: string;
  templateNombre: string | null;
  estado: string;
  abierto: boolean;
  createdAt: string;
};

interface EmailHistoryClientProps {
  tenantId: string;
}

const TIPO_BADGE: Record<string, { label: string; cls: string }> = {
  AUTOMATICO: { label: "Automático", cls: "bg-status-info-soft text-status-info-fg" },
  MANUAL_INDIVIDUAL: { label: "Individual", cls: "bg-muted text-muted-foreground" },
  MANUAL_MASIVO: { label: "Masivo", cls: "bg-purple-500/20 text-purple-400" },
};

const ESTADO_BADGE: Record<string, { label: string; cls: string }> = {
  PENDIENTE: { label: "Pendiente", cls: "bg-muted text-muted-foreground" },
  ENVIADO: { label: "Enviado", cls: "bg-status-warn-soft text-status-warn-fg" },
  ENTREGADO: { label: "Entregado", cls: "bg-status-info-soft text-status-info-fg" },
  ABIERTO: { label: "Abierto", cls: "bg-status-ok-soft text-status-ok-fg" },
  REBOTADO: { label: "Rebotado", cls: "bg-status-danger-soft text-status-danger-fg" },
  ERROR: { label: "Error", cls: "bg-status-danger-soft text-status-danger-fg" },
};

const TRIGGER_LABEL: Record<string, string> = {
  ACTIVACION: "Activación",
  CAMBIO_SITIO: "Cambio sitio",
  RECORDATORIO_48H: "Recordatorio 48h",
};

function formatDate(s: string): string {
  const d = new Date(s);
  return d.toLocaleDateString("es-CL", {
    day: "2-digit",
    month: "short",
    year: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default function EmailHistoryClient({ tenantId }: EmailHistoryClientProps) {
  const [data, setData] = useState<EmailLogItem[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [pageSize] = useState(20);

  const [tipoFilter, setTipoFilter] = useState("_all");
  const [estadoFilter, setEstadoFilter] = useState("_all");
  const [desde, setDesde] = useState("");
  const [hasta, setHasta] = useState("");

  void tenantId;

  const fetchHistory = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (tipoFilter && tipoFilter !== "_all") params.set("tipo", tipoFilter);
      if (estadoFilter && estadoFilter !== "_all") params.set("estado", estadoFilter);
      if (desde) params.set("desde", desde);
      if (hasta) params.set("hasta", hasta);
      params.set("page", String(page));
      params.set("pageSize", String(pageSize));

      const res = await fetch(`/api/personas/comunicaciones/history?${params}`);
      const json = await res.json();
      if (json.success) {
        setData(json.data);
        setTotal(json.total);
      } else {
        toast.error(json.error ?? "Error al cargar historial");
      }
    } catch {
      toast.error("Error de conexión");
    } finally {
      setLoading(false);
    }
  }, [tipoFilter, estadoFilter, desde, hasta, page, pageSize]);

  useEffect(() => {
    fetchHistory();
  }, [fetchHistory]);

  useEffect(() => {
    setPage(1);
  }, [tipoFilter, estadoFilter, desde, hasta]);

  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  return (
    <Card>
      <CardHeader className="pb-4">
        <CardTitle className="text-lg flex items-center gap-2">
          <Mail className="h-5 w-5" />
          Historial de Correos
        </CardTitle>
      </CardHeader>

      <CardContent className="space-y-4">
        {/* Filters */}
        <div className="flex flex-wrap items-end gap-3">
          <div>
            <label className="text-xs text-muted-foreground mb-1 block">Tipo</label>
            <Select value={tipoFilter} onValueChange={setTipoFilter}>
              <SelectTrigger className="w-36">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="_all">Todos</SelectItem>
                <SelectItem value="AUTOMATICO">Automático</SelectItem>
                <SelectItem value="MANUAL_INDIVIDUAL">Individual</SelectItem>
                <SelectItem value="MANUAL_MASIVO">Masivo</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <label className="text-xs text-muted-foreground mb-1 block">Estado</label>
            <Select value={estadoFilter} onValueChange={setEstadoFilter}>
              <SelectTrigger className="w-36">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="_all">Todos</SelectItem>
                <SelectItem value="PENDIENTE">Pendiente</SelectItem>
                <SelectItem value="ENVIADO">Enviado</SelectItem>
                <SelectItem value="ENTREGADO">Entregado</SelectItem>
                <SelectItem value="ABIERTO">Abierto</SelectItem>
                <SelectItem value="REBOTADO">Rebotado</SelectItem>
                <SelectItem value="ERROR">Error</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <label className="text-xs text-muted-foreground mb-1 block">Desde</label>
            <Input
              type="date"
              value={desde}
              onChange={(e) => setDesde(e.target.value)}
              className="w-40"
            />
          </div>
          <div>
            <label className="text-xs text-muted-foreground mb-1 block">Hasta</label>
            <Input
              type="date"
              value={hasta}
              onChange={(e) => setHasta(e.target.value)}
              className="w-40"
            />
          </div>
        </div>

        {/* Table */}
        {loading ? (
          <div className="flex items-center justify-center py-12 text-muted-foreground">
            <Loader2 className="h-5 w-5 animate-spin mr-2" />
            Cargando historial…
          </div>
        ) : data.length === 0 ? (
          <div className="text-center py-12 text-muted-foreground text-sm">
            No se encontraron correos
          </div>
        ) : (
          <div className="border rounded-md overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Asunto</TableHead>
                  <TableHead>Tipo</TableHead>
                  <TableHead>Trigger</TableHead>
                  <TableHead>Destinatario</TableHead>
                  <TableHead>Estado</TableHead>
                  <TableHead>Fecha</TableHead>
                  <TableHead className="text-center">Abierto</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.map((row) => {
                  const tipoBadge = TIPO_BADGE[row.tipo] ?? {
                    label: row.tipo,
                    cls: "bg-muted text-muted-foreground",
                  };
                  const estadoBadge = ESTADO_BADGE[row.estado] ?? {
                    label: row.estado,
                    cls: "bg-muted text-muted-foreground",
                  };
                  return (
                    <TableRow key={row.id}>
                      <TableCell className="font-medium max-w-[200px] truncate">
                        {row.asunto}
                      </TableCell>
                      <TableCell>
                        <Badge variant="secondary" className={tipoBadge.cls}>
                          {tipoBadge.label}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground">
                        {row.trigger ? (TRIGGER_LABEL[row.trigger] ?? row.trigger) : "–"}
                      </TableCell>
                      <TableCell>
                        <div className="text-sm">{row.guardiaNombre || "–"}</div>
                        <div className="text-xs text-muted-foreground">
                          {row.destinatario}
                        </div>
                      </TableCell>
                      <TableCell>
                        <Badge variant="secondary" className={estadoBadge.cls}>
                          {estadoBadge.label}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-xs whitespace-nowrap">
                        {formatDate(row.createdAt)}
                      </TableCell>
                      <TableCell className="text-center">
                        {row.abierto ? (
                          <Check className="h-4 w-4 text-status-ok-fg mx-auto" />
                        ) : (
                          <X className="h-4 w-4 text-muted-foreground mx-auto" />
                        )}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        )}

        {/* Pagination */}
        {total > 0 && (
          <div className="flex items-center justify-between text-sm">
            <span className="text-muted-foreground">
              {total} registro{total !== 1 ? "s" : ""} · Página {page} de {totalPages}
            </span>
            <div className="flex items-center gap-1">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page <= 1}
              >
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                disabled={page >= totalPages}
              >
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
