import {
  parseDueDate,
  getDueDateStatus,
  formatDueDate,
  parseDateString,
} from "../dueDateParser";

// Fixed reference date: Thursday, March 5, 2026 at noon
const REF = new Date(2026, 2, 5, 12, 0, 0);

// Helpers
const d = (year: number, month: number, day: number, h = 0, m = 0, s = 0) =>
  new Date(year, month - 1, day, h, m, s);

// ─── parseDateString ────────────────────────────────────────────────────────

describe("parseDateString", () => {
  it("parses YYYY-MM-DD", () => {
    const result = parseDateString("2026-03-15");
    expect(result.getFullYear()).toBe(2026);
    expect(result.getMonth()).toBe(2);
    expect(result.getDate()).toBe(15);
  });

  it("parses YYYY-MM (first of month)", () => {
    const result = parseDateString("2026-03");
    expect(result.getFullYear()).toBe(2026);
    expect(result.getMonth()).toBe(2);
    expect(result.getDate()).toBe(1);
  });

  it("parses YYYY (Jan 1 of year)", () => {
    const result = parseDateString("2026");
    expect(result.getFullYear()).toBe(2026);
    expect(result.getMonth()).toBe(0);
    expect(result.getDate()).toBe(1);
  });

  it("uses noon local time to avoid DST edge cases", () => {
    const result = parseDateString("2026-03-15");
    expect(result.getHours()).toBe(12);
  });
});

// ─── parseDueDate – null cases ───────────────────────────────────────────────

describe("parseDueDate – returns null", () => {
  it("returns null for plain text", () => {
    expect(parseDueDate("Review the document", REF)).toBeNull();
  });

  it("returns null when no trigger phrase is present", () => {
    expect(parseDueDate("Monday is a meeting", REF)).toBeNull();
  });

  it("returns null for 'by' followed by a non-date word", () => {
    expect(parseDueDate("supervised by John", REF)).toBeNull();
  });

  it("returns null for empty string", () => {
    expect(parseDueDate("", REF)).toBeNull();
  });

  it("returns null for 'due' with no recognizable date", () => {
    expect(parseDueDate("due soon", REF)).toBeNull();
  });
});

// ─── parseDueDate – absolute dates ──────────────────────────────────────────

describe("parseDueDate – absolute dates", () => {
  it("parses ISO date with 'due by'", () => {
    expect(parseDueDate("send report due by 2026-03-15", REF)).toEqual(
      d(2026, 3, 15)
    );
  });

  it("parses ISO date with 'due on'", () => {
    expect(parseDueDate("due on 2026-03-15", REF)).toEqual(d(2026, 3, 15));
  });

  it("parses US date MM/DD using ref year", () => {
    expect(parseDueDate("submit by 3/15", REF)).toEqual(d(2026, 3, 15));
  });

  it("parses US date MM/DD/YYYY", () => {
    expect(parseDueDate("submit by 3/15/2027", REF)).toEqual(d(2027, 3, 15));
  });

  it("parses named month with day", () => {
    expect(parseDueDate("due by March 15", REF)).toEqual(d(2026, 3, 15));
  });

  it("parses named month with ordinal (st)", () => {
    expect(parseDueDate("due by March 1st", REF)).toEqual(d(2026, 3, 1));
  });

  it("parses abbreviated month name", () => {
    expect(parseDueDate("due by Mar 15", REF)).toEqual(d(2026, 3, 15));
  });

  it("parses month name with year", () => {
    expect(parseDueDate("due by March 15, 2027", REF)).toEqual(d(2027, 3, 15));
  });

  it("is case insensitive", () => {
    expect(parseDueDate("DUE BY MARCH 15", REF)).toEqual(d(2026, 3, 15));
  });
});

// ─── parseDueDate – relative dates ──────────────────────────────────────────

