/**
 * Resolución de la acción primaria del lector (isla móvil + barra desktop).
 *
 * Regla (misma lógica que vivía inline en CorreoReplyBox): hay a quién
 * responder cuando el hilo trae un destinatario de respuesta (`to`) o un
 * conjunto "responder a todos" (`replyAll`). Sin eso — hilos de un remitente
 * `no-reply` o solo de enviados — la primaria pasa a `Reenviar`.
 */
import type { ComposerMode, ReplyAll } from "./CorreoComposerBox";

export type CorreoPrimaryActionInput = {
  to: string[];
  replyAll: ReplyAll | null;
};

export type CorreoPrimaryAction = {
  /** Modo con el que se abre el composer al tocar la primaria. */
  mode: ComposerMode;
  /** Etiqueta de la píldora ("Responder" / "Reenviar"). */
  label: string;
  /** Hay destinatario de respuesta (o replyAll) → Responder disponible. */
  canReply: boolean;
  /** "A todos" tiene sentido: hay CC o destinatarios extra sobre `to`. */
  replyAllAvailable: boolean;
};

export function resolveCorreoPrimaryAction({
  to,
  replyAll,
}: CorreoPrimaryActionInput): CorreoPrimaryAction {
  const canReply = to.length > 0 || Boolean(replyAll);
  const replyAllAvailable = Boolean(
    replyAll &&
      (replyAll.cc.length > 0 ||
        replyAll.to.some((e) => !to.includes(e)) ||
        replyAll.to.length !== to.length),
  );
  return {
    mode: canReply ? "reply" : "forward",
    label: canReply ? "Responder" : "Reenviar",
    canReply,
    replyAllAvailable,
  };
}
