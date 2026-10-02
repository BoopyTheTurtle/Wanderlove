// Calendar days in an explicit time zone. Everything here works on civil dates ("2026-10-02"), never on the machine's
// time zone, so a week or season boundary falls at local midnight whatever the device or server is set to, and DST
// changes cannot shift a day.

/** The time zone the app reckons weeks and seasons in until couples can choose their own. */
export const DEFAULT_TIME_ZONE = "Europe/Riga";

/** A civil date as "YYYY-MM-DD". */
export type CivilDate = string;

/** Meteorological seasons, northern hemisphere: Mar–May spring, Jun–Aug summer, Sep–Nov autumn, Dec–Feb winter. */
export type Season = "spring" | "summer" | "autumn" | "winter";

const MS_PER_DAY = 86400000;
const CIVIL_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;
const formatters = new Map<string, Intl.DateTimeFormat>();

/** The civil date of `instant` in `timeZone`. Throws a RangeError for an unknown time zone. */
export function civilDate(instant: Date, timeZone: string = DEFAULT_TIME_ZONE): CivilDate {
  let format = formatters.get(timeZone);
  if (!format) {
    format = new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" });
    formatters.set(timeZone, format);
  }
  const parts: Record<string, string> = {};
  for (const part of format.formatToParts(instant)) parts[part.type] = part.value;
  return `${parts.year}-${parts.month}-${parts.day}`;
}

/** The meteorological season (northern hemisphere) of a civil date or of an instant in `timeZone`. */
export function meteorologicalSeason(day: CivilDate | Date, timeZone: string = DEFAULT_TIME_ZONE): Season {
  const month = parts(typeof day === "string" ? day : civilDate(day, timeZone)).month;
  if (month >= 3 && month <= 5) return "spring";
  if (month >= 6 && month <= 8) return "summer";
  if (month >= 9 && month <= 11) return "autumn";
  return "winter";
}

// Day numbers: whole days since 1970-01-01 for a civil date. They make date arithmetic exact and zone-free.

export function dayNumber(day: CivilDate): number {
  const { year, month, date } = parts(day);
  return Date.UTC(year, month - 1, date) / MS_PER_DAY;
}

export function fromDayNumber(n: number): CivilDate {
  return new Date(n * MS_PER_DAY).toISOString().slice(0, 10);
}

/** The day number of the Monday that starts the week holding day `n`. */
export function mondayOf(n: number): number {
  const weekday = new Date(n * MS_PER_DAY).getUTCDay(); // 0 = Sunday
  return n - ((weekday + 6) % 7);
}

/** The first day of the meteorological season holding `day`. */
export function seasonStart(day: CivilDate): CivilDate {
  const { year, month } = parts(day);
  const startMonth = month <= 2 ? 12 : month - ((month - 3) % 3); // 3, 6, 9 or 12
  const startYear = month <= 2 ? year - 1 : year;
  return `${startYear}-${String(startMonth).padStart(2, "0")}-01`;
}

export function parts(day: CivilDate): { year: number; month: number; date: number } {
  const match = CIVIL_DATE.exec(day);
  if (!match) throw new RangeError(`not a civil date: ${day}`);
  return { year: Number(match[1]), month: Number(match[2]), date: Number(match[3]) };
}