describe("parseDueDate – relative dates (resolved against REF)", () => {
  it("parses 'today' relative to ref", () => {
    expect(parseDueDate("due today", REF)).toEqual(d(2026, 3, 5));
  });

  it("parses 'tomorrow' relative to ref", () => {
    expect(parseDueDate("due tomorrow", REF)).toEqual(d(2026, 3, 6));
  });

  it("'tomorrow' in old note is not tomorrow from today", () => {
    const oldRef = d(2026, 1, 1); // Jan 1
    expect(parseDueDate("done by tomorrow", oldRef)).toEqual(d(2026, 1, 2));
  });
});

// ─── parseDueDate – weekdays ─────────────────────────────────────────────────

describe("parseDueDate – weekdays (REF = Thursday Mar 5)", () => {
  it("resolves 'friday' to next day", () => {
    expect(parseDueDate("due by friday", REF)).toEqual(d(2026, 3, 6));
  });

  it("resolves 'monday' to following Monday", () => {
    expect(parseDueDate("due by monday", REF)).toEqual(d(2026, 3, 9));
  });

  it("resolves 'next monday' to the Monday of the week after next from Thursday", () => {
    expect(parseDueDate("due by next monday", REF)).toEqual(d(2026, 3, 16));
  });

  it("resolves 'saturday' to 2 days ahead", () => {
    expect(parseDueDate("due by saturday", REF)).toEqual(d(2026, 3, 7));
  });

  it("resolves abbreviated weekday 'fri'", () => {
    expect(parseDueDate("by fri", REF)).toEqual(d(2026, 3, 6));
  });

  it("resolves abbreviated weekday 'mon'", () => {
    expect(parseDueDate("by mon", REF)).toEqual(d(2026, 3, 9));
  });

  it("resolves 'next wednesday' from Sunday to the following week's Wednesday", () => {
    // Sunday March 15, 2026 — next occurrence of Wed is Mar 18; "next" skips to Mar 25
    const sunRef = d(2026, 3, 15);
    expect(parseDueDate("due next wednesday", sunRef)).toEqual(d(2026, 3, 25));
  });

  it("resolves 'next friday' from Thursday to a week after the upcoming Friday", () => {
    // From Thursday Mar 5: upcoming Fri = Mar 6; "next" = Mar 13
    expect(parseDueDate("due next friday", REF)).toEqual(d(2026, 3, 13));
  });
});

// ─── parseDueDate – next month / next year ────────────────────────────────────

describe("parseDueDate – next month / next year (REF = Thursday Mar 5)", () => {
  it("'next month' resolves to the first of the next month", () => {
    expect(parseDueDate("due next month", REF)).toEqual(d(2026, 4, 1));
  });

  it("'next month' from December wraps to January of the following year", () => {
    const decRef = d(2026, 12, 15);
    expect(parseDueDate("due next month", decRef)).toEqual(d(2027, 1, 1));
  });

  it("'next year' resolves to January 1 of the following year", () => {
    expect(parseDueDate("due next year", REF)).toEqual(d(2027, 1, 1));
  });

  it("works with 'due by' trigger phrase", () => {
    expect(parseDueDate("submit by next month", REF)).toEqual(d(2026, 4, 1));
  });

  it("works with 'due on' trigger phrase", () => {
    expect(parseDueDate("due on next year", REF)).toEqual(d(2027, 1, 1));
  });
});

// ─── parseDueDate – end of next X ────────────────────────────────────────────

