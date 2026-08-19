/**
 * Ravelry's needle size table, as the two screens that use it need it.
 *
 * Cast on unfolds it under "All sizes" to put a size on a project, and Add a
 * needle picks one out of it to write a needle into the drawer. Both draw the
 * same 54 rows as the same chips, and both key a chosen size the same way, so
 * the reading of the table is stated once, here.
 *
 * The key is **millimetres**, not a row id. That is the only name the needle
 * drawer and the size table share on the device — a drawer row carries a size,
 * not a size id, and asking the network which id that is cannot happen at tap
 * time. It also does the deduplication for free: the same size chosen in the
 * drawer, in the size table, and on a needle added this afternoon is one key,
 * and so one needle on the project.
 *
 * Nothing here reads the database or the network. The table comes in as an
 * argument; `getNeedleSizes` in `@/data/ravelry` is what fetches it.
 */

import type { RavelryNeedleSize } from '@/data';
import { decimal } from '@/features/detail/raw';

/** How a chosen needle is keyed. See the module note. */
export function sizeKey(mm: number): string {
  return decimal(mm);
}

export type SizeOption = {
  readonly key: string;
  readonly id: number;
  readonly mm: number;
  readonly us: string | null;
  readonly hook: boolean;
};

function readUs(value: unknown): string | null {
  if (typeof value === 'string') {
    const trimmed = value.trim();
    return trimmed === '' ? null : trimmed;
  }
  return typeof value === 'number' && Number.isFinite(value) ? String(value) : null;
}

/**
 * Ravelry's 54 size records as one row per millimetre, thinnest first.
 *
 * A hook and a needle can measure the same, and the table lists both. What
 * both screens record is a size, so they collapse into one chip — the needle
 * keeps the slot, because it is what a project usually means and because its
 * US number is the one a knitter would read off the chip.
 */
export function sizeOptions(table: readonly RavelryNeedleSize[]): SizeOption[] {
  const found = new Map<string, SizeOption>();

  for (const size of table) {
    const mm = typeof size.metric === 'number' && Number.isFinite(size.metric) ? size.metric : null;
    if (mm === null) {
      continue;
    }

    const key = sizeKey(mm);
    const hook = size.hook === true;
    const held = found.get(key);

    if (held === undefined || (held.hook && !hook)) {
      found.set(key, { key, id: size.id, mm, us: readUs(size.us), hook });
    }
  }

  return [...found.values()].sort((a, b) => a.mm - b.mm);
}

/**
 * The chosen sizes as the ids a write accepts.
 *
 * A size that is not in Ravelry's table — a drawer row measured in something
 * the reference data does not list — is simply left out: a project with one
 * needle listed is better than no project.
 */
export function needleSizeIds(
  keys: readonly string[],
  table: readonly RavelryNeedleSize[],
): number[] {
  const ids = new Map(sizeOptions(table).map((option) => [option.key, option.id]));
  const chosen: number[] = [];

  for (const key of keys) {
    const id = ids.get(key);
    if (id !== undefined && !chosen.includes(id)) {
      chosen.push(id);
    }
  }

  return chosen;
}
