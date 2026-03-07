const MONTH_NAMES: Record<string, number> = {
  january: 0, jan: 0,
  february: 1, feb: 1,
  march: 2, mar: 2,
  april: 3, apr: 3,
  may: 4,
  june: 5, jun: 5,
  july: 6, jul: 6,
  august: 7, aug: 7,
  september: 8, sep: 8, sept: 8,
  october: 9, oct: 9,
  november: 10, nov: 10,
  december: 11, dec: 11,
};

const WEEKDAY_NAMES: Record<string, number> = {
  sunday: 0, sun: 0,
  monday: 1, mon: 1,
  tuesday: 2, tue: 2,
  wednesday: 3, wed: 3,
  thursday: 4, thu: 4,
  friday: 5, fri: 5,
  saturday: 6, sat: 6,
};

// Simple date expressions valid after "eod" in a compound like "EOD Monday"
const SIMPLE_DATE =
  `today|tomorrow` +
  `|(?:next\\s+)?(?:monday|mon|tuesday|tue|wednesday|wed` +
  `|thursday|thu|friday|fri|saturday|sat|sunday|sun)` +
  `|\\d{4}-\\d{2}-\\d{2}` +
  `|\\d{1,2}\\/\\d{1,2}(?:\\/\\d{4})?` +
  `|(?:jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may` +
  `|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:t(?:ember)?)?` +
  `|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)` +
  `\\s+\\d{1,2}(?:st|nd|rd|th)?(?:[,\\s]+\\d{4})?`;

// A regex fragment that matches recognizable date expressions
const DATE_CHUNK =
  `(?:` +
  `\\d{4}-\\d{2}-\\d{2}` +                                             // 2024-03-15
  `|\\d{1,2}\\/\\d{1,2}(?:\\/\\d{4})?` +                              // 3/15 or 3/15/2024
  `|(?:jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may` +
  `|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:t(?:ember)?)?` +
  `|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)` +
  `\\s+\\d{1,2}(?:st|nd|rd|th)?(?:[,\\s]+\\d{4})?` +                  // March 15 [, 2024]
  `|today|tomorrow` +
  `|(?:next\\s+)?(?:monday|mon|tuesday|tue|wednesday|wed` +
  `|thursday|thu|friday|fri|saturday|sat|sunday|sun)` +                // [next] weekday
  `|eod\\s+(?:${SIMPLE_DATE})` +                                       // EOD compound: "EOD Monday"
  `|eod|eow|eom|eoq|eoy` +                                             // abbreviations (compound before standalone)
  `|end[\\s\\-]of[\\s\\-](?:day|week|month|quarter|year)` +           // spelled out
  `)`;

const DUE_PATTERNS = [
  new RegExp(`\\bdue\\s+(?:by|on|at)\\s+(${DATE_CHUNK})`, "i"),
  new RegExp(`\\bdue\\s+(${DATE_CHUNK})`, "i"),
  new RegExp(`\\bby\\s+(${DATE_CHUNK})`, "i"),
];

function startOfDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

