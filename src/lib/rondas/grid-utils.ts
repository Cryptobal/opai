/**
 * Pure utility functions for the CN grid — safe for client-side import.
 */

/**
 * Generate dynamic time slots from shiftStart+1h to shiftEnd.
 * Handles midnight crossing.
 */
export function generateTimeSlots(shiftStart: string, shiftEnd: string): string[] {
  const [startH] = shiftStart.split(":").map(Number);
  const [endH] = shiftEnd.split(":").map(Number);

  const slots: string[] = [];
  let h = (startH + 1) % 24; // start 1 hour after shift start (arrival hour)

  const maxSlots = 24; // safety cap
  let count = 0;
  while (h !== endH && count < maxSlots) {
    slots.push(`${String(h).padStart(2, "0")}:00`);
    h = (h + 1) % 24;
    count++;
  }

  return slots;
}