describe("parseDueDate – end of next week/month/year (REF = Thursday Mar 5)", () => {
  it("'end of next week' resolves to the end-of-week day of next week", () => {
    // EOW = Saturday Mar 7; end of NEXT week = Saturday Mar 14
    expect(parseDueDate("due end of next week", REF, 17, 6)).toEqual(
      d(2026, 3, 14, 23, 59, 59)
    );
  });

  it("'end of next week' respects custom endOfWeekDay (Friday)", () => {
    // EOW = Friday Mar 6; end of NEXT week = Friday Mar 13
    expect(parseDueDate("due end of next week", REF, 17, 5)).toEqual(
      d(2026, 3, 13, 23, 59, 59)
    );
  });

  it("'end of next week' when today is the end-of-week day still advances a full week", () => {
    // Saturday March 7 is EOW; end of next week = Saturday March 14
    const satRef = d(2026, 3, 7);
    expect(parseDueDate("due end of next week", satRef, 17, 6)).toEqual(
      d(2026, 3, 14, 23, 59, 59)
    );
  });

  it("'end of next month' resolves to the last day of next month at 23:59:59", () => {
    // March ref → end of April = April 30
    expect(parseDueDate("due end of next month", REF)).toEqual(
      d(2026, 4, 30, 23, 59, 59)
    );
  });

  it("'end of next month' from January resolves to last day of February", () => {
    const janRef = d(2026, 1, 15);
    expect(parseDueDate("due end of next month", janRef)).toEqual(
      d(2026, 2, 28, 23, 59, 59)
    );
  });

  it("'end of next month' from December wraps to January 31 of next year", () => {
    const decRef = d(2026, 12, 15);
    expect(parseDueDate("due end of next month", decRef)).toEqual(
      d(2027, 1, 31, 23, 59, 59)
    );
  });

  it("'end of next year' resolves to December 31 of next year at 23:59:59", () => {
    expect(parseDueDate("due end of next year", REF)).toEqual(
      d(2027, 12, 31, 23, 59, 59)
    );
  });

  it("works with 'by' trigger phrase", () => {
    expect(parseDueDate("submit by end of next month", REF)).toEqual(
      d(2026, 4, 30, 23, 59, 59)
    );
  });
});

// ─── parseDueDate – EO* keywords ────────────────────────────────────────────

describe("parseDueDate – EO* keywords (REF = Thursday Mar 5)", () => {
  it("EOD resolves to ref date at endOfDayHour", () => {
    const result = parseDueDate("due by EOD", REF, 17);
    expect(result).toEqual(d(2026, 3, 5, 17));
  });

  it("EOD 'end of day' phrase also works", () => {
    expect(parseDueDate("due by end of day", REF, 17)).toEqual(
      d(2026, 3, 5, 17)
    );
  });

  it("EOD respects custom endOfDayHour", () => {
    const result = parseDueDate("due EOD", REF, 18);
    expect(result?.getHours()).toBe(18);
  });

  it("EOW resolves to end-of-week day (Saturday) at 23:59:59", () => {
    const result = parseDueDate("due by EOW", REF, 17, 6); // Saturday
    expect(result).toEqual(d(2026, 3, 7, 23, 59, 59));
  });

  it("EOW respects custom endOfWeekDay (Friday)", () => {
    const result = parseDueDate("due by EOW", REF, 17, 5); // Friday
    expect(result).toEqual(d(2026, 3, 6, 23, 59, 59));
  });

  it("'end of week' phrase resolves same as EOW", () => {
    expect(parseDueDate("due end of week", REF, 17, 6)).toEqual(
      d(2026, 3, 7, 23, 59, 59)
    );
  });

  it("EOM resolves to last day of month at 23:59:59", () => {
    expect(parseDueDate("due EOM", REF)).toEqual(d(2026, 3, 31, 23, 59, 59));
  });

  it("'end of month' phrase resolves same as EOM", () => {
    expect(parseDueDate("due end of month", REF)).toEqual(
      d(2026, 3, 31, 23, 59, 59)
    );
  });

  it("EOM for February respects leap year (2024)", () => {
    const febRef = new Date(2024, 1, 10); // Feb 10, 2024 (leap year)
    const result = parseDueDate("due EOM", febRef);
    expect(result?.getDate()).toBe(29);
  });

  it("EOM for February non-leap year", () => {
    const febRef = new Date(2026, 1, 10); // Feb 10, 2026
    const result = parseDueDate("due EOM", febRef);
    expect(result?.getDate()).toBe(28);
  });

  it("EOQ from Q1 resolves to March 31", () => {
    expect(parseDueDate("due EOQ", REF)).toEqual(d(2026, 3, 31, 23, 59, 59));
  });

  it("EOQ from Q2 resolves to June 30", () => {
    const q2Ref = new Date(2026, 3, 15); // April 15
    const result = parseDueDate("due EOQ", q2Ref);
    expect(result?.getMonth()).toBe(5); // June (0-indexed)
    expect(result?.getDate()).toBe(30);
  });

  it("EOQ from Q3 resolves to September 30", () => {
    const q3Ref = new Date(2026, 7, 1); // August 1
    const result = parseDueDate("due EOQ", q3Ref);
    expect(result?.getMonth()).toBe(8); // September
    expect(result?.getDate()).toBe(30);
  });

  it("EOQ from Q4 resolves to December 31", () => {
    const q4Ref = new Date(2026, 10, 1); // November 1
    const result = parseDueDate("due EOQ", q4Ref);
    expect(result?.getMonth()).toBe(11);
    expect(result?.getDate()).toBe(31);
  });

  it("EOY resolves to December 31 at 23:59:59", () => {
    expect(parseDueDate("due EOY", REF)).toEqual(d(2026, 12, 31, 23, 59, 59));
  });

  it("'end of year' phrase resolves same as EOY", () => {
    expect(parseDueDate("by end of year", REF)).toEqual(
      d(2026, 12, 31, 23, 59, 59)
    );
  });
});

