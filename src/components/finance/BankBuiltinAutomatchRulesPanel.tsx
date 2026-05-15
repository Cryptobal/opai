"use client";

import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { BookOpen, Info } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Documentación de solo lectura: motor fijo de autoconciliación (DTE, turnos
 * extra, import) frente a las reglas editables en la misma pestaña.
 */
export function BankBuiltinAutomatchRulesPanel() {
  return (
    <div className="space-y-4">
      <Card className="border-status-info-border bg-status-info-soft/30">
        <CardContent className="p-4 flex gap-3">
          <Info className="h-5 w-5 text-status-info-fg shrink-0 mt-0.5" />
          <div className="text-sm text-ds-text-2 space-y-1.5 min-w-0">
            <p className="font-medium text-foreground">
              Esto no se edita aquí: son reglas de producto en código
            </p>
            <p className="text-xs text-muted-foreground">
              El botón <strong>Auto-conciliar</strong> en Movimientos y{" "}
              <strong>Conciliar histórico</strong> aquí ejecutan el mismo motor
              en cadena. Lo que sí podés configurar en{" "}
              <span className="text-foreground font-medium">Mis reglas</span>{" "}
              son patrones de categorización / reconocimiento contable cuando no
              aplica un match DTE ni planilla TE.
            </p>
          </div>
        </CardContent>
      </Card>

      <div className="flex items-center gap-2 text-sm font-medium text-foreground">
        <BookOpen className="h-4 w-4 text-primary" />
        Orden fijo del motor (cada movimiento UNMATCHED)
      </div>

      <RuleBlock
        step={1}
        title="Cobro o pago contra DTE (SII)"
        tone="ok"
        bullets={[
          "Ingresos positivos: busca facturas emitidas pendientes (o marcadas PAID sin reconciliar cartola) con total exacto igual al monto del banco, en ventana de fechas desde el emisión ±90/+30 días.",
          "Egresos negativos: busca documentos recibidos (facturas de proveedor) pendientes con el mismo criterio de monto exacto y ventana.",
          "Si hay un solo candidato por monto, se concilia. Si hay varios, el motor intenta desambiguar cuando el RUT del contraparte aparece embebido en descripción/referencia (comparación por dígitos, tolera puntos/guiones y ceros).",
          "Si siguen ambiguos o no hay candidato, sigue el paso 2.",
        ]}
      />

      <RuleBlock
        step={2}
        title="Pago de turno extra (planilla TE)"
        tone="info"
        bullets={[
          "Solo egresos (monto < 0). No aplica a transferencias que parezcan TGR / Tesorería (finiquitos).",
          "Busca un ítem en lote de pago TE (OpsPagoTeItem) pendiente con monto CLP exactamente igual al valor absoluto del movimiento.",
          "El RUT del guardia (persona en OPAI) debe poder alinearse con la glosa del banco (misma lógica flexible de dígitos que en DTE).",
          "La fecha del movimiento debe caer entre semana del lote −7 días y +90 días desde el inicio de semana del lote.",
          "Si en ±7 días hay una liquidación de sueldo del mismo guardia con neto muy parecido al monto, se descarta (evita confundir sueldo con TE).",
          "Match correcto: vincula el movimiento al ítem TE, marca pagado el turno extra y deja trazabilidad al turno extra → instalación asociada en operaciones.",
          "Importante: sin ítem TE pendiente con ese monto en planilla, no habrá autoconciliación TE aunque el RUT del guardia sea correcto.",
        ]}
      />

      <RuleBlock
        step={3}
        title="Reglas configurables (esta pestaña, lista inferior)"
        tone="neutral"
        bullets={[
          "Condiciones sobre descripción, referencia, monto, RUT en regla. Pueden marcar la cuenta contable y dejar el movimiento como «Reconocido» para que autorices, o conciliar directo si no requieren revisión.",
          "Solo se evalúan si los pasos 1 y 2 no dejaron el movimiento conciliado (y en algunos casos de «sin candidato» o «ambiguo» según el servicio).",
        ]}
      />

      <p className="text-xs text-muted-foreground px-0.5">
        Los textos resumen el comportamiento implementado en{" "}
        <code className="text-[12px] font-mono bg-muted px-1 rounded">
          auto-match-payment.service.ts
        </code>{" "}
        y{" "}
        <code className="text-[12px] font-mono bg-muted px-1 rounded">
          auto-match-turno-extra.service.ts
        </code>
        . Si el negocio cambia, hay que ajustar código o ampliar reglas
        configurables.
      </p>
    </div>
  );
}

function RuleBlock(props: {
  step: number;
  title: string;
  bullets: string[];
  tone: "ok" | "info" | "neutral";
}) {
  const toneClass =
    props.tone === "ok"
      ? "border-status-ok-border bg-status-ok-soft/25"
      : props.tone === "info"
        ? "border-ds-border-default bg-ds-surface-2/80"
        : "border-ds-border-subtle bg-ds-surface-2/50";
  return (
    <Card className={cn("border", toneClass)}>
      <CardContent className="p-4 space-y-2">
        <div className="flex items-center gap-2 flex-wrap">
          <Badge variant="outline" className="text-xs font-mono">
            {props.step}
          </Badge>
          <h3 className="text-sm font-semibold text-foreground">{props.title}</h3>
        </div>
        <ul className="list-disc pl-5 space-y-1.5 text-xs text-ds-text-2">
          {props.bullets.map((b, i) => (
            <li key={i}>{b}</li>
          ))}
        </ul>
      </CardContent>
    </Card>
  );
}
