/**
 * Chilean holidays - reads from PayrollHoliday table in the database.
 * Fallback to hardcoded list if no DB holidays found.
 */

import { prisma } from "@/lib/prisma";

export interface Holiday {
  date: string; // YYYY-MM-DD
  name: string;
  type: "irrenunciable" | "normal";
}

/**
 * Get holidays for a specific year from the database.
 */
export async function getHolidaysFromDB(tenantId: string, year: number): Promise<Holiday[]> {
  const dbHolidays = await prisma.payrollHoliday.findMany({
    where: { tenantId, year, isActive: true },
    orderBy: { date: "asc" },
  });

  if (dbHolidays.length > 0) {
    return dbHolidays.map((h) => ({
      date: h.date.toISOString().slice(0, 10),
      name: h.name,
      type: h.type as "irrenunciable" | "normal",
    }));
  }

  // Fallback: return empty (no holidays configured for this year)
  return [];
}

/**
 * Get holidays for a specific month from the database.
 */
export async function getMonthHolidaysFromDB(
  tenantId: string,
  year: number,
  month: number
): Promise<Holiday[]> {
  const startDate = new Date(Date.UTC(year, month - 1, 1));
  const endDate = new Date(Date.UTC(year, month, 0));

  const dbHolidays = await prisma.payrollHoliday.findMany({
    where: {
      tenantId,
      isActive: true,
      date: { gte: startDate, lte: endDate },
    },
    orderBy: { date: "asc" },
  });

  return dbHolidays.map((h) => ({
    date: h.date.toISOString().slice(0, 10),
    name: h.name,
    type: h.type as "irrenunciable" | "normal",
  }));
}

/**
 * Count holiday hours worked in a month based on attendance data and DB holidays.
 * Returns the number of hours worked on holidays.
 */
export async function countHolidayHoursWorked(
  tenantId: string,
  year: number,
  month: number,
  dailyDetail: Array<{ date: string; code: string }>,
  shiftHours: number = 12
): Promise<{ holidayHoursWorked: number; holidayDaysWorked: number; holidays: Holiday[] }> {
  const holidays = await getMonthHolidaysFromDB(tenantId, year, month);
  const holidayDates = new Set(holidays.map((h) => h.date));

  let holidayDaysWorked = 0;
  let holidayHoursWorked = 0;

  for (const day of dailyDetail) {
    if (holidayDates.has(day.date) && (day.code === "AS" || day.code === "ASISTIO")) {
      holidayDaysWorked++;
      holidayHoursWorked += shiftHours;
    }
  }

  return { holidayHoursWorked, holidayDaysWorked, holidays };
}

/**
 * Check if a specific date is a holiday for the given tenant.
 */
export async function isHoliday(tenantId: string, dateStr: string): Promise<Holiday | null> {
  const d = new Date(`${dateStr}T00:00:00.000Z`);
  const holiday = await prisma.payrollHoliday.findFirst({
    where: {
      tenantId,
      date: d,
      isActive: true,
    },
  });

  if (!holiday) return null;

  return {
    date: holiday.date.toISOString().slice(0, 10),
    name: holiday.name,
    type: holiday.type as "irrenunciable" | "normal",
  };
}