// ─── parseDueDate – EOD compound ─────────────────────────────────────────────

describe("parseDueDate – EOD compound (REF = Thursday Mar 5)", () => {
  it("'EOD Monday' resolves to next Monday at endOfDayHour", () => {
    const result = parseDueDate("by EOD Monday", REF, 17, 6);
    expect(result).toEqual(d(2026, 3, 9, 17)); // March 9 @ 17:00
  });

  it("'EOD Friday' resolves to next Friday at endOfDayHour", () => {
    const result = parseDueDate("due EOD Friday", REF, 17, 6);
    expect(result).toEqual(d(2026, 3, 6, 17)); // March 6 @ 17:00
  });

  it("'EOD tomorrow' resolves to tomorrow at endOfDayHour", () => {
    const result = parseDueDate("due EOD tomorrow", REF, 17, 6);
    expect(result).toEqual(d(2026, 3, 6, 17));
  });

  it("'EOD 2026-03-15' resolves to ISO date at endOfDayHour", () => {
    const result = parseDueDate("by EOD 2026-03-15", REF, 17, 6);
    expect(result).toEqual(d(2026, 3, 15, 17));
  });

  it("'EOD March 15' resolves to named month date at endOfDayHour", () => {
    const result = parseDueDate("due EOD March 15", REF, 17, 6);
    expect(result).toEqual(d(2026, 3, 15, 17));
  });

  it("'EOD end of week' resolves to EOW at endOfDayHour", () => {
    expect(parseDueDate("by EOD end of week", REF, 17, 6)).toEqual(
      d(2026, 3, 7, 17)
    );
  });

  it("'EOD end of month' resolves to last day of month at endOfDayHour", () => {
    expect(parseDueDate("due EOD end of month", REF, 17, 6)).toEqual(
      d(2026, 3, 31, 17)
    );
  });

  it("'EOD end of year' resolves to Dec 31 at endOfDayHour", () => {
    expect(parseDueDate("due EOD end of year", REF, 17, 6)).toEqual(
      d(2026, 12, 31, 17)
    );
  });

  it("'EOD end of next week' resolves to next EOW at endOfDayHour", () => {
    expect(parseDueDate("due EOD end of next week", REF, 17, 6)).toEqual(
      d(2026, 3, 14, 17)
    );
  });

  it("is case insensitive for compound", () => {
    const result = parseDueDate("by eod monday", REF, 17, 6);
    expect(result).toEqual(d(2026, 3, 9, 17));
  });

  it("key example: old note due 'EOD Monday' appears as due soon on Mar 7", () => {
    // File from March 5 (Thursday); viewed on March 7 (Saturday)
    const result = parseDueDate("finish by EOD Monday", REF, 17, 6);
    expect(result).toEqual(d(2026, 3, 9, 17)); // March 9 @ 17:00

    jest.useFakeTimers();
    jest.setSystemTime(d(2026, 3, 7, 10)); // March 7, 10am
    expect(getDueDateStatus(result!)).toBe("soon");
    jest.useRealTimers();
  });
});

