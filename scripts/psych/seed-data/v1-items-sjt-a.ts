/**
 * SJT parte A: 9 ítems (IMPULSE_CONTROL, FRUSTRATION_TOLERANCE, STRESS_MANAGEMENT).
 * REVIEW_PSICOLOGO: validar jerarquía de alternativas y realismo de escenarios.
 */

import type { SeedItem } from "./v1-shared";
import { sjt } from "./v1-items-sjt-helper";

export const ITEMS_SJT_A: SeedItem[] = [
  sjt({
    order: 21,
    dimension: "IMPULSE_CONTROL",
    prompt:
      "Estás en el acceso de un edificio. Un residente llega apurado, te grita y te empuja porque no encuentra su tarjeta. ¿Qué haces?",
    best: "B",
    alternatives: [
      { value: "A", label: "Le respondo con firmeza y le digo que no me hable así.", score: 0.3 },
      { value: "B", label: "Me mantengo tranquilo, lo saludo por su nombre y le pido un segundo para verificar en el sistema.", score: 1.0 },
      { value: "C", label: "Lo empujo de vuelta para que aprenda.", score: 0.0 },
      { value: "D", label: "No respondo y lo dejo pasar sin verificar.", score: 0.2 },
    ],
  }),
  sjt({
    order: 22,
    dimension: "IMPULSE_CONTROL",
    prompt:
      "En una tienda retail, un cliente te insulta porque no lo dejas ingresar con una mochila grande según protocolo. ¿Cuál es tu mejor reacción?",
    best: "C",
    alternatives: [
      { value: "A", label: "Le digo que no me pagan para aguantar insultos y me voy del puesto.", score: 0.0 },
      { value: "B", label: "Lo enfrento verbalmente hasta que se calle.", score: 0.3 },
      { value: "C", label: "Le explico el protocolo con voz calmada y ofrezco guardar la mochila en el casillero.", score: 1.0 },
      { value: "D", label: "Lo ignoro y sigo con otro cliente.", score: 0.6 },
    ],
  }),
  sjt({
    order: 23,
    dimension: "IMPULSE_CONTROL",
    prompt:
      "Durante una ronda nocturna, descubres a un compañero durmiendo. Al despertarlo, te responde con garabatos. ¿Qué haces?",
    best: "D",
    alternatives: [
      { value: "A", label: "Le pego un combo para que no me falte el respeto.", score: 0.0 },
      { value: "B", label: "Lo dejo pasar para no generar conflicto.", score: 0.3 },
      { value: "C", label: "Le respondo con garabatos y anoto el hecho.", score: 0.3 },
      { value: "D", label: "Mantengo la calma, documento el hallazgo y lo reporto al supervisor según protocolo.", score: 1.0 },
    ],
  }),
  sjt({
    order: 24,
    dimension: "FRUSTRATION_TOLERANCE",
    prompt:
      "Has pedido a la empresa un cambio de turno hace 3 semanas y aún no te responden. ¿Qué haces?",
    best: "B",
    alternatives: [
      { value: "A", label: "Dejo de asistir hasta que me respondan.", score: 0.0 },
      { value: "B", label: "Envío un mensaje formal a RRHH pidiendo una fecha concreta y sigo cumpliendo mi turno.", score: 1.0 },
      { value: "C", label: "Reclamo públicamente en el grupo de WhatsApp del equipo.", score: 0.3 },
      { value: "D", label: "Espero otra semana sin hacer nada.", score: 0.6 },
    ],
  }),
  sjt({
    order: 25,
    dimension: "FRUSTRATION_TOLERANCE",
    prompt:
      "Llevas 3 horas revisando autos en el acceso. El sistema se cae y debes anotar todo a mano. ¿Cómo reaccionas?",
    best: "A",
    alternatives: [
      { value: "A", label: "Saco mi libreta y sigo el proceso manual hasta que vuelva el sistema.", score: 1.0 },
      { value: "B", label: "Llamo al supervisor para que venga a ayudar y mientras dejo pasar sin registrar.", score: 0.3 },
      { value: "C", label: "Dejo de revisar hasta que vuelva el sistema.", score: 0.0 },
      { value: "D", label: "Anoto solo los autos que se ven sospechosos.", score: 0.6 },
    ],
  }),
  sjt({
    order: 26,
    dimension: "FRUSTRATION_TOLERANCE",
    prompt:
      "Un residente ya te reclamó tres veces por lo mismo y siempre vuelve con lo mismo. ¿Qué haces la cuarta vez?",
    best: "C",
    alternatives: [
      { value: "A", label: "Le digo que ya me tiene chato con el tema.", score: 0.0 },
      { value: "B", label: "Lo atiendo de mala gana.", score: 0.3 },
      { value: "C", label: "Lo escucho con paciencia, le repito la respuesta con calma y le ofrezco escalarlo a administración.", score: 1.0 },
      { value: "D", label: "Le digo que no es mi problema y lo derivo.", score: 0.6 },
    ],
  }),
  sjt({
    order: 27,
    dimension: "STRESS_MANAGEMENT",
    prompt:
      "En tu puesto de banco escuchas un grito fuerte en la calle. Las cámaras muestran una pelea cerca. ¿Cuál es tu primera acción?",
    best: "A",
    alternatives: [
      { value: "A", label: "Aseguro la puerta, aviso a la central por radio y observo sin intervenir hasta recibir instrucciones.", score: 1.0 },
      { value: "B", label: "Salgo corriendo a separar a los involucrados.", score: 0.3 },
      { value: "C", label: "Grabo con mi celular desde dentro.", score: 0.6 },
      { value: "D", label: "Me quedo quieto esperando que pase solo.", score: 0.0 },
    ],
  }),
  sjt({
    order: 28,
    dimension: "STRESS_MANAGEMENT",
    prompt:
      "Suena la alarma de incendio del edificio. Ves humo en el pasillo del segundo piso.",
    best: "D",
    alternatives: [
      { value: "A", label: "Subo a apagar el fuego con el extintor de mi puesto.", score: 0.3 },
      { value: "B", label: "Grito que es falsa alarma para no asustar.", score: 0.0 },
      { value: "C", label: "Apago la alarma y reviso solo el piso afectado.", score: 0.3 },
      { value: "D", label: "Activo el plan de evacuación, llamo a bomberos y dirijo a los residentes a la zona segura.", score: 1.0 },
    ],
  }),
  sjt({
    order: 29,
    dimension: "STRESS_MANAGEMENT",
    prompt:
      "Llevas 10 horas de turno y aún te quedan 2. Te sientes muy cansado y te cuesta concentrarte.",
    best: "B",
    alternatives: [
      { value: "A", label: "Me duermo un rato porque nadie se dará cuenta.", score: 0.0 },
      { value: "B", label: "Aviso al supervisor de mi estado y pido una pausa corta para lavarme la cara y seguir alerta.", score: 1.0 },
      { value: "C", label: "Tomo bebidas energéticas sin avisar.", score: 0.6 },
      { value: "D", label: "Abandono el puesto y me voy a la casa.", score: 0.3 },
    ],
  }),
];
