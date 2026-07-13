/**
 * Block Kit de "Movimientos bancarios recibidos" CON acciones de conciliación.
 *
 * Reemplaza el render genérico del canal (vía `data.__customBlocks`, ver
 * dispatch.ts) por una tarjeta donde cada movimiento trae botones para
 * conciliar sin entrar a la web:
 *   - Con match exacto de monto → "Conciliar con F-XXXX" (directo) + "Otra cuenta".
 *   - Sin match → "Asignar cuenta contable" (abre modal).
 *
 * Este módulo SOLO arma bloques; no toca datos ni servicios. El cómputo del
 * match vive en `slack-movements-payload.ts` y la ejecución en
 * `actions/bank-reconcile.ts`.
 */

import { shortDate, signedCLP, buildBankMovementsBody } from "@/lib/finance/bank-movements-summary";
import { formatCLP } from "@/lib/utils";

/**
 * Umbral de layout: por sobre esto NO incrustamos botones por movimiento
 * (un lote gigante se concilia mejor en la web, y Slack limita bloques/mensaje).
 * También es el corto-circuito de cómputo de match en el payload builder.
 */
export const MAX_INLINE = 12;

/** Match exacto (mismo monto) contra un DTE candidato. */
export interface MovementMatch {
  dteId: string;
  folio: number;
  dteType: number;
  /** Dirección del DTE candidato: ISSUED = venta (abono), RECEIVED = compra (cargo). */
  direction: "ISSUED" | "RECEIVED";
  counterpartyName: string;
  amountPending: number;
}

export interface MovementForBlocks {
  bankTxId: string;
  /** ISO "YYYY-MM-DD". */
  transactionDate: string;
  description: string;
  /** CLP con signo: positivo = abono, negativo = cargo. */
  amount: number;
  match?: MovementMatch | null;
}

export interface BankMovementsBlocksInput {
  summary: string;
  accountLabel: string;
  movements: MovementForBlocks[];
  /** Saldo total de la cuenta tras estos movimientos (CLP). Si viene, se
   *  muestra en el encabezado ("Saldo cuenta: $X"). */
  accountBalanceClp?: number | null;
}

const DESC_MAX = 70;
const pt = (text: string) => ({ type: "plain_text" as const, text: text.slice(0, 75), emoji: true });
const cleanDesc = (d: string) => d.trim().replace(/\s+/g, " ").slice(0, DESC_MAX);

/** cargo → factura de compra (proveedor); abono → factura emitida (cliente). */
function directionLabel(amount: number): string {
  return amount < 0 ? "Factura de compra" : "Factura emitida";
}

function netOf(movements: MovementForBlocks[]): number {
  return movements.reduce((acc, m) => acc + (Number.isFinite(m.amount) ? m.amount : 0), 0);
}

function headerBlocks(
  summary: string,
  movements: MovementForBlocks[],
  accountBalanceClp?: number | null,
): unknown[] {
  const balanceLine =
    accountBalanceClp != null && Number.isFinite(accountBalanceClp)
      ? `\n*Saldo cuenta* ${formatCLP(accountBalanceClp)}`
      : "";
  return [
    { type: "header", text: pt("🏦 Movimientos bancarios") },
    {
      type: "section",
      text: {
        type: "mrkdwn",
        text: `${summary}\n*Neto* ${signedCLP(netOf(movements))}${balanceLine}`,
      },
    },
    { type: "divider" },
  ];
}

/**
 * IDs de bloque estables por movimiento — el handler los usa para localizar y
 * reemplazar el grupo de UN movimiento al resolverlo (ver bank-reconcile-message.ts).
 */
export const secBlockId = (txId: string) => `bankreconc_sec_${txId}`;
export const ctxBlockId = (txId: string) => `bankreconc_ctx_${txId}`;
export const actBlockId = (txId: string) => `bankreconc_${txId}`;

/** Bloques (section + context de match + actions) de UN movimiento sin resolver.
 *  Exportado para re-renderizar el estado pendiente tras un "Deshacer". */
export function renderMovementBlocks(m: MovementForBlocks): unknown[] {
  const line = `*${shortDate(m.transactionDate)}*  ${cleanDesc(m.description)}  ·  *${signedCLP(m.amount)}*`;
  const blocks: unknown[] = [
    { type: "section", block_id: secBlockId(m.bankTxId), text: { type: "mrkdwn", text: line } },
  ];

  if (m.match) {
    const kind = m.match.direction === "RECEIVED" ? "compra" : "venta";
    blocks.push({
      type: "context",
      block_id: ctxBlockId(m.bankTxId),
      elements: [{
        type: "mrkdwn",
        text: `↳ Coincide con ${kind} *F-${m.match.folio}* · ${m.match.counterpartyName} · pendiente ${signedCLP(m.match.amountPending)}`,
      }],
    });
    blocks.push({
      type: "actions",
      block_id: actBlockId(m.bankTxId),
      elements: [
        {
          type: "button",
          action_id: "bankreconc_confirm",
          style: "primary",
          text: pt(`Conciliar con F-${m.match.folio}`),
          value: JSON.stringify({ txId: m.bankTxId, dteId: m.match.dteId }),
        },
        {
          type: "button",
          action_id: "bankreconc_manual",
          text: pt("Otra cuenta"),
          value: m.bankTxId,
        },
      ],
    });
  } else {
    blocks.push({
      type: "context",
      block_id: ctxBlockId(m.bankTxId),
      elements: [{ type: "mrkdwn", text: `↳ ${directionLabel(m.amount)} · sin match exacto` }],
    });
    blocks.push({
      type: "actions",
      block_id: actBlockId(m.bankTxId),
      elements: [{
        type: "button",
        action_id: "bankreconc_manual",
        text: pt("Asignar cuenta contable"),
        value: m.bankTxId,
      }],
    });
  }
  return blocks;
}

/** Arma la tarjeta completa. Lotes > MAX_INLINE caen al layout resumido. */
export function buildBankMovementsBlocks(input: BankMovementsBlocksInput): unknown[] {
  const { summary, movements, accountBalanceClp } = input;
  const blocks = headerBlocks(summary, movements, accountBalanceClp);

  if (movements.length > MAX_INLINE) {
    blocks.push({
      type: "context",
      elements: [{
        type: "mrkdwn",
        text: `Son ${movements.length} movimientos — conciliá el lote desde *Bancos → Movimientos* en OPAI.`,
      }],
    });
    return blocks;
  }

  for (const m of movements) blocks.push(...renderMovementBlocks(m));
  return blocks;
}

/** Texto de fallback (accesibilidad / notificaciones sin Block Kit). */
export function buildBankMovementsText(input: BankMovementsBlocksInput): string {
  const body = buildBankMovementsBody({
    summary: input.summary,
    movements: input.movements.map((m) => ({
      transactionDate: m.transactionDate,
      description: m.description,
      amount: m.amount,
    })),
  });
  const { accountBalanceClp } = input;
  return accountBalanceClp != null && Number.isFinite(accountBalanceClp)
    ? `${body}\n\nSaldo cuenta: ${formatCLP(accountBalanceClp)}`
    : body;
}
