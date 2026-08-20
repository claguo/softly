/**
 * Everything a project knows about itself, as the project screen needs it.
 *
 * The payload these read is the one `project-detail.ts` keeps — the show
 * endpoint's, not the list endpoint's — because that is where the yarn, the
 * needles and the numbers actually are. Same paranoid reading as everywhere
 * else in this folder: a path walk that cannot throw, and a field that is not
 * there is a line the screen does not draw.
 *
 * The rule the whole module is built on is `facts.ts`'s, borrowed: **a fact
 * that cannot be stated is not drawn — never a zero, never a dash.** A project
 * carrying nothing but a name is a screen with a name on it, and that is a
 * truer report than fifteen labels with nothing beside them.
 *
 * Two things are deliberately not invented here. A gauge is stitches over a
 * number Ravelry sends no unit for, so the divisor goes in the caption and no
 * inch or centimetre is claimed; and an amount of yarn is whatever unit the
 * pack recorded, never converted.
 */

import {
  at,
  decimal,
  firstNumber,
  firstString,
  readNumber,
  readString,
} from "@/features/detail/raw";

export const MONTHS = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
] as const;

/**
 * "19 August 2026", from `2026/08/19`, `2026-08-19`, or either with a time
 * behind it — the two spellings Ravelry uses depending on the endpoint.
 *
 * Read off the string rather than through `new Date()`, which would apply a
 * timezone to a value that has none and can move a date a day backwards.
 */
export function writtenDate(value: unknown): string | null {
  const text = readString(value);

  if (text === null) {
    return null;
  }

  const match = /^(\d{4})[/-](\d{2})[/-](\d{2})/.exec(text.trim());

  if (match === null) {
    return null;
  }

  const month = MONTHS[Number(match[2]) - 1];

  return month === undefined ? null : `${Number(match[3])} ${month} ${match[1]}`;
}

/** One line of a project's yarn: a pack, as a row can draw it. */
export type ProjectYarn = {
  readonly key: string;
  /** The stash entry this pack draws from, when it draws from one. */
  readonly stashId: number | null;
  /** The catalogue yarn behind it, which is what a photograph is keyed by. */
  readonly yarnId: number | null;
  /** The line that names the skein — the colourway where there is one. */
  readonly title: string;
  /** The yarn itself, underneath: "Knitting for Olive Soft Silk Mohair". */
  readonly brand: string | null;
  readonly weight: string | null;
  /** How much went in, in the unit the pack recorded: "492 yd", "225 m", "50 g". */
  readonly used: string | null;
  readonly skeins: string | null;
  /** Dye lot and shop, joined — the small print a knitter reorders by. */
  readonly note: string | null;
  readonly colorFamilyId: number | null;
};

/** Ravelry sends lengths and weights on the pack; the unit is which key it used. */
const AMOUNTS = [
  { path: ["total_yards"], unit: "yd" },
  { path: ["total_meters"], unit: "m" },
  { path: ["total_grams"], unit: "g" },
  { path: ["total_ounces"], unit: "oz" },
  // The spelling `finishProject`'s stamps read, kept for the same reason they
  // read it: a project fetched some other way may carry it instead.
  { path: ["total_length"], unit: "yd" },
] as const;

function packAmount(pack: unknown): string | null {
  for (const { path, unit } of AMOUNTS) {
    const amount = readNumber(at(pack, path));

    if (amount !== null && amount > 0) {
      return `${decimal(amount)} ${unit}`;
    }
  }

  return null;
}

/** The yarn one project ate, in the order Ravelry lists the packs. */
export function projectYarn(raw: unknown): ProjectYarn[] {
  const packs = at(raw, ["packs"]);

  if (!Array.isArray(packs)) {
    return [];
  }

  return packs.map((pack, index) => {
    const colorway = firstString(pack, [["colorway"]]);

    // What the yarn is called, however this pack knows it: the composed name
    // the pack carries, the name a knitter typed for a yarn Ravelry has never
    // heard of, or the catalogue record behind it, put back together.
    const composed = [
      firstString(pack, [["yarn", "yarn_company_name"]]),
      firstString(pack, [["yarn", "name"]]),
    ]
      .filter((part): part is string => part !== null)
      .join(" ");

    const yarnName =
      firstString(pack, [["yarn_name"], ["personal_name"]]) ??
      (composed === "" ? null : composed);

    // The colourway takes the line, the way it does on Stash and in Cast on;
    // an unnamed colourway lets the yarn have it instead.
    const title = colorway ?? yarnName ?? "Unnamed yarn";

    const dyeLot = firstString(pack, [["dye_lot"]]);

    const note = [
      dyeLot === null ? null : `dye lot ${dyeLot}`,
      firstString(pack, [["shop_name"]]),
    ]
      .filter((part): part is string => part !== null)
      .join(" · ");

    return {
      // Ravelry's own pack id where there is one; the slot otherwise, so two
      // unidentified packs of the same yarn are still two rows.
      key: String(firstNumber(pack, [["id"]]) ?? `pack-${index}`),
      stashId: firstNumber(pack, [["stash_id"]]),
      yarnId: firstNumber(pack, [["yarn_id"]]),
      title,
      // Never repeated: a pack with no colourway has already used the yarn's
      // name on the line above.
      brand: title === yarnName ? null : yarnName,
      weight: firstString(pack, [["yarn_weight", "name"]]),
      used: packAmount(pack),
      skeins:
        firstString(pack, [["skeins"]]) ?? firstString(pack, [["quantity_description"]]),
      note: note === "" ? null : note,
      colorFamilyId: firstNumber(pack, [["color_family_id"]]),
    };
  });
}