function parseAbsoluteDate(str: string, ref: Date, endOfDayHour: number, endOfWeekDay: number): Date | null {
  const s = str.trim().toLowerCase();

  if (s === "today") return startOfDay(ref);
  if (s === "tomorrow") {
    const d = startOfDay(ref);
    d.setDate(d.getDate() + 1);
    return d;
  }

  // EOD / end of day → reference date at the configured end-of-day hour
  if (s === "eod" || s === "end of day" || s === "end-of-day") {
    return new Date(ref.getFullYear(), ref.getMonth(), ref.getDate(), endOfDayHour, 0, 0);
  }

  // EOD <date> compound (e.g. "eod monday", "eod march 15", "eod 2026-03-09")
  // The compound alternative in DATE_CHUNK ensures the full "eod <date>" string is
  // captured as one unit; here we strip the prefix and resolve the date part.
  if (s.startsWith("eod ")) {
    const baseDate = parseAbsoluteDate(s.slice(4), ref, endOfDayHour, endOfWeekDay);
    if (baseDate) {
      return new Date(baseDate.getFullYear(), baseDate.getMonth(), baseDate.getDate(), endOfDayHour, 0, 0);
    }
  }

  // EOW / end of week → configured end-of-week day at 23:59:59
  if (s === "eow" || s === "end of week" || s === "end-of-week") {
    const d = startOfDay(ref);
    const daysUntilEOW = (endOfWeekDay - d.getDay() + 7) % 7;
    return new Date(d.getFullYear(), d.getMonth(), d.getDate() + daysUntilEOW, 23, 59, 59);
  }

  // EOM / end of month → last day of the reference date's month at 23:59:59
  if (s === "eom" || s === "end of month" || s === "end-of-month") {
    const last = new Date(ref.getFullYear(), ref.getMonth() + 1, 0);
    return new Date(last.getFullYear(), last.getMonth(), last.getDate(), 23, 59, 59);
  }

  // EOQ / end of quarter → last day of the reference date's quarter at 23:59:59
  if (s === "eoq" || s === "end of quarter" || s === "end-of-quarter") {
    const quarterEndMonth = Math.floor(ref.getMonth() / 3) * 3 + 2;
    const last = new Date(ref.getFullYear(), quarterEndMonth + 1, 0);
    return new Date(last.getFullYear(), last.getMonth(), last.getDate(), 23, 59, 59);
  }

  // EOY / end of year → December 31 at 23:59:59
  if (s === "eoy" || s === "end of year" || s === "end-of-year") {
    return new Date(ref.getFullYear(), 11, 31, 23, 59, 59);
  }

  // [next] weekday
  const weekdayMatch = s.match(
    /^(?:next\s+)?(monday|mon|tuesday|tue|wednesday|wed|thursday|thu|friday|fri|saturday|sat|sunday|sun)$/
  );
  if (weekdayMatch) {
    const target = WEEKDAY_NAMES[weekdayMatch[1]];
    const today = startOfDay(ref);
    let diff = target - today.getDay();
    if (diff <= 0) diff += 7;
    const d = new Date(today);
    d.setDate(d.getDate() + diff);
    return d;
  }

  // YYYY-MM-DD
  const isoMatch = str.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (isoMatch) {
    return new Date(parseInt(isoMatch[1]), parseInt(isoMatch[2]) - 1, parseInt(isoMatch[3]));
  }

  // MM/DD or MM/DD/YYYY
  const slashMatch = str.match(/^(\d{1,2})\/(\d{1,2})(?:\/(\d{4}))?$/);
  if (slashMatch) {
    const year = slashMatch[3] ? parseInt(slashMatch[3]) : ref.getFullYear();
    return new Date(year, parseInt(slashMatch[1]) - 1, parseInt(slashMatch[2]));
  }

  // Month DD [, YYYY]
  const monthMatch = s.match(
    /^(january|jan|february|feb|march|mar|april|apr|may|june|jun|july|jul|august|aug|september|sep|sept|october|oct|november|nov|december|dec)\s+(\d{1,2})(?:st|nd|rd|th)?(?:[,\s]+(\d{4}))?$/
  );
  if (monthMatch) {
    const month = MONTH_NAMES[monthMatch[1]];
    const day = parseInt(monthMatch[2]);
    const year = monthMatch[3] ? parseInt(monthMatch[3]) : ref.getFullYear();
    return new Date(year, month, day);
  }

  return null;
}

/**
 * Parse a YYYY-MM-DD, YYYY-MM, or YYYY filename date string into a Date.
 * Uses noon local time to avoid DST / timezone edge cases.
 */
export function parseDateString(dateStr: string): Date {
  const parts = dateStr.split("-").map(Number);
  return new Date(parts[0], (parts[1] ?? 1) - 1, parts[2] ?? 1, 12, 0, 0);
}

/**
 * Parse a due date from todo text.
 * Recognizes "due by X", "due on X", "due X", and "by X" followed by a date.
 * Pass a referenceDate to resolve relative keywords (today, tomorrow, next Friday)
 * relative to that date instead of the current date — use the file's date when available
 * so that a todo saying "by tomorrow" in an old note is flagged as overdue correctly.
 */
export function parseDueDate(text: string, referenceDate: Date = new Date(), endOfDayHour = 17, endOfWeekDay = 6): Date | null {
  for (const pattern of DUE_PATTERNS) {
    const match = text.match(pattern);
    if (match) {
      const parsed = parseAbsoluteDate(match[1], referenceDate, endOfDayHour, endOfWeekDay);
      if (parsed) return parsed;
    }
  }
  return null;
}

/**
 * Classify a due date relative to today.
 */
export function getDueDateStatus(date: Date): "overdue" | "today" | "soon" | "future" {
  const now = new Date();
  const today = startOfDay(now);
  const d = startOfDay(date);
  const diff = Math.round((d.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
  if (diff < 0) return "overdue";
  if (diff === 0) {
    // For dates with an explicit time component (e.g. EOD at 17:00), check whether
    // that specific time has already passed rather than treating the whole day as current.
    if (date.getHours() !== 0 || date.getMinutes() !== 0) {
      return date <= now ? "overdue" : "today";
    }
    return "today";
  }
  if (diff <= 7) return "soon";
  return "future";
}

/**
 * Format a due date for compact display.
 */
export function formatDueDate(date: Date): string {
  const today = startOfDay(new Date());
  const d = startOfDay(date);
  const diff = Math.round((d.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));

  if (diff === 0) return "Today";
  if (diff === 1) return "Tomorrow";
  if (diff === -1) return "Yesterday";
  if (diff > 1 && diff <= 6) return d.toLocaleDateString("en-US", { weekday: "long" });
  if (d.getFullYear() === today.getFullYear()) {
    return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
  }
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}
