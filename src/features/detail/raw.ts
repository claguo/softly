/**
 * Reading the `raw` column.
 *
 * Every cached row keeps the untouched Ravelry object beside its typed
 * columns, which is what makes a detail screen possible without a schema
 * change — and what makes it a JSON blob nobody has typed. The readers below
 * are the same paranoid shape `sync.ts` uses on the way in: a path walk that
 * cannot throw, one reader per primitive, and a first-match helper for the
 * fields Ravelry spells three different ways depending on the endpoint.
 *
 * Nothing here throws and nothing here guesses: an unrecognised shape reads as
 * null, and a null field is simply a line the screen does not draw.
 *
 * Notes are the one field these readers stop short of: they hand the string
 * over as it was sent, and `notes.ts` turns it into something a screen can
 * draw. There is no tag-stripper here any more — a note is formatted text, not
 * a field.
 */

/** A `raw` string as an object, or null if it is not one. Never throws. */
export function parseRaw(raw: string | null | undefined): unknown {
  if (typeof raw !== "string" || raw === "") {
    return null;
  }
  try {
    return JSON.parse(raw) as unknown;
  } catch {
    return null;
  }
}

export function at(source: unknown, path: readonly string[]): unknown {
  let value = source;
  for (const key of path) {
    if (typeof value !== "object" || value === null) {
      return undefined;
    }
    value = (value as Record<string, unknown>)[key];
  }
  return value;
}

export function readString(value: unknown): string | null {
  if (typeof value === "string") {
    const trimmed = value.trim();
    return trimmed === "" ? null : trimmed;
  }
  // Ravelry sends sizes and counts as numbers about as often as strings.
  if (typeof value === "number" && Number.isFinite(value)) {
    return String(value);
  }
  return null;
}

export function readNumber(value: unknown): number | null {
  if (typeof value === "number") {
    return Number.isFinite(value) ? value : null;
  }
  if (typeof value === "string" && value.trim() !== "") {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

export function firstString(
  source: unknown,
  paths: readonly (readonly string[])[],
): string | null {
  for (const path of paths) {
    const value = readString(at(source, path));
    if (value !== null) {
      return value;
    }
  }
  return null;
}

export function firstNumber(
  source: unknown,
  paths: readonly (readonly string[])[],
): number | null {
  for (const path of paths) {
    const value = readNumber(at(source, path));
    if (value !== null) {
      return value;
    }
  }
  return null;
}

/** True only where the payload actually says true; anything else is silence. */
export function isTrue(
  source: unknown,
  keys: readonly string[],
): boolean {
  if (typeof source !== "object" || source === null) {
    return false;
  }
  const record = source as Record<string, unknown>;
  return keys.some((key) => record[key] === true);
}

/** "5", "4.5", "2.75" — a measurement without a trailing zero to trip over. */
export function decimal(value: number): string {
  return String(Number(value.toFixed(2)));
}

/**
 * A route param as one string. Expo hands every param back as either a string
 * or an array of them depending on how the link was written; the first is the
 * one the screen meant.
 */
export function readParam(param: string | string[] | undefined): string | null {
  return readString(Array.isArray(param) ? param[0] : param);
}

/** The route param, which is a string on the way in and an id on the way out. */
export function readId(param: string | string[] | undefined): number | null {
  const value = readParam(param);
  if (value === null) {
    return null;
  }
  const id = Number(value);
  return Number.isInteger(id) && id > 0 ? id : null;
}
