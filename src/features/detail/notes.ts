/**
 * Notes, parsed.
 *
 * Ravelry hands a pattern's notes over twice: `notes`, which is whatever the
 * designer typed into a markdown box, and `notes_html`, which is Ravelry's own
 * render of it. `notes_html` is the canonical one — it has already resolved the
 * reference links (`[here!][1]` in the source is `<a href="…">here!</a>` in the
 * HTML) and it is the same text the website shows. `notes` is the fallback for
 * the records that only carry the source: a knitter's own project and stash
 * notes, which sync as markdown with no rendered twin.
 *
 * What comes out is a flat list of blocks, each a list of styled runs. No
 * React, no styles, no colours — the shapes here say *bold*, *link*, *item*,
 * and `rich-text.tsx` decides what those look like. That split is what lets a
 * plain Node harness feed this real notes from the API and check that nothing
 * survives as syntax.
 *
 * Three rules the parser is built around:
 *
 *   1. Never print markup. A tag is either understood or dropped, and a
 *      markdown delimiter is either emphasis or a character the author typed —
 *      `2 * 3` and `snake_case` keep theirs, `*a note` loses its star and
 *      italicises, and neither ever shows syntax.
 *   2. Never hang. Every scan is a forward `indexOf` or a sticky match over an
 *      index that always advances, so malformed input ends the loop rather than
 *      backtracking through it.
 *   3. Never trust a URL. Only http and https survive; anything else loses its
 *      link and stays as text.
 */

/** A screen's worth of reading. Past this the notes are silently cut. */
const MAX_SOURCE = 20_000;

/** A ceiling on blocks, so a pathological source cannot become a huge tree. */
const MAX_BLOCKS = 500;

/** How far emphasis and links may nest before the rest is taken as flat text. */
const MAX_INLINE_DEPTH = 4;

/** What a root-relative href in a note is relative to. */
const RAVELRY_BASE = "https://www.ravelry.com";

export type NoteRun = {
  readonly text: string;
  readonly strong: boolean;
  readonly em: boolean;
  /** An absolute http(s) URL, or null for a run that is not a link. */
  readonly href: string | null;
};

export type NoteBlockKind = "paragraph" | "heading" | "item" | "quote" | "rule";

export type NoteBlock = {
  readonly kind: NoteBlockKind;
  /** "·" or "3." on a list item; empty on everything else. */
  readonly marker: string;
  readonly runs: readonly NoteRun[];
};

// ---------------------------------------------------------------------------
// Entities
// ---------------------------------------------------------------------------

/**
 * The named entities that actually turn up in knitting notes — punctuation a
 * word processor inserted, symbols a designer typed, and the four that HTML
 * requires. An unknown name is left exactly as written: `&foo;` is text.
 */
const NAMED_ENTITY: Record<string, string> = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
  nbsp: " ",
  ensp: " ",
  emsp: " ",
  thinsp: " ",
  shy: "",
  ndash: "–",
  mdash: "—",
  minus: "−",
  hellip: "…",
  lsquo: "‘",
  rsquo: "’",
  sbquo: "‚",
  ldquo: "“",
  rdquo: "”",
  bdquo: "„",
  laquo: "«",
  raquo: "»",
  lsaquo: "‹",
  rsaquo: "›",
  bull: "•",
  middot: "·",
  dagger: "†",
  Dagger: "‡",
  copy: "©",
  reg: "®",
  trade: "™",
  deg: "°",
  plusmn: "±",
  times: "×",
  divide: "÷",
  frac12: "½",
  frac14: "¼",
  frac34: "¾",
  sup1: "¹",
  sup2: "²",
  sup3: "³",
  micro: "µ",
  para: "¶",
  sect: "§",
  euro: "€",
  pound: "£",
  yen: "¥",
  cent: "¢",
  larr: "←",
  rarr: "→",
  harr: "↔",
  hearts: "♥",
  check: "✓",
  cross: "✗",
};

