export interface NextSlotsInput {
  from: Date;
  to: Date;
  diasSemana: number[]; // 0..6
  horaInicio: string; // HH:MM
  horaFin: string; // HH:MM
  frecuenciaMinutos: number;
}

function parseTime(hhmm: string): { h: number; m: number } {
  const [h, m] = hhmm.split(":").map(Number);
  return { h, m };
}

export function buildScheduleSlots(input: NextSlotsInput): Date[] {
  const slots: Date[] = [];
  const cursor = new Date(input.from);
  const start = parseTime(input.horaInicio);
  const end = parseTime(input.horaFin);

  while (cursor <= input.to) {
    const day = cursor.getUTCDay();
    if (input.diasSemana.includes(day)) {
      const startTs = new Date(Date.UTC(
        cursor.getUTCFullYear(),
        cursor.getUTCMonth(),
        cursor.getUTCDate(),
        start.h,
        start.m,
        0,
        0,
      ));

      let endTs = new Date(Date.UTC(
        cursor.getUTCFullYear(),
        cursor.getUTCMonth(),
        cursor.getUTCDate(),
        end.h,
        end.m,
        0,
        0,
      ));
      if (endTs <= startTs) {
        endTs = new Date(endTs.getTime() + 24 * 60 * 60 * 1000);
      }

      for (
        let ts = startTs.getTime();
        ts <= endTs.getTime();
        ts += input.frecuenciaMinutos * 60 * 1000
      ) {
        const at = new Date(ts);
        if (at >= input.from && at <= input.to) slots.push(at);
      }
    }

    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }

  return slots;
}
