/**
 * SJT parte B: 6 ítems (INTEGRITY, RESPONSIBILITY).
 * REVIEW_PSICOLOGO: integridad es criterio clave OS-10 — validar cada escenario.
 */

import type { SeedItem } from "./v1-shared";
import { sjt } from "./v1-items-sjt-helper";

export const ITEMS_SJT_B: SeedItem[] = [
  sjt({
    order: 30,
    dimension: "INTEGRITY",
    prompt:
      "Un proveedor te ofrece $20.000 para que lo dejes pasar sin registrarlo. ¿Qué haces?",
    best: "D",
    alternatives: [
      { value: "A", label: "Acepto, total es algo chico.", score: 0.0 },
      { value: "B", label: "Le digo que no, pero no lo reporto para no generar problemas.", score: 0.3 },
      { value: "C", label: "Lo dejo pasar sin aceptar el dinero.", score: 0.1 },
      { value: "D", label: "Rechazo el dinero, lo registro normalmente y reporto el intento de soborno al supervisor.", score: 1.0 },
    ],
  }),
  sjt({
    order: 31,
    dimension: "INTEGRITY",
    prompt:
      "Encuentras una billetera con dinero en el estacionamiento durante tu ronda.",
    best: "A",
    alternatives: [
      { value: "A", label: "La entrego al supervisor y completo el formulario de objetos perdidos.", score: 1.0 },
      { value: "B", label: "Me quedo con el dinero y entrego la billetera vacía.", score: 0.0 },
      { value: "C", label: "La dejo donde está porque no es mi problema.", score: 0.3 },
      { value: "D", label: "Busco al dueño por mi cuenta y se la devuelvo sin reportar.", score: 0.6 },
    ],
  }),
  sjt({
    order: 32,
    dimension: "INTEGRITY",
    prompt:
      "Un compañero te pide que le marques la entrada y salida del turno porque va a llegar tarde pero necesita la hora completa.",
    best: "C",
    alternatives: [
      { value: "A", label: "Le marco, somos equipo.", score: 0.0 },
      { value: "B", label: "Le marco solo la entrada, la salida que la haga él.", score: 0.3 },
      { value: "C", label: "Le digo que no puedo hacerlo porque es falsear información, y le sugiero avisar al supervisor.", score: 1.0 },
      { value: "D", label: "Me hago el desentendido y no le respondo.", score: 0.6 },
    ],
  }),
  sjt({
    order: 33,
    dimension: "RESPONSIBILITY",
    prompt:
      "Debes hacer 4 rondas en tu turno de noche. A la tercera estás muy cansado.",
    best: "A",
    alternatives: [
      { value: "A", label: "Hago las 4 rondas completas y registro cada una con honestidad.", score: 1.0 },
      { value: "B", label: "Hago 3 y registro 4.", score: 0.0 },
      { value: "C", label: "Hago 3 y marco la cuarta como no realizada por cansancio.", score: 0.6 },
      { value: "D", label: "Avanzo menos en la ronda pero igual la registro.", score: 0.3 },
    ],
  }),
  sjt({
    order: 34,
    dimension: "RESPONSIBILITY",
    prompt:
      "El relevo no llegó a tu puesto y ya terminó tu turno. La central no contesta.",
    best: "D",
    alternatives: [
      { value: "A", label: "Me voy igual, mi turno terminó.", score: 0.0 },
      { value: "B", label: "Cierro el puesto con candado y me voy.", score: 0.3 },
      { value: "C", label: "Me quedo otros 30 minutos y si no llega, me voy.", score: 0.6 },
      { value: "D", label: "Me quedo en el puesto y sigo intentando comunicarme con la central hasta que llegue un relevo.", score: 1.0 },
    ],
  }),
  sjt({
    order: 35,
    dimension: "RESPONSIBILITY",
    prompt:
      "Descubres que olvidaste registrar un incidente de hace 2 turnos en la bitácora.",
    best: "B",
    alternatives: [
      { value: "A", label: "No lo registro para que no se note.", score: 0.0 },
      { value: "B", label: "Lo registro ahora con la fecha correcta y una nota indicando que fue registrado retroactivamente, y aviso al supervisor.", score: 1.0 },
      { value: "C", label: "Lo registro con la fecha de hoy para que cuadre con lo actual.", score: 0.3 },
      { value: "D", label: "Llamo al supervisor sin registrarlo aún.", score: 0.6 },
    ],
  }),
];
