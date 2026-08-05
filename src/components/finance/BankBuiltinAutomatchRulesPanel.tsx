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
              son patrones que apuntan a una{" "}
              <span className="text-foreground font-medium">cuenta contable</span>{" "}
              o directamente a una{" "}
              <span className="text-foreground font-medium">
                fila del flujo de caja
              </span>{" "}
              cuando no aplica un match DTE ni planilla TE.
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
        title="Pago de turno extra (planilla TE o TE operativo)"
        tone="info"
        bullets={[
          "Solo egresos (monto < 0). No aplica a transferencias que parezcan TGR / Tesorería (finiquitos).",
          "Si hay ítems en lote de pago TE (OpsPagoTeItem) pendientes con monto CLP exactamente igual al valor absoluto del movimiento, se concilia contra la planilla: RUT del guardia en glosa (misma lógica flexible que DTE), fecha del movimiento entre inicio de semana del lote −7 días y +90 días, descarte si en ±7 días hay liquidación de sueldo del mismo guardia con neto muy parecido al monto.",
          "Si no hay ningún ítem de planilla pendiente con ese monto y el egreso es menor a $300.000, se intenta conciliar contra un OpsTurnoExtra aprobado aún no pagado con el mismo monto, mismo guardia (RUT en glosa y cuerpo de RUT coherente con persona natural), y fecha del movimiento entre la fecha del turno −7 y +120 días. El vínculo queda como TE_TURNO (trazabilidad a la instalación vía el turno).",
          "Match correcto: marca pagado el turno extra y deja el vínculo en banca. Con planilla también se actualiza el ítem y el cierre del lote si corresponde.",
        ]}
      />

      <RuleBlock
        step={3}
        title="Reglas configurables (esta pestaña, lista inferior)"
        tone="neutral"
        bullets={[
          "Condiciones sobre descripción, referencia, monto, RUT en regla. Pueden apuntar a una cuenta contable o a una fila del flujo de caja, y dejar el movimiento como «Reconocido» para que autorices, o conciliar directo si no requieren revisión.",
          "Solo se evalúan si los pasos 1 y 2 no dejaron el movimiento conciliado (y en algunos casos de «sin candidato» o «ambiguo» según el servicio).",
        ]}
      />

      <RuleBlock
        step={4}
        title="Cascada por RUT de la contraparte"
        tone="info"
        bullets={[
          "Se aplica cuando se clasifica un movimiento desde la bandeja de la planilla.",
          "Orden fijo: (1) regla configurada para ese RUT — siempre gana; (2) RUT 61.808.000-5 (Tesorería General de la República) → pide elegir entre F29, finiquito o convenio, nunca se auto-aplica; (3) RUT con cuerpo menor a 50.000.000 = persona natural → ítem de nómina pendiente que calce por monto, o en su defecto la fila «Turnos extra»; (4) RUT con cuerpo igual o mayor a 50.000.000 = empresa → factura de proveedor pendiente que calce por RUT y monto dentro de la tolerancia del tenant; (5) sin coincidencia → el movimiento queda en la bandeja.",
          "El corte en 50.000.000 corresponde a los rangos de RUT chilenos y no es configurable; para forzar un destino distinto, crear una regla de RUT, que tiene precedencia sobre toda la cascada.",
        ]}
      />

      <p className="text-xs text-muted-foreground px-0.5">
        Los textos resumen el comportamiento implementado en{" "}
        <code className="text-[12px] font-mono bg-muted px-1 rounded">
          auto-match-payment.service.ts
        </code>
        ,{" "}
        <code className="text-[12px] font-mono bg-muted px-1 rounded">
          auto-match-turno-extra.service.ts
        </code>{" "}
        y{" "}
        <code className="text-[12px] font-mono bg-muted px-1 rounded">
          flow-classify.service.ts
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
