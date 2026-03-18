export interface ServiceTemplatePosition {
  name: string;
  shiftStart: string;
  shiftEnd: string;
  shiftPattern: string;
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
        daysOfWeek: ["lunes", "martes", "miercoles", "jueves", "viernes", "sabado", "domingo"],
        guardsCount: 2,
        baseSalary: 600000,
        description: "Turno diurno 08:00-20:00, Lunes a Domingo",
      },
      {
        name: "Control de Acceso Nocturno",
        shiftStart: "20:00",
        shiftEnd: "08:00",
        shiftPattern: "4x4",
        daysOfWeek: ["lunes", "martes", "miercoles", "jueves", "viernes", "sabado", "domingo"],
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
        daysOfWeek: ["lunes", "martes", "miercoles", "jueves", "viernes", "sabado", "domingo"],
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
        daysOfWeek: ["lunes", "martes", "miercoles", "jueves", "viernes", "sabado", "domingo"],
        guardsCount: 2,
        baseSalary: 600000,
      },
    ],
  },
  {
    id: "12-5-finde",
    label: "12/5 + Fin de Semana",
    shortLabel: "12/5+FDS",
    description: "1 puesto L-V (5x2) + 1 puesto S-D (4x4), 3 guardias",
    icon: "Calendar",
    totalGuards: 3,
    positions: [
      {
        name: "Control de Acceso Diurno L-V",
        shiftStart: "08:00",
        shiftEnd: "20:00",
        shiftPattern: "5x2",
        daysOfWeek: ["lunes", "martes", "miercoles", "jueves", "viernes"],
        guardsCount: 1,
        baseSalary: 400000,
        description: "Turno diurno Lunes a Viernes",
      },
      {
        name: "Control de Acceso Fin de Semana",
        shiftStart: "08:00",
        shiftEnd: "20:00",
        shiftPattern: "4x4",
        daysOfWeek: ["sabado", "domingo"],
        guardsCount: 2,
        baseSalary: 600000,
        description: "Turno Sábado y Domingo",
      },
    ],
  },
];
