/**
 * Date and Week utilities for Saturday-Friday reporting periods in Asia/Kolkata timezone.
 *
 * Rules:
 * - Start day of reporting week: Saturday (day 6)
 * - End day of reporting week: Friday (day 5)
 * - Dates formatted consistently as DD/MM/YYYY in the UI, and YYYY-MM-DD for ISO storage.
 */

export interface WeekBounds {
  startDate: string; // YYYY-MM-DD (Saturday)
  endDate: string;   // YYYY-MM-DD (Friday)
  displayRange: string; // DD/MM/YYYY–DD/MM/YYYY
  days: string[];    // Array of 7 dates [Saturday, Sunday, Monday, Tuesday, Wednesday, Thursday, Friday]
}

/**
 * Format a Date or YYYY-MM-DD string into DD/MM/YYYY
 */
export function formatDateDisplay(dateInput: string | Date): string {
  if (!dateInput) return '';
  const str = typeof dateInput === 'string' ? dateInput.split('T')[0] : dateInput.toISOString().split('T')[0];
  const [year, month, day] = str.split('-');
  if (!year || !month || !day) return str;
  return `${day.padStart(2, '0')}/${month.padStart(2, '0')}/${year}`;
}

/**
 * Parse DD/MM/YYYY into YYYY-MM-DD
 */
export function parseDisplayDateToISO(displayDate: string): string {
  const parts = displayDate.split('/');
  if (parts.length !== 3) return displayDate;
  const [day, month, year] = parts;
  return `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
}

/**
 * Returns today's date in YYYY-MM-DD using Asia/Kolkata timezone
 */
export function getTodayKolkataISO(): string {
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Kolkata',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
  return formatter.format(new Date()); // Outputs YYYY-MM-DD
}

/**
 * Given any date string (YYYY-MM-DD or ISO), calculate the Saturday-Friday week bounds.
 * Week starts on Saturday and ends on the subsequent Friday.
 */
export function getWeekBounds(dateInput: string | Date): WeekBounds {
  const isoStr = typeof dateInput === 'string' ? dateInput.split('T')[0] : dateInput.toISOString().split('T')[0];
  const [year, month, day] = isoStr.split('-').map(Number);
  
  // Create UTC date at noon to avoid DST or timezone day shifting
  const current = new Date(Date.UTC(year, month - 1, day, 12, 0, 0));
  const dayOfWeek = current.getUTCDay(); // 0 is Sunday, 1 Monday, ..., 6 Saturday

  // Calculate days offset to reach the preceding or same Saturday
  // If Saturday (6) -> offset 0
  // If Sunday (0) -> offset -1 (previous day was Saturday)
  // If Monday (1) -> offset -2
  // If Friday (5) -> offset -6
  const diffToSaturday = dayOfWeek === 6 ? 0 : -(dayOfWeek + 1);

  const saturday = new Date(current);
  saturday.setUTCDate(current.getUTCDate() + diffToSaturday);

  const days: string[] = [];
  for (let i = 0; i < 7; i++) {
    const d = new Date(saturday);
    d.setUTCDate(saturday.getUTCDate() + i);
    days.push(d.toISOString().split('T')[0]);
  }

  const startDate = days[0]; // Saturday
  const endDate = days[6];   // Friday

  return {
    startDate,
    endDate,
    displayRange: `${formatDateDisplay(startDate)}–${formatDateDisplay(endDate)}`,
    days,
  };
}

/**
 * Navigate to next week (+7 days from current start Saturday)
 */
export function getNextWeek(currentStartDate: string): WeekBounds {
  const [year, month, day] = currentStartDate.split('-').map(Number);
  const nextSat = new Date(Date.UTC(year, month - 1, day + 7, 12, 0, 0));
  return getWeekBounds(nextSat.toISOString().split('T')[0]);
}

/**
 * Navigate to previous week (-7 days from current start Saturday)
 */
export function getPreviousWeek(currentStartDate: string): WeekBounds {
  const [year, month, day] = currentStartDate.split('-').map(Number);
  const prevSat = new Date(Date.UTC(year, month - 1, day - 7, 12, 0, 0));
  return getWeekBounds(prevSat.toISOString().split('T')[0]);
}

/**
 * Get weekday name for an ISO date
 */
export function getDayName(isoDate: string): string {
  const [year, month, day] = isoDate.split('-').map(Number);
  const d = new Date(Date.UTC(year, month - 1, day, 12, 0, 0));
  return d.toLocaleDateString('en-US', { weekday: 'short', timeZone: 'UTC' });
}