// ─── getDueDateStatus ─────────────────────────────────────────────────────────

describe("getDueDateStatus", () => {
  // System time: Saturday March 7, 2026 at 10:00 AM
  beforeEach(() => {
    jest.useFakeTimers();
    jest.setSystemTime(d(2026, 3, 7, 10, 0, 0));
  });
  afterEach(() => jest.useRealTimers());

  it("returns 'overdue' for a past date", () => {
    expect(getDueDateStatus(d(2026, 3, 6))).toBe("overdue");
  });

  it("returns 'overdue' for a week ago", () => {
    expect(getDueDateStatus(d(2026, 2, 28))).toBe("overdue");
  });

  it("returns 'today' for today at midnight", () => {
    expect(getDueDateStatus(d(2026, 3, 7))).toBe("today");
  });

  it("returns 'today' for EOD time that hasn't passed yet (5pm, now is 10am)", () => {
    expect(getDueDateStatus(d(2026, 3, 7, 17))).toBe("today");
  });

  it("returns 'overdue' for EOD time that has already passed (9am, now is 10am)", () => {
    expect(getDueDateStatus(d(2026, 3, 7, 9))).toBe("overdue");
  });

  it("returns 'soon' for tomorrow", () => {
    expect(getDueDateStatus(d(2026, 3, 8))).toBe("soon");
  });

  it("returns 'soon' for 7 days out", () => {
    expect(getDueDateStatus(d(2026, 3, 14))).toBe("soon");
  });

  it("returns 'future' for 8 days out", () => {
    expect(getDueDateStatus(d(2026, 3, 15))).toBe("future");
  });

  it("returns 'future' for a date months away", () => {
    expect(getDueDateStatus(d(2026, 12, 31))).toBe("future");
  });
});

// ─── formatDueDate ────────────────────────────────────────────────────────────

describe("formatDueDate", () => {
  // System time: Saturday March 7, 2026 at 10:00 AM
  beforeEach(() => {
    jest.useFakeTimers();
    jest.setSystemTime(d(2026, 3, 7, 10, 0, 0));
  });
  afterEach(() => jest.useRealTimers());

  it("returns 'Today' for today", () => {
    expect(formatDueDate(d(2026, 3, 7))).toBe("Today");
  });

  it("returns 'Tomorrow' for tomorrow", () => {
    expect(formatDueDate(d(2026, 3, 8))).toBe("Tomorrow");
  });

  it("returns 'Yesterday' for yesterday", () => {
    expect(formatDueDate(d(2026, 3, 6))).toBe("Yesterday");
  });

  it("returns weekday name for 2-6 days out", () => {
    // March 10 is Tuesday
    const result = formatDueDate(d(2026, 3, 10));
    expect(result).toBe("Tuesday");
  });

  it("returns short month/day for same year beyond 6 days", () => {
    const result = formatDueDate(d(2026, 3, 20));
    expect(result).toMatch(/Mar 20/);
  });

  it("includes year for a date in a different year", () => {
    const result = formatDueDate(d(2027, 1, 15));
    expect(result).toMatch(/2027/);
  });

  it("returns past date without year if same year", () => {
    const result = formatDueDate(d(2026, 2, 1));
    expect(result).not.toMatch(/2026/);
    expect(result).toMatch(/Feb 1/);
  });
});