/** One needle or hook a project tied up. */
export type ProjectNeedle = {
  readonly key: string;
  /** Millimetres, written the way a knitter says it: "4.5", "6". */
  readonly size: string;
  /** The US size, or a hook's letter — whichever this size is named by. */
  readonly us: string | null;
  readonly kind: string;
};

/**
 * The needles on a project.
 *
 * These arrive as whole size records rather than the ids that were written, so
 * nothing has to be looked up in the size table to draw them. Note `hook` here
 * is the *letter* a crochet size is called by ("J"), not the boolean of the
 * same name on `/needles/sizes.json` — the two endpoints spell it differently,
 * and reading this one as a flag would call every needle a hook.
 */
export function projectNeedles(raw: unknown): ProjectNeedle[] {
  const sizes = at(raw, ["needle_sizes"]);

  if (!Array.isArray(sizes)) {
    return [];
  }

  const found: ProjectNeedle[] = [];

  for (const [index, size] of sizes.entries()) {
    const mm = firstNumber(size, [["metric"]]);
    const hook = at(size, ["crochet"]) === true && at(size, ["knitting"]) !== true;

    found.push({
      key: String(firstNumber(size, [["id"]]) ?? `size-${index}`),
      // A size record with no millimetres is not a size anyone can read; the
      // slot is still drawn, because the project really does have a needle on
      // it, and the dash says which part is missing.
      size: mm === null ? "—" : decimal(mm),
      us: hook
        ? (firstString(size, [["hook"]]) ?? firstString(size, [["us"]]))
        : firstString(size, [["us"]]),
      kind: hook ? "Hook" : "Needle",
    });
  }

  return found;
}

/** The tags a knitter filed this project under. */
export function projectTags(raw: unknown): string[] {
  const tags = at(raw, ["tag_names"]);

  if (!Array.isArray(tags)) {
    return [];
  }

  return tags
    .map((tag) => readString(tag))
    .filter((tag): tag is string => tag !== null);
}

/**
 * The photographs on a project, smallest usable file first — these fill a strip
 * of 96pt squares, not a hero frame, so a square crop is the right file to ask
 * for. Same key list `sync.ts` reads a list thumbnail with.
 */
const PHOTO_URL_KEYS = ["square_url", "small_url", "small2_url", "medium_url"] as const;

export function projectPhotos(raw: unknown): string[] {
  const photos = at(raw, ["photos"]);

  if (!Array.isArray(photos)) {
    return [];
  }

  const urls: string[] = [];

  for (const photo of photos) {
    for (const key of PHOTO_URL_KEYS) {
      const url = firstString(photo, [[key]]);

      if (url !== null) {
        urls.push(url);
        break;
      }
    }
  }

  return urls;
}

export type Spec = {
  /** The stamp's caption, e.g. "started". */
  readonly label: string;
  readonly value: string;
};

function count(raw: unknown, key: string): string | null {
  const total = firstNumber(raw, [[key]]);
  // Zero is the answer for almost every project and says nothing; a count is
  // only worth a stamp once there is something to count.
  return total === null || total <= 0 ? null : String(total);
}

/**
 * The gauge, as one measurement.
 *
 * `gauge_divisor` is how many inches — or centimetres; Ravelry sends no unit
 * and the project's own preference is not in this payload — the stitch count
 * is over. So it goes in the caption as a bare number rather than being
 * written out as a unit this app would be guessing at.
 */
function gauge(raw: unknown): Spec | null {
  const stitches = firstNumber(raw, [["gauge"]]);
  const rows = firstNumber(raw, [["row_gauge"]]);

  if (stitches === null && rows === null) {
    return null;
  }

  const divisor = firstNumber(raw, [["gauge_divisor"]]);

  const value = [
    stitches === null ? null : `${decimal(stitches)} sts`,
    rows === null ? null : `${decimal(rows)} rows`,
  ]
    .filter((part): part is string => part !== null)
    .join(" × ");

  return { label: divisor === null ? "gauge" : `gauge / ${decimal(divisor)}`, value };
}

/**
 * Everything else the project holds, in the order the screen stamps it.
 *
 * Deliberately not here: the name, the pattern, the status and the photograph,
 * which the screen has already drawn from the mirror above these — and
 * `updated_at`, which it draws as a relative line of its own.
 */
export function projectSpecs(raw: unknown): Spec[] {
  const progress = firstNumber(raw, [["progress"]]);
  const rating = firstNumber(raw, [["rating"]]);

  return [
    { label: "craft", value: firstString(raw, [["craft_name"]]) },
    { label: "started", value: writtenDate(at(raw, ["started"])) },
    { label: "finished", value: writtenDate(at(raw, ["completed"])) },
    // A project at 0% has said nothing; one at 100% that is still in progress
    // has, so only the bottom of the range is dropped.
    {
      label: "progress",
      value: progress === null || progress <= 0 ? null : `${Math.round(progress)}%`,
    },
    { label: "size", value: firstString(raw, [["size"]]) },
    { label: "made for", value: firstString(raw, [["made_for"]]) },
    { label: "rating", value: rating === null ? null : `${decimal(rating)}/5` },
    gauge(raw),
    { label: "in pattern", value: firstString(raw, [["gauge_pattern"]]) },
    { label: "ends/inch", value: firstString(raw, [["ends_per_inch"]]) },
    { label: "picks/inch", value: firstString(raw, [["picks_per_inch"]]) },
    // Where the pattern came from, for a project with no Ravelry pattern
    // behind it — the screen's own source line is empty in exactly that case.
    { label: "source", value: firstString(raw, [["personal_source_name"]]) },
    { label: "photos", value: count(raw, "photos_count") },
    { label: "favourites", value: count(raw, "favorites_count") },
    { label: "comments", value: count(raw, "comments_count") },
  ].filter((spec): spec is Spec => spec !== null && spec.value !== null);
}