const ENTITY = /&(#[xX][0-9a-fA-F]{1,6}|#\d{1,7}|[a-zA-Z][a-zA-Z0-9]{1,31});/g;

/** A code point that is safe to put on screen, or null. */
function fromCode(code: number): string | null {
  if (!Number.isInteger(code) || code <= 0 || code > 0x10ffff) {
    return null;
  }
  // Lone surrogates and the C0/C1 control blocks are not text.
  if (code >= 0xd800 && code <= 0xdfff) {
    return null;
  }
  if (code < 0x20 && code !== 0x09 && code !== 0x0a) {
    return null;
  }
  if (code >= 0x7f && code <= 0x9f) {
    return null;
  }
  return String.fromCodePoint(code);
}

/** `&amp;` → `&`, `&#8217;` → `’`, `&#x2014;` → `—`; anything else untouched. */
export function decodeEntities(text: string): string {
  if (!text.includes("&")) {
    return text;
  }

  return text.replace(ENTITY, (match: string, body: string) => {
    if (body.startsWith("#")) {
      const hex = body[1] === "x" || body[1] === "X";
      const code = hex ? Number.parseInt(body.slice(2), 16) : Number(body.slice(1));
      return fromCode(code) ?? match;
    }
    const named = NAMED_ENTITY[body] ?? NAMED_ENTITY[body.toLowerCase()];
    return named ?? match;
  });
}

// ---------------------------------------------------------------------------
// Links
// ---------------------------------------------------------------------------

/** Everything up to and including space, plus DEL: the classic scheme smuggling. */
const CONTROL = /[\u0000-\u0020\u007f]/g;
const SCHEME = /^([a-zA-Z][a-zA-Z0-9+.-]*):/;

/**
 * An href a browser may be handed, or null.
 *
 * Only http and https survive. `javascript:`, `data:` and friends return null
 * and the caller renders the label as ordinary text — a link that silently
 * does nothing would be worse, and a link that runs script would be worse
 * still. Control characters are stripped before the scheme is read, so
 * `java\tscript:` cannot pass as schemeless.
 */
export function safeUrl(raw: string | null | undefined): string | null {
  if (typeof raw !== "string") {
    return null;
  }

  const url = decodeEntities(raw).replace(CONTROL, "");
  if (url === "") {
    return null;
  }

  const scheme = SCHEME.exec(url);
  if (scheme !== null) {
    const name = scheme[1].toLowerCase();
    return name === "http" || name === "https" ? url : null;
  }

  // A bare anchor points inside a page this app never renders.
  if (url.startsWith("#")) {
    return null;
  }
  if (url.startsWith("//")) {
    return `https:${url}`;
  }
  if (url.startsWith("/")) {
    return `${RAVELRY_BASE}${url}`;
  }
  if (url.startsWith("www.")) {
    return `https://${url}`;
  }
  return `${RAVELRY_BASE}/${url}`;
}

// ---------------------------------------------------------------------------
// Blocks under construction
// ---------------------------------------------------------------------------

/** Drops empty runs and the whitespace at either end of a block. */
function tidy(runs: readonly NoteRun[]): NoteRun[] {
  const kept = runs.filter((run) => run.text !== "");
  if (kept.length === 0) {
    return [];
  }

  const first = kept[0];
  kept[0] = { ...first, text: first.text.replace(/^[ \t\n]+/, "") };

  const last = kept[kept.length - 1];
  kept[kept.length - 1] = { ...last, text: last.text.replace(/[ \t\n]+$/, "") };

  const final = kept.filter((run) => run.text !== "");
  return final.some((run) => run.text.trim() !== "") ? final : [];
}

/**
 * The one place a block is appended, so the ceiling and the "two rules in a
 * row are one rule" collapse are enforced once. Designers separate sections
 * with `<hr /><hr />` or forty dashes; the reader wants a single line.
 */
function append(blocks: NoteBlock[], block: NoteBlock): void {
  if (blocks.length >= MAX_BLOCKS) {
    return;
  }
  if (block.kind === "rule") {
    const previous = blocks[blocks.length - 1];
    // A rule leading the notes, or doubling one already drawn, is decoration.
    if (previous === undefined || previous.kind === "rule") {
      return;
    }
    blocks.push(block);
    return;
  }
  if (block.runs.length === 0) {
    return;
  }
  blocks.push(block);
}

// ---------------------------------------------------------------------------
// HTML
// ---------------------------------------------------------------------------

/** Blocks that end the current line of prose and start a new one. */
const BLOCK_TAG = new Set([
  "p",
  "div",
  "section",
  "article",
  "pre",
  "dl",
  "dt",
  "dd",
  "figure",
  "figcaption",
]);

/** Tags whose text is markup, not prose: skip to the closing tag and forget it. */
const OPAQUE_TAG = new Set(["script", "style", "iframe", "svg", "head", "noscript"]);

const HEADING_TAG = new Set(["h1", "h2", "h3", "h4", "h5", "h6"]);

const TAG_NAME = /^\s*([a-zA-Z][a-zA-Z0-9]*)/;
const HREF = /\shref\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'>]+))/i;
const COLLAPSIBLE = /[ \t\r\n\f\v]+/g;

/** True when `<` at this index opens something that could be a tag. */
function opensTag(source: string, index: number): boolean {
  const next = source[index + 1];
  if (next === undefined) {
    return false;
  }
  return next === "/" || next === "!" || next === "?" || /[a-zA-Z]/.test(next);
}

function parseHtml(source: string): NoteBlock[] {
  const lower = source.toLowerCase();
  const blocks: NoteBlock[] = [];

  let runs: NoteRun[] = [];
  let kind: NoteBlockKind = "paragraph";
  let marker = "";
  let strong = 0;
  let em = 0;
  let quote = 0;
  let href: string | null = null;
  const lists: { readonly ordered: boolean; index: number }[] = [];

  const flush = (): void => {
    const inner = tidy(runs);
    if (inner.length > 0) {
      // A paragraph inside a blockquote is still quoted; the local role wins
      // over the surrounding one only when it says something more specific.
      const effective = kind === "paragraph" && quote > 0 ? "quote" : kind;
      append(blocks, { kind: effective, marker, runs: inner });
    }
    runs = [];
    kind = "paragraph";
    marker = "";
  };

  const tail = (): string => {
    for (let index = runs.length - 1; index >= 0; index -= 1) {
      const text = runs[index].text;
      if (text !== "") {
        return text[text.length - 1];
      }
    }
    return "";
  };

  const write = (text: string): void => {
    if (text === "") {
      return;
    }
    const last = runs[runs.length - 1];
    const isStrong = strong > 0;
    const isEm = em > 0;
    if (
      last !== undefined &&
      last.strong === isStrong &&
      last.em === isEm &&
      last.href === href
    ) {
      runs[runs.length - 1] = { ...last, text: last.text + text };
      return;
    }
    runs.push({ text, strong: isStrong, em: isEm, href });
  };

  const writeText = (chunk: string): void => {
    // HTML whitespace collapses first, so a `&nbsp;` decoded afterwards keeps
    // the space the author asked for rather than being folded away with it.
    let text = decodeEntities(chunk.replace(COLLAPSIBLE, " "));
    const previous = tail();
    if (previous === "" || previous === "\n") {
      text = text.replace(/^ +/, "");
    }
    write(text);
  };

  /** `<br>`: a line break inside a block, not a block of its own. */
  const lineBreak = (): void => {
    if (tail() === "") {
      return;
    }
    const last = runs[runs.length - 1];
    if (last !== undefined) {
      runs[runs.length - 1] = { ...last, text: last.text.replace(/ +$/, "") };
    }
    write("\n");
  };

  let index = 0;
  while (index < source.length) {
    const open = source.indexOf("<", index);
    if (open < 0) {
      writeText(source.slice(index));
      break;
    }
    if (open > index) {
      writeText(source.slice(index, open));
    }

    // "I <3 socks": a `<` that opens nothing is a character, not a tag.
    if (!opensTag(source, open)) {
      writeText("<");
      index = open + 1;
      continue;
    }

    if (source.startsWith("<!--", open)) {
      const end = source.indexOf("-->", open + 4);
      index = end < 0 ? source.length : end + 3;
      continue;
    }

    const close = source.indexOf(">", open + 1);
    if (close < 0) {
      // A tag that never closes: the rest is markup we cannot read, and
      // printing it would be exactly the bug this file exists to fix.
      break;
    }

    const inside = source.slice(open + 1, close);
    index = close + 1;

    const closing = inside.startsWith("/");
    const body = closing ? inside.slice(1) : inside;
    const named = TAG_NAME.exec(body);
    if (named === null) {
      continue;
    }
    const name = named[1].toLowerCase();

    if (!closing && OPAQUE_TAG.has(name) && !body.trimEnd().endsWith("/")) {
      const end = lower.indexOf(`</${name}`, index);
      if (end < 0) {
        break;
      }
      const endClose = source.indexOf(">", end);
      index = endClose < 0 ? source.length : endClose + 1;
      continue;
    }

    if (BLOCK_TAG.has(name)) {
      flush();
      continue;
    }
    if (HEADING_TAG.has(name)) {
      flush();
      if (!closing) {
        kind = "heading";
      }
      continue;
    }
    if (name === "br") {
      lineBreak();
      continue;
    }
    if (name === "tr") {
      // A table is dropped to its text; a row still deserves its own line.
      lineBreak();
      continue;
    }
    if (name === "hr") {
      flush();
      append(blocks, { kind: "rule", marker: "", runs: [] });
      continue;
    }
    if (name === "blockquote") {
      flush();
      quote = closing ? Math.max(0, quote - 1) : quote + 1;
      continue;
    }
    if (name === "ul" || name === "ol") {
      flush();
      if (closing) {
        lists.pop();
      } else {
        lists.push({ ordered: name === "ol", index: 0 });
      }
      continue;
    }
    if (name === "li") {
      flush();
      if (!closing) {
        kind = "item";
        const list = lists[lists.length - 1];
        if (list !== undefined && list.ordered) {
          list.index += 1;
          marker = `${list.index}.`;
        } else {
          marker = "·";
        }
      }
      continue;
    }
    if (name === "strong" || name === "b") {
      strong = closing ? Math.max(0, strong - 1) : strong + 1;
      continue;
    }
    if (name === "em" || name === "i" || name === "u") {
      em = closing ? Math.max(0, em - 1) : em + 1;
      continue;
    }
    if (name === "a") {
      if (closing) {
        href = null;
      } else {
        const found = HREF.exec(body);
        href = found === null ? null : safeUrl(found[1] ?? found[2] ?? found[3]);
      }
      continue;
    }
    // `img` is dropped whole — a note's photo is a wave of its own, and alt
    // text mid-paragraph reads as a caption that wandered. Everything else
    // (`span`, `font`, `table`, `td`) loses the tag and keeps its text.
  }

  flush();
  return blocks;
}

// ---------------------------------------------------------------------------
// Markdown
// ---------------------------------------------------------------------------

const REF_DEFINITION = /^\s{0,4}\[([^\]]{1,200})\]:\s*(\S+)/;
const RULE_LINE = /^(?:-{3,}|\*{3,}|_{3,}|={3,}|—{2,})$/;
const HEADING_LINE = /^(#{1,6})\s+(.+)$/;
const BULLET_LINE = /^[-*+]\s+(.+)$/;
const NUMBERED_LINE = /^(\d{1,3})[.)]\s+(.+)$/;
const QUOTE_LINE = /^>\s?(.*)$/;
const AUTOLINK = /(?:https?:\/\/|www\.)[^\s<>"'`)\]]+/y;
const INLINE_TAG = /^<\/?[a-zA-Z][a-zA-Z0-9]*(?:\s[^>]*)?>/;
const ESCAPABLE = new Set([..."\\`*_{}[]()#+-.!>~|"]);
const TRAILING_PUNCTUATION = /[.,;:!?'"]+$/;

function isWordChar(character: string | undefined): boolean {
  return character !== undefined && /[A-Za-z0-9_]/.test(character);
}

/**
 * One line of markdown as styled runs.
 *
 * A delimiter is only consumed when its closing half exists on the same line;
 * otherwise the character is what the author typed and is written out as-is.
 * That is the difference between losing emphasis and printing `**`.
 */
function inlineRuns(
  text: string,
  refs: ReadonlyMap<string, string>,
  strong: boolean,
  em: boolean,
  depth: number,
): NoteRun[] {
  const runs: NoteRun[] = [];
  let plain = "";

  const flushPlain = (): void => {
    if (plain !== "") {
      runs.push({ text: decodeEntities(plain), strong, em, href: null });
      plain = "";
    }
  };

  const nest = (inner: string, nestedStrong: boolean, nestedEm: boolean): void => {
    flushPlain();
    if (depth >= MAX_INLINE_DEPTH) {
      runs.push({ text: decodeEntities(inner), strong: nestedStrong, em: nestedEm, href: null });
      return;
    }
    runs.push(...inlineRuns(inner, refs, nestedStrong, nestedEm, depth + 1));
  };

  const link = (label: string, url: string | null): void => {
    flushPlain();
    if (depth >= MAX_INLINE_DEPTH) {
      runs.push({ text: decodeEntities(label), strong, em, href: url });
      return;
    }
    for (const run of inlineRuns(label, refs, strong, em, depth + 1)) {
      runs.push(run.href === null ? { ...run, href: url } : run);
    }
  };

  let index = 0;
  while (index < text.length) {
    const character = text[index];

    if (character === "\\" && ESCAPABLE.has(text[index + 1])) {
      plain += text[index + 1];
      index += 2;
      continue;
    }

    // Raw HTML in a markdown note: drop the tag, keep whatever it wrapped.
    if (character === "<") {
      const tag = INLINE_TAG.exec(text.slice(index, index + 256));
      if (tag !== null) {
        index += tag[0].length;
        continue;
      }
      plain += character;
      index += 1;
      continue;
    }

    if (character === "*" || character === "_") {
      // Whether this delimiter opens emphasis at all, by CommonMark's
      // left-flanking rule reduced to what notes actually contain: it must not
      // be glued to the end of a word (`5*3`, `snake_case`) and must not be
      // followed by a space (`2 * 3`, the footnote star in `DPNs* in larger
      // size`). Those stay the characters the author typed.
      const next = text[index + 1];
      if (isWordChar(text[index - 1]) || next === undefined || next.trim() === "") {
        plain += character;
        index += 1;
        continue;
      }

      // An opener whose closing half never arrives runs to the end of the
      // block rather than being printed. Ravelry's own renderer does the same
      // — it lets emphasis cross a blank line, so `*Alternatively you can use…`
      // comes back from the API as a whole italic paragraph — and it is the
      // only reading that never puts an asterisk on screen.
      const triple = character.repeat(3);
      if (text.startsWith(triple, index)) {
        const end = text.indexOf(triple, index + 3);
        nest(end < 0 ? text.slice(index + 3) : text.slice(index + 3, end), true, true);
        index = end < 0 ? text.length : end + 3;
        continue;
      }

      const double = character.repeat(2);
      if (text.startsWith(double, index)) {
        const end = text.indexOf(double, index + 2);
        nest(end < 0 ? text.slice(index + 2) : text.slice(index + 2, end), true, em);
        index = end < 0 ? text.length : end + 2;
        continue;
      }

      const end = text.indexOf(character, index + 1);
      nest(end < 0 ? text.slice(index + 1) : text.slice(index + 1, end), strong, true);
      index = end < 0 ? text.length : end + 1;
      continue;
    }

    if (character === "`") {
      const end = text.indexOf("`", index + 1);
      if (end > index + 1) {
        plain += text.slice(index + 1, end);
        index = end + 1;
        continue;
      }
      plain += character;
      index += 1;
      continue;
    }

    if (character === "[") {
      const label = text.indexOf("]", index + 1);
      if (label > index) {
        const after = text[label + 1];
        if (after === "(") {
          const end = text.indexOf(")", label + 2);
          if (end > label + 1) {
            const target = text.slice(label + 2, end).trim().split(/\s+/)[0];
            link(text.slice(index + 1, label), safeUrl(target));
            index = end + 1;
            continue;
          }
        } else if (after === "[") {
          const end = text.indexOf("]", label + 2);
          if (end >= label + 2) {
            const label_ = text.slice(index + 1, label);
            const written = text.slice(label + 2, end).trim().toLowerCase();
            const key = written === "" ? label_.trim().toLowerCase() : written;
            link(label_, safeUrl(refs.get(key)));
            index = end + 1;
            continue;
          }
        } else {
          const key = text.slice(index + 1, label).trim().toLowerCase();
          const target = refs.get(key);
          if (target !== undefined) {
            link(text.slice(index + 1, label), safeUrl(target));
            index = label + 1;
            continue;
          }
        }
      }
      plain += character;
      index += 1;
      continue;
    }

    if ((character === "h" || character === "w") && !isWordChar(text[index - 1])) {
      AUTOLINK.lastIndex = index;
      const found = AUTOLINK.exec(text);
      if (found !== null) {
        const matched = found[0].replace(TRAILING_PUNCTUATION, "");
        if (matched.length > 8) {
          flushPlain();
          runs.push({ text: matched, strong, em, href: safeUrl(matched) });
          index += matched.length;
          continue;
        }
      }
    }

    plain += character;
    index += 1;
  }

  flushPlain();
  return runs;
}

function parseMarkdown(source: string): NoteBlock[] {
  const refs = new Map<string, string>();
  const lines: string[] = [];

  for (const line of source.replace(/\r\n?/g, "\n").split("\n")) {
    const definition = REF_DEFINITION.exec(line);
    if (definition !== null) {
      refs.set(definition[1].trim().toLowerCase(), definition[2]);
      continue;
    }
    lines.push(line);
  }

  const blocks: NoteBlock[] = [];
  let pending: string[] = [];
  let pendingKind: NoteBlockKind = "paragraph";

  const flush = (): void => {
    if (pending.length > 0) {
      const text = pending.join("\n").trim();
      if (text !== "") {
        append(blocks, {
          kind: pendingKind,
          marker: "",
          runs: tidy(inlineRuns(text, refs, false, false, 0)),
        });
      }
    }
    pending = [];
    pendingKind = "paragraph";
  };

  const push = (kind: NoteBlockKind, marker: string, text: string): void => {
    flush();
    append(blocks, { kind, marker, runs: tidy(inlineRuns(text, refs, false, false, 0)) });
  };

  for (const line of lines) {
    const trimmed = line.trim();

    if (trimmed === "") {
      flush();
      continue;
    }
    if (RULE_LINE.test(trimmed)) {
      flush();
      append(blocks, { kind: "rule", marker: "", runs: [] });
      continue;
    }

    const heading = HEADING_LINE.exec(trimmed);
    if (heading !== null) {
      push("heading", "", heading[2]);
      continue;
    }

    const bullet = BULLET_LINE.exec(trimmed);
    if (bullet !== null) {
      push("item", "·", bullet[1]);
      continue;
    }

    const numbered = NUMBERED_LINE.exec(trimmed);
    if (numbered !== null) {
      push("item", `${numbered[1]}.`, numbered[2]);
      continue;
    }

    const quoted = QUOTE_LINE.exec(trimmed);
    if (quoted !== null) {
      if (pendingKind !== "quote") {
        flush();
      }
      pendingKind = "quote";
      pending.push(quoted[1]);
      continue;
    }

    if (pendingKind !== "paragraph") {
      flush();
    }
    // Ravelry treats a single newline as a hard break — its own renderer emits
    // `<br />` for one — so continuation lines keep their break.
    pending.push(trimmed);
  }

  flush();
  return blocks;
}

// ---------------------------------------------------------------------------
// Entry
// ---------------------------------------------------------------------------

const TAG_SHAPED = /<[^>]*>/g;

function clip(value: string | null | undefined): string | null {
  if (typeof value !== "string" || value === "") {
    return null;
  }
  return value.length > MAX_SOURCE ? value.slice(0, MAX_SOURCE) : value;
}

/** Anything outside a tag that is not whitespace. Cheap, and never throws. */
function hasProse(source: string): boolean {
  return source.replace(TAG_SHAPED, "").trim() !== "";
}

/**
 * True when there is a note to draw, so a screen can decide whether to open
 * the section at all without parsing it twice.
 */
export function hasNotes(
  html: string | null | undefined,
  markdown: string | null | undefined,
): boolean {
  const fromHtml = clip(html);
  if (fromHtml !== null && hasProse(fromHtml)) {
    return true;
  }
  const fromMarkdown = clip(markdown);
  return fromMarkdown !== null && fromMarkdown.trim() !== "";
}

/**
 * Notes as blocks.
 *
 * `notes_html` wins whenever it carries prose: it is Ravelry's own render, with
 * reference links already resolved into real hrefs. `notes` — the markdown a
 * knitter typed — is what a project or a stash entry syncs with, and is read
 * only when there is no HTML twin.
 */
export function parseNotes(
  html: string | null | undefined,
  markdown: string | null | undefined,
): NoteBlock[] {
  const fromHtml = clip(html);
  if (fromHtml !== null && hasProse(fromHtml)) {
    return parseHtml(fromHtml);
  }
  const fromMarkdown = clip(markdown);
  if (fromMarkdown !== null && fromMarkdown.trim() !== "") {
    return parseMarkdown(fromMarkdown);
  }
  return [];
}
