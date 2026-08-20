/**
 * What a finished project can be stamped with.
 *
 * The design asks for three measurements in a row — days, yardage, rows — and
 * the cached project row can supply at most one of them today. That is not a
 * bug to route around: `projects/list.json` carries `started` and nothing about
 * packs or row counts, so the yardage and the rows are read from `raw` on the
 * chance a fuller payload lands there one day (a project fetched with
 * `include=packs`, a detail read this app has not written yet) and simply do
 * not appear until it does. A fact that cannot be stated is a stamp that is not
 * drawn — never a zero, never a dash.
 */

import { MONTHS } from "@/features/detail/project";
import { at, firstNumber, firstString, readString } from "@/features/detail/raw";

export type Fact = {
  /** The stamp's caption, e.g. "days". */
  readonly label: string;
  readonly value: string;
};

const DAY_MS = 86_400_000;

/**
 * One calendar day as UTC midnight, from `2025/12/21`, `2025-12-21`, or either
 * with a time and an offset behind it.
 *
 * UTC on both sides of the subtraction on purpose: the question is how many
 * days are written between two dates on a calendar, and putting them both at
 * the same hour of the same imaginary day is the only way an answer survives a
 * daylight-saving change in the middle of a cardigan.
 */
function calendarDay(value: unknown): number | null {
  const text = readString(value);

  if (text === null) {
    return null;
  }

  const match = /^(\d{4})[/-](\d{2})[/-](\d{2})/.exec(text.trim());

  if (match === null) {
    return null;
  }

  const day = Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
  return Number.isNaN(day) ? null : day;
}

/** Today, at the same imaginary hour `calendarDay` puts everything else. */
function todayAsCalendarDay(now: Date): number {
  return Date.UTC(now.getFullYear(), now.getMonth(), now.getDate());
}

/**
 * How long this took, in days.
 *
 * Null for a project with no start date, which is most of them — Ravelry only
 * records one when the knitter typed it — and for a start date in the future,
 * which is somebody's typo and not a fact worth stamping.
 */
function days(raw: unknown, now: Date): string | null {
  const started = calendarDay(at(raw, ["started"]));

  if (started === null) {
    return null;
  }

  const elapsed = Math.round((todayAsCalendarDay(now) - started) / DAY_MS);
  return elapsed < 0 ? null : String(elapsed);
}

/**
 * How much yarn went into it, summed across the project's packs.
 *
 * `total_length` is the field a pack records, and its unit is the pack's own —
 * a project can hold yarn measured in metres and yarn measured in yards, so the
 * first unit seen wins and the rest are added to it. Mixing them is rare enough
 * to be worth the honesty of one number over the timidity of none.
 */
function yardage(raw: unknown): string | null {
  const packs = at(raw, ["packs"]);

  if (!Array.isArray(packs)) {
    return null;
  }

  let total = 0;
  let units: string | null = null;

  for (const pack of packs) {
    const length = firstNumber(pack, [["total_length"], ["yardage"], ["yards"]]);

    if (length !== null && length > 0) {
      total += length;
      units ??= firstString(pack, [["length_units"]]);
    }
  }

  if (total <= 0) {
    return null;
  }

  return `${Math.round(total)} ${units?.toLowerCase().startsWith("meter") ? "m" : "yd"}`;
}

/** How many rows, if anything in the payload says. Nothing does today. */
function rows(raw: unknown): string | null {
  const counted = firstNumber(raw, [["rows"], ["row_count"], ["rows_completed"]]);
  return counted === null || counted <= 0 ? null : String(Math.round(counted));
}

/** The stamps a project has earned, in the order the design draws them. */
export function projectFacts(raw: unknown, now: Date = new Date()): Fact[] {
  return [
    { label: "days", value: days(raw, now) },
    { label: "yardage", value: yardage(raw) },
    { label: "rows", value: rows(raw) },
  ].filter((fact): fact is Fact => fact.value !== null);
}

/** "19 August 2026" — the date a thing was finished, written out. */
export function stampedDate(now: Date = new Date()): string {
  return `${now.getDate()} ${MONTHS[now.getMonth()]} ${now.getFullYear()}`;
}
