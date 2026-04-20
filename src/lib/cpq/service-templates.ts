export interface ServiceTemplatePosition {
  name: string;
  shiftStart: string;
  shiftEnd: string;
  shiftPattern: string;
  /** Si se define, elige el rol en catálogo aunque `shiftPattern` sea otro (p. ej. turno 4x4 pero rol 2x5 para Control de Acceso). */
  rolShiftPattern?: string;
  daysOfWeek: string[];
  guardsCount: number;
  baseSalary: number;
  description?: string;
}

export interface ServiceTemplate {
  id: string;
  label: string;
  shortLabel: string;
  description: string;
  icon: string;
  totalGuards: number;
  positions: ServiceTemplatePosition[];
}

export const SERVICE_TEMPLATES: ServiceTemplate[] = [
  {
    id: "24-7",
    label: "24/7 Lun-Dom",
    shortLabel: "24/7",
    description: "2 puestos (día + noche), 4 guardias, turno 4x4",
    icon: "ShieldCheck",
    totalGuards: 4,
    positions: [
      {
        name: "Control de Acceso Diurno",
        shiftStart: "08:00",
        shiftEnd: "20:00",
        shiftPattern: "4x4",
        daysOfWeek: ["Lun", "Mar", "Mié", "Jue", "Vie", "Sáb", "Dom"],
        guardsCount: 2,
        baseSalary: 600000,
        description: "Turno diurno 08:00-20:00, Lunes a Domingo",
      },
      {
        name: "Control de Acceso Nocturno",
        shiftStart: "20:00",
        shiftEnd: "08:00",
        shiftPattern: "4x4",
        daysOfWeek: ["Lun", "Mar", "Mié", "Jue", "Vie", "Sáb", "Dom"],
        guardsCount: 2,
        baseSalary: 600000,
        description: "Turno nocturno 20:00-08:00, Lunes a Domingo",
      },
    ],
  },
  {
    id: "12-7-dia",
    label: "12/7 Día Lun-Dom",
    shortLabel: "12/7 Día",
    description: "1 puesto diurno, 2 guardias, turno 4x4",
    icon: "Sun",
    totalGuards: 2,
    positions: [
      {
        name: "Control de Acceso Diurno",
        shiftStart: "08:00",
        shiftEnd: "20:00",
        shiftPattern: "4x4",
        daysOfWeek: ["Lun", "Mar", "Mié", "Jue", "Vie", "Sáb", "Dom"],
        guardsCount: 2,
        baseSalary: 600000,
      },
    ],
  },
  {
    id: "12-7-noche",
    label: "12/7 Noche Lun-Dom",
    shortLabel: "12/7 Noche",
    description: "1 puesto nocturno, 2 guardias, turno 4x4",
    icon: "Moon",
    totalGuards: 2,
    positions: [
      {
        name: "Control de Acceso Nocturno",
        shiftStart: "20:00",
        shiftEnd: "08:00",
        shiftPattern: "4x4",
        daysOfWeek: ["Lun", "Mar", "Mié", "Jue", "Vie", "Sáb", "Dom"],
        guardsCount: 2,
        baseSalary: 600000,
      },
    ],
  },
  {
    id: "12-7-finde",
    label: "12/7 + Fin de Semana",
    shortLabel: "12/7+FDS",
    description: "1 puesto nocturno 4x4 Lun-Dom (2 guardias) + 1 puesto diurno 5x2 L-V (1 guardia)",
    icon: "CalendarClock",
    totalGuards: 3,
    positions: [
      {
        name: "Control de Acceso Nocturno",
        shiftStart: "20:00",
        shiftEnd: "08:00",
        shiftPattern: "4x4",
        daysOfWeek: ["Lun", "Mar", "Mié", "Jue", "Vie", "Sáb", "Dom"],
        guardsCount: 2,
        baseSalary: 600000,
        description: "Turno nocturno 20:00-08:00, Lunes a Domingo",
      },
      {
        name: "Control de Acceso Diurno L-V",
        shiftStart: "08:00",
        shiftEnd: "20:00",
        shiftPattern: "5x2",
        daysOfWeek: ["Lun", "Mar", "Mié", "Jue", "Vie"],
        guardsCount: 1,
        baseSalary: 400000,
        description: "Turno diurno Lunes a Viernes",
      },
    ],
  },
];
