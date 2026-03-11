export interface GuardTourStep {
  title: string;
  description: string;
  icon: string;
  bgColor: string;
}

export const GUARD_TOUR_STEPS: GuardTourStep[] = [
  {
    title: "Bienvenido",
    description:
      "Este es tu portal de rondas. Desde aqui haces tus recorridos de seguridad. Es muy facil, te explicamos paso a paso.",
    icon: "Shield",
    bgColor: "from-teal-900/40 to-teal-950/20",
  },
  {
    title: "Tus rondas del dia",
    description:
      "En la pantalla principal ves las rondas que tienes asignadas. Cuando sea la hora, aparece el boton verde 'Iniciar Ronda'. Solo tocalo y empieza a caminar.",
    icon: "ClipboardList",
    bgColor: "from-blue-900/40 to-blue-950/20",
  },
  {
    title: "El mapa y tus puntos",
    description:
      "Al iniciar la ronda veras un mapa con todos los puntos que debes recorrer. El punto azul eres TU. Los puntos blancos son los que te faltan. Los verdes ya los marcaste. Solo camina hacia el siguiente punto.",
    icon: "Map",
    bgColor: "from-emerald-900/40 to-emerald-950/20",
  },
  {
    title: "Se abre solo al llegar",
    description:
      "Cuando te acerques a un punto, el sistema detecta que llegaste y se abre automaticamente para que lo marques. No tienes que buscar nada — solo camina y el punto aparece.",
    icon: "Radar",
    bgColor: "from-cyan-900/40 to-cyan-950/20",
  },
  {
    title: "Ronda libre",
    description:
      "Si no tienes rondas programadas, puedes hacer una ronda libre. Camina por donde necesites y toca 'Marcar GPS' cada vez que quieras registrar un punto. Cada punto queda marcado en el mapa con tu ubicacion.",
    icon: "Route",
    bgColor: "from-violet-900/40 to-violet-950/20",
  },
  {
    title: "Tu puntaje de confianza",
    description:
      "Al terminar cada ronda recibes un puntaje de 0 a 100. Si llegas a todos los puntos, a tiempo, y usas GPS bien — tu puntaje sube. Tu supervisor ve este puntaje, asi que mientras mas alto mejor.",
    icon: "Trophy",
    bgColor: "from-yellow-900/40 to-yellow-950/20",
  },
  {
    title: "Reportar un incidente",
    description:
      "Si ves algo raro en tu recorrido (puerta abierta, vidrio roto, persona sospechosa), toca 'Incidente' en la barra de abajo. Puedes escribir que paso y sacar foto. Llega directo a central.",
    icon: "FileWarning",
    bgColor: "from-amber-900/40 to-amber-950/20",
  },
  {
    title: "Boton de panico",
    description:
      "Si estas en peligro, toca el boton rojo 'Panico' en la barra de abajo y mantenlo presionado 5 segundos. Central recibe tu alerta con tu ubicacion exacta al instante.",
    icon: "AlertTriangle",
    bgColor: "from-red-900/40 to-red-950/20",
  },
  {
    title: "Chat",
    description:
      "Puedes hablar con central y tu equipo por el chat. Si necesitas ayuda o quieres reportar algo, escribe por aqui.",
    icon: "MessageCircle",
    bgColor: "from-purple-900/40 to-purple-950/20",
  },
];
