/**
 * A pattern, in full.
 *
 * This is the one screen in the app whose content is genuinely online: nothing
 * caches a pattern's yardage or needle sizes, so the facts come from
 * `patternShow` every time. What is cached is the bookmark — if this pattern is
 * in Saves, its name, designer and photo are already on the device, so they go
 * up on the first frame and the live payload fills in around them. A pattern
 * that will not load and was never saved is the only genuinely empty case, and
 * it says so in one line rather than a dialog.
 *
 * The action block is a row of two, and the first of them is still the point
 * of the screen: "Start project", filled and twice the width, which only
 * appears once there is a session to write with and a live pattern to write
 * about — a project needs the craft, and only the live payload carries it.
 * Beside it, "Save", which is the ♥ on the photo said as a control: it
 * bookmarks the pattern on Ravelry, which is what fills the Saves tab.
 *
 * Save asks for less than Start project — a session and an id, no payload —
 * and the row is drawn on the stricter condition anyway. The only pattern that
 * satisfies the weaker one and not the stronger is a pattern showing from its
 * cached bookmark, and a pattern with a cached bookmark is by definition
 * already saved; a second gate would buy an inert "Saved" on a screen that
 * already has the ♥ up, and nothing else.
 *
 * Starting a project saves the pattern too. Casting on says everything
 * bookmarking says and more, and a knitter who did the first would have to be
 * told why they still had to do the second. The write goes out and the route
 * is pushed without waiting for it: the flow they asked for should not queue
 * behind a round trip. A save that fails behind a departed screen fails
 * silently, on purpose — there is nowhere honest left to report it, and the
 * alternative is an alert about housekeeping on top of the screen they wanted.
 *
 * Under it is the Offline block, which is deliberately quiet. It is the
 * one place in the app that can put a pattern PDF on the phone, and it says
 * only what is true of this pattern right now: that the file is already here,
 * that the knitter owns the pattern and it could be, that the pattern is free
 * and could be both, or — for a paid pattern nobody has bought — what it costs
 * and where to buy it. That last one used to be a dead end on the reasoning
 * that this app never sells, which it still does not: the Buy control hands
 * over to Ravelry's own purchase page in a browser, takes no money, and holds
 * no card. What it stopped doing was pretending the page did not exist, which
 * left a knitter looking at a pattern with no way to reach the one thing
 * Ravelry offers them. Determining which line to draw costs one walk of the
 * library per session (see `pdfs.ts`), and costs nothing at all once the file
 * is on the device.
 *
 * One case answers before the library is asked anything, and outranks all of
 * them: a pattern whose PDF is on the designer's own site rather than
 * Ravelry's. Nothing this block can *fetch* will put that file on the phone — a
 * library entry for it comes back empty, which used to be an offer that ended
 * in "no PDF on this one yet" — so it stops offering, says where the file
 * actually is, and hands over the designer's page in a browser.
 *
 * Which is half a next step, and the other half is "Import a PDF". A knitter
 * who taps through to the designer's site downloads the pattern there like
 * anybody else, and it lands in their Files; a knitter who bought it on Etsy
 * has had it in their Files for a year. So the block offers to take the file
 * wherever the ladder has otherwise run out — beside the designer's page, under
 * the paid-and-unowned sentence, and after a Ravelry download that came back
 * with nothing attached. Not beside a download that would work: two ways to do
 * the same thing is one more than a quiet block should have. An imported file
 * is the same file in the same folder as a downloaded one and every screen
 * treats it identically; only the stamped line here says which it was, because
 * where a pattern came from is worth knowing and nothing else about it is.
 *
 * Running under all of that, on every pattern, is "View on Ravelry". It is the
 * only control here that is not conditional on anything, and it is the one that
 * was missing: every other control in the block is about what can be *done*
 * with the file, and on most patterns the answer is nothing much. Ravelry hosts
 * the download for the great majority of them, which rules out the designer's
 * link entirely — so a paid pattern the knitter does not own used to offer
 * "Import a PDF" and no way to go and look at the pattern itself. The link is
 * composed from the permalink rather than read from the payload, because the
 * payload has no ravelry.com URL in it: `url` is the designer's site and
 * `download_location.url` is wherever the file is. Neither is the pattern.
 *
 * Its presence is also why the block is no longer conditional on having
 * something to say about a file. On a pattern with no download to offer it is
 * now a label and one link, which is a good deal more use than nothing.
 */

import { router, useLocalSearchParams } from "expo-router";
import * as WebBrowser from "expo-web-browser";
import { useCallback, useEffect, useMemo, useState } from "react";
import { ScrollView, StyleSheet, Text, View } from "react-native";
import {
  SafeAreaView,
  useSafeAreaInsets,
} from "react-native-safe-area-context";

import { useAuth } from "@/auth/context";
import { BackBar } from "@/components/back-bar";
import { Button } from "@/components/ui/app-button";
import { Badge } from "@/components/ui/badge";
import { PhotoFrame } from "@/components/ui/photo-frame";
import { Stamp } from "@/components/ui/stamp";
import {
  addToLibraryAndDownload,
  classifyPatternDownload,
  deletePatternPdf,
  ensurePatternPdf,
  favoritesCreate,
  getFavoriteByPatternId,
  importPatternPdf,
  patternShow,
  probePatternLibrary,
  RavelryApiError,
  refreshFavorites,
  usePatternPdf,
  type ImportProblem,
  type LibraryProbe,
  type PdfProblem,
  type RavelryPatternDetail,
} from "@/data";
import { choosePdf } from "@/features/detail/pick-pdf";
import {
  at,
  decimal,
  firstNumber,
  firstString,
  isTrue,
  parseRaw,
  readId,
  readNumber,
  readString,
} from "@/features/detail/raw";
import { hasNotes, RichText } from "@/features/detail/rich-text";
// The three words every write in this app answers to, stated once beside Cast
// on and borrowed here for the fourth: a bookmark fails the same three ways.
import { triage, type Problem } from "@/features/start-project/problem";
import { fonts, space, trackSmall, type, useTheme } from "@/theme";

type PatternState = {
  /** The request has answered, one way or the other. */
  readonly settled: boolean;
  readonly pattern: RavelryPatternDetail | null;
  /** The failure was "could not reach Ravelry" rather than "Ravelry said no". */
  readonly offline: boolean;
};

const PENDING: PatternState = { settled: false, pattern: null, offline: false };

/**
 * What the Offline block is showing.
 *
 * `ask` is the paid-and-unowned case, and it is a sentence rather than a
 * control on purpose: the only honest next step is on Ravelry, and this app
 * does not send anybody there to spend money.
 *
 * `external` is the case where there is nothing to download at all, free or
 * paid, owned or not: the file is the designer's, not Ravelry's. It keeps a
 * control, because unlike `ask` there is somewhere useful to go.
 */
type OfflineView = "downloaded" | "download" | "add" | "ask" | "external";

/** One quiet line per way a download can not happen. */
const PDF_NOTICES: Record<PdfProblem, string> = {
  notInLibrary: "Not in your Ravelry library.",
  noDownload: "No PDF on this one yet.",
  externalDownload: "PDF lives on the designer's site.",
  // Aqua, not mustard: nothing went wrong, the request simply never left.
  offline: "You're offline · try again later.",
  signedOut: "Sign in on the You tab to download.",
  failed: "Couldn't download the pattern.",
};

/**
 * One quiet line per way an import can not happen.
 *
 * Two, because an import touches nothing but the filesystem: there is no
 * library to be outside of and no network to be off. `notAPdf` is the one the
 * knitter can act on, so it says what is actually wrong rather than being
 * folded into "couldn't" — they picked the wrong file, and the fix is to pick
 * again.
 */
const IMPORT_NOTICES: Record<ImportProblem, string> = {
  notAPdf: "That file isn't a PDF.",
  failed: "Couldn't import that file.",
};

/**
 * One quiet line per way a save can not happen.
 *
 * The same three words every write in this app answers to, and the same
 * colours as the block below: aqua for a request that never left, mustard for
 * one that did and came back wrong. Never red — nothing here is dangerous, and
 * a bookmark that did not take is worth a sentence, not an alarm.
 *
 * `signedOut` is drawn even though the button needs a session to appear at
 * all: the token can be refused between the frame that drew it and the tap.
 */
const SAVE_NOTICES: Record<Problem, string> = {
  offline: "You're offline · try again later.",
  signedOut: "Sign in on the You tab to save.",
  failed: "Couldn't save this pattern.",
};

/**
 * The `external` line, in the block's own register: what is true, then what
 * follows from it. Not mustard — nothing has gone wrong, and the two controls
 * under it are the two halves of a next step that works.
 *
 * It used to end "can't be saved here", which was true of a block that could
 * only fetch. Now that a knitter can bring the file back themselves, saying so
 * would be the app refusing something it does in fact do.
 */
const EXTERNAL_NOTICE =
  "PDF lives on the designer's site · save it there, then import it.";

/**
 * `personal_attributes` only arrives on a request made with a person's token,
 * so its exact keys could not be observed with read-only app credentials.
 * Several spellings are accepted per attribute and anything unrecognised reads
 * as absent — a missing badge is a far smaller lie than a wrong one.
 */
const SAVED_KEYS = ["favorited", "favorite", "is_favorite", "bookmarked"];
const LIBRARY_KEYS = ["in_library", "library", "is_in_library", "owned"];
const QUEUED_KEYS = ["queued", "in_queue", "is_queued", "queue"];

/** The biggest photo Ravelry offers, since this frame is the width of the screen. */
const HERO_KEYS = [
  ["medium2_url"],
  ["medium_url"],
  ["small2_url"],
  ["small_url"],
  ["square_url"],
] as const;

function heroPhoto(pattern: RavelryPatternDetail): string | undefined {
  const photos = pattern.photos;
  const candidates = [
    Array.isArray(photos) ? photos[0] : null,
    pattern.first_photo,
  ];

  for (const candidate of candidates) {
    const url = firstString(candidate, HERO_KEYS);
    if (url !== null) {
      return url;
    }
  }

  return undefined;
}

/** http(s) only, trimmed, and null for the empty string Ravelry sends a lot of. */
function webUrl(value: unknown): string | null {
  const text = readString(value)?.trim() ?? null;

  return text !== null && /^https?:\/\/\S/i.test(text) ? text : null;
}

/**
 * "90 NOK", "6 USD".
 *
 * The amount arrives as a number on every payload seen and is typed as a
 * string, so both are accepted. The currency is printed as Ravelry's own code
 * rather than mapped to a symbol: these patterns are priced in DKK, NOK, CHF
 * and USD, and a "$" in front of a Danish price would be a wrong answer where
 * the code is merely a plain one.
 */
function priceLabel(amount: unknown, currency: unknown): string | null {
  const value = readNumber(amount) ?? readNumber(readString(amount));

  if (value === null || value <= 0) {
    return null;
  }

  const code = readString(currency)?.trim() ?? null;
  const shown = decimal(value);

  return code === null || code === "" ? shown : `${shown} ${code}`;
}

function designerName(pattern: RavelryPatternDetail): string | null {
  return firstString(pattern, [
    ["pattern_author", "name"],
    ["designer", "name"],
  ]);
}

/** "820 yd", "820–950 yd", or whatever prose the designer wrote instead. */
function yardage(pattern: RavelryPatternDetail): string | null {
  const min = readNumber(pattern.yardage);
  if (min === null) {
    return readString(pattern.yardage_description);
  }

  const max = readNumber(pattern.yardage_max);
  return max !== null && max > min
    ? `${Math.round(min)}–${Math.round(max)} yd`
    : `${Math.round(min)} yd`;
}

/**
 * The distinct metric sizes the pattern lists, thinnest first. A pattern names
 * a set of sizes rather than a range — body and ribbing are different needles,
 * not the ends of a span — so they are listed, not collapsed.
 */
function needleSizes(pattern: RavelryPatternDetail): string | null {
  const sizes = pattern.pattern_needle_sizes;
  if (!Array.isArray(sizes)) {
    return null;
  }

  const found = new Set<number>();
  for (const size of sizes) {
    const mm = firstNumber(size, [["metric"], ["size_metric"], ["mm"]]);
    if (mm !== null && mm > 0) {
      found.add(mm);
    }
  }

  const sorted = [...found].sort((a, b) => a - b);
  return sorted.length === 0 ? null : `${sorted.map(decimal).join(", ")} mm`;
}

/** "22 sts / 4 in". Only the numeric form — the prose one is a paragraph. */
function gauge(pattern: RavelryPatternDetail): string | null {
  const stitches = readNumber(pattern.gauge);
  if (stitches === null) {
    return null;
  }

  const divisor = readNumber(pattern.gauge_divisor);
  return divisor === null || divisor <= 0
    ? `${decimal(stitches)} sts`
    : `${decimal(stitches)} sts / ${decimal(divisor)} in`;
}

export default function PatternScreen() {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const { status, user } = useAuth();
  const { id: param } = useLocalSearchParams<"/pattern/[id]">();

  const id = readId(param);
  const username = user?.username ?? null;
  // Synchronous, so the saved copy is on screen before the request leaves.
  const cached = useMemo(
    () => (id === null ? null : getFavoriteByPatternId(id)),
    [id],
  );

  const [state, setState] = useState<PatternState>(PENDING);

  // The one fact the Offline block can read synchronously, live: a file on the
  // device. Everything else about it has to be asked for.
  const pdf = usePatternPdf(id);
  const [probe, setProbe] = useState<LibraryProbe | null>(null);
  const [busy, setBusy] = useState<"download" | "add" | null>(null);
  const [problem, setProblem] = useState<PdfProblem | null>(null);
  // Kept apart from `busy`/`problem` above: those two are the Ravelry chain's,
  // and an import runs on neither the library nor the network.
  const [importing, setImporting] = useState(false);
  const [importProblem, setImportProblem] = useState<ImportProblem | null>(
    null,
  );

  // The bookmark's own three, kept apart from both of the above for the same
  // reason they are kept apart from each other: a save has nothing to do with
  // a PDF, and one failure must never be drawn under the other's button.
  const [saving, setSaving] = useState(false);
  const [saveProblem, setSaveProblem] = useState<Problem | null>(null);
  /**
   * The bookmark this screen made itself.
   *
   * `cached` is read once, synchronously, when the screen opens, and a write
   * that lands under it cannot make it read again — so without this the ♥
   * would wait for a remount to appear, which is a sync at best and a relaunch
   * at worst. Set the moment the POST answers rather than after the refresh
   * below it: the bookmark exists on Ravelry at that point, and the mirror
   * catching up is housekeeping the knitter should not have to watch.
   */
  const [savedNow, setSavedNow] = useState(false);

  useEffect(() => {
    // A route with no usable id asks Ravelry nothing; see `settled` below.
    if (id === null) {
      return;
    }

    let cancelled = false;

    void (async () => {
      try {
        const pattern = await patternShow(id);
        if (!cancelled) {
          setState({ settled: true, pattern, offline: false });
        }
      } catch (error) {
        if (cancelled) {
          return;
        }
        // Anything that is not a reachable-but-unhappy Ravelry — including a
        // cleared session — is treated as "not reachable", which is the state
        // the fallback below is written for.
        setState({
          settled: true,
          pattern: null,
          offline: !(error instanceof RavelryApiError) || error.offline,
        });
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [id]);

  /**
   * Is this pattern in the knitter's library?
   *
   * Not asked at all when the answer cannot matter: no id, nobody signed in,
   * or the PDF is already here — a file on the device is proof of ownership
   * and there is nothing left to look up. When it is asked, it is answered
   * from the library index in `pdfs.ts`, which is walked once a session, so
   * the second pattern opened costs no request at all.
   */
  useEffect(() => {
    if (id === null || username === null || pdf !== null) {
      return;
    }

    let cancelled = false;

    void (async () => {
      // `probePatternLibrary` reports through its answer rather than throwing.
      const answer = await probePatternLibrary(username, id);
      if (!cancelled) {
        setProbe(answer);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [id, pdf, username]);

  /**
   * Where this pattern's PDF is, as the payload tells it.
   *
   * The one fact about downloading that needs no request at all — and the one
   * that can rule the whole block out. Only the live payload carries it: a
   * pattern read from the cached bookmark reads `unknown`, which is exactly the
   * behaviour the block had before this existed.
   */
  const download = useMemo(
    () => classifyPatternDownload(state.pattern),
    [state.pattern],
  );

  /**
   * The two ways to get a PDF onto the phone, which differ by one call.
   *
   * `add` writes to the knitter's library, so the block only offers it for a
   * pattern Ravelry says is free — and hands `addToLibraryAndDownload` what the
   * payload said, so an external one is refused there too even if this screen
   * ever asks for it by mistake. Neither throws — both answer — so a failure is
   * a line under the button rather than something to catch.
   */
  const acquire = useCallback(
    (kind: "download" | "add") => {
      if (id === null || username === null || busy !== null) {
        return;
      }

      setBusy(kind);
      setProblem(null);
      setImportProblem(null);

      void (async () => {
        const outcome =
          kind === "add"
            ? await addToLibraryAndDownload(username, id, download)
            : await ensurePatternPdf(username, id);

        setBusy(null);

        if (outcome.ok) {
          return;
        }

        setProblem(outcome.reason);

        // The library said something the probe did not. Believe the library.
        if (outcome.reason === "notInLibrary") {
          setProbe({ kind: "notInLibrary" });
        }
      })();
    },
    [busy, download, id, username],
  );

  /**
   * The other way in: the knitter's own copy of the file.
   *
   * Needs no session and no library — a pattern bought on Etsy is a PDF in
   * Files and nothing else — so unlike `acquire` this asks for neither. Backing
   * out of the picker is the commonest outcome by far and is completely silent:
   * nothing was attempted, so there is nothing to report.
   *
   * A file that lands clears `problem` on the way past. "No PDF on this one
   * yet" is what sent them here and it is answered now; leaving it in mustard
   * under "Imported · available offline" would be the block arguing with
   * itself.
   */
  const importPdf = useCallback(() => {
    if (id === null || importing) {
      return;
    }

    setImporting(true);
    setImportProblem(null);

    void (async () => {
      // Both of these report through their answers rather than throwing.
      const picked = await choosePdf();

      if (picked.kind !== "picked") {
        setImporting(false);
        // A picker that would not open is the one thing here worth a line;
        // a knitter who changed their mind is not.
        if (picked.kind === "unavailable") {
          setImportProblem("failed");
        }
        return;
      }

      const outcome = await importPatternPdf(id, picked.file);
      setImporting(false);

      if (outcome.ok) {
        setProblem(null);
      } else {
        setImportProblem(outcome.reason);
      }
    })();
  }, [id, importing]);

  const removeDownload = useCallback(() => {
    if (id === null) {
      return;
    }

    const imported = pdf?.source === "imported";

    deletePatternPdf(id);
    setProblem(null);
    setImportProblem(null);
    // A downloaded copy was proof of ownership, and removing it changes only
    // what is on the phone — so the block goes straight back to offering the
    // download rather than asking the library again. An imported copy proves
    // nothing of the sort: it may have been bought somewhere Ravelry has never
    // heard of, and claiming a library entry for it would offer a download
    // that comes back "not in your Ravelry library". So that one is asked
    // again, which the probe does by itself the moment the row is gone.
    setProbe(imported ? null : { kind: "inLibrary" });
  }, [id, pdf]);

  const pattern = state.pattern;
  // A malformed id is answered without asking: there is nothing in flight.
  const settled = id === null || state.settled;
  const attributes =
    pattern === null ? null : at(pattern, ["personal_attributes"]);

  const name =
    (pattern === null ? null : readString(pattern.name)) ??
    cached?.name ??
    "Untitled pattern";
  const designer =
    (pattern === null ? null : designerName(pattern)) ??
    cached?.designer ??
    null;
  const photo =
    (pattern === null ? undefined : heroPhoto(pattern)) ??
    cached?.photoUrl ??
    undefined;
  const free = pattern === null ? cached?.free === true : pattern.free === true;

  // A bookmark row on the device is proof on its own; `personal_attributes`
  // is the answer for a pattern that was never synced into Saves; and
  // `savedNow` is the one this screen has just made, which neither of the
  // other two can know about yet.
  const saved = cached !== null || savedNow || isTrue(attributes, SAVED_KEYS);
  const inLibrary = isTrue(attributes, LIBRARY_KEYS);
  const queued = isTrue(attributes, QUEUED_KEYS);

  const facts =
    pattern === null
      ? []
      : [
          { label: "yardage", value: yardage(pattern) },
          {
            label: "weight",
            value: firstString(pattern, [["yarn_weight", "name"]]),
          },
          { label: "needle", value: needleSizes(pattern) },
          { label: "gauge", value: gauge(pattern) },
        ].filter((fact) => fact.value !== null);

  // Ravelry renders the designer's markdown itself and sends both; the
  // rendered one is canonical, and the source is only read when it is missing.
  const notesHtml = pattern === null ? null : readString(pattern.notes_html);
  const notesMarkdown = pattern === null ? null : readString(pattern.notes);

  // Nothing live and nothing saved: one quiet line is the whole screen.
  const empty = pattern === null && cached === null;

  // Only the live payload can be started from: the cached bookmark carries a
  // name and a photo, not the craft, and a project needs the pattern itself.
  const canStart = status === "signedIn" && pattern !== null && id !== null;
  const craft =
    pattern === null ? null : firstString(pattern, [["craft", "permalink"]]);

  /**
   * The write itself: bookmark the pattern, then bring Saves level.
   *
   * Shared by both controls in the row, which want exactly the same thing from
   * Ravelry and disagree only about what to do when it does not happen — so
   * this throws whatever the call threw and leaves that decision upstairs. One
   * has a line to draw under a button; the other has already left the screen.
   *
   * The refresh is awaited and its outcome ignored, the same bargain
   * `finishProject` strikes: the Saves tab reads the mirror rather than the
   * network, so the row has to be written there — but `refreshFavorites`
   * reports rather than throwing, and a refresh that could not land has
   * un-bookmarked nothing. The next full sync carries it.
   */
  const bookmark = useCallback(async (who: string, patternId: number) => {
    await favoritesCreate(who, patternId);
    setSavedNow(true);
    await refreshFavorites(who);
  }, []);

  /**
   * The Save button.
   *
   * Refuses a second attempt while one is in flight and refuses one entirely
   * on a pattern that is already saved — this button does not un-save, and a
   * duplicate bookmark is not something to find out about from Ravelry. Every
   * attempt starts clean, so the last failure clears on retry.
   */
  const save = useCallback(() => {
    if (id === null || username === null || saving || saved) {
      return;
    }

    setSaving(true);
    setSaveProblem(null);

    void (async () => {
      try {
        await bookmark(username, id);
      } catch (error) {
        setSaveProblem(triage(error));
      } finally {
        setSaving(false);
      }
    })();
  }, [bookmark, id, saved, saving, username]);

  /**
   * Start project, which saves on the way past.
   *
   * The save is started and then let go of: casting on is what was asked for,
   * and making the knitter watch a bookmark round-trip before the flow opens
   * would be charging them for a courtesy. Skipped outright when the pattern
   * is already saved, and when there is no session to write with — `canStart`
   * has already established there is one, so that second guard is only here
   * because `username` is separately typed nullable.
   *
   * The failure is swallowed, and that is the decision rather than an
   * oversight: by the time it comes back this screen is behind another one,
   * and there is no honest place left to say so. Nothing was lost that the
   * knitter cannot redo from the button they can see when they come back —
   * which is why this deliberately does not touch `saving` on the way out.
   * Borrowing that flag would put "Saving…" under the row for the length of
   * the push animation, and would leave a knitter who came back to a failed
   * save looking at a button too disabled to retry with.
   */
  const start = useCallback(() => {
    if (id === null) {
      return;
    }

    if (!saved && username !== null) {
      void bookmark(username, id).catch(() => undefined);
    }

    router.push({
      pathname: "/start-project",
      // `undefined` is dropped from the link; a pattern with no craft simply
      // arrives without one, and knits by default.
      params: { patternId: id, patternName: name, craft: craft ?? undefined },
    });
  }, [bookmark, craft, id, name, saved, username]);

  /**
   * Which of the five things the Offline block has to say, or nothing.
   *
   * Nothing is a real answer here and the common one on the way in: until the
   * library has answered there is no honest line to draw, and a block that
   * appears when it has something to say is quieter than one that sits there
   * saying "checking". A request in flight keeps its own line rather than
   * disappearing, and a library that could not be reached says nothing at all —
   * being offline is not news on a screen about reading offline.
   *
   * `external` sits second, under the file itself and above everything the
   * library could say, because it answers all of it: owned or not, free or
   * paid, there is no Ravelry file to fetch. It needs no probe either, so on an
   * external pattern the block is honest on the first frame after the payload
   * lands. A copy already on the device still wins — however it got here, it
   * reads offline, and that is the whole point of the block.
   */
  const offline: OfflineView | null =
    pdf !== null
      ? "downloaded"
      : download.kind === "external"
        ? "external"
        : busy !== null
          ? busy
          : probe === null ||
              probe.kind === "unknown" ||
              probe.kind === "downloaded"
            ? null
            : probe.kind === "inLibrary"
              ? "download"
              : // Not owned. Whether that is an offer or a sentence depends on
                // the `free` flag, which only the live payload carries.
                !settled
                ? null
                : free
                  ? "add"
                  : "ask";

  /**
   * The failure line under the block, when there is one to draw.
   *
   * Never under the `external` line. An attempt already in flight when the
   * payload landed comes back "no PDF on this one yet", which is the same fact
   * said worse — and said in mustard, as though something had gone wrong.
   */
  const notice = offline === "external" ? null : problem;

  const externalUrl = download.kind === "external" ? download.url : null;

  /**
   * The pattern's own page on ravelry.com.
   *
   * Built rather than read, because the payload does not carry one. `url` is
   * the *designer's* site when there is a designer's site, and null otherwise;
   * `download_location.url` is wherever the file is. Neither is a link to the
   * pattern. What every pattern does have is a `permalink`, and Ravelry's
   * library URL is that permalink — so the link is composed from it.
   *
   * This is the control that had been missing, and its absence was loudest
   * exactly where it was needed most. `ravelry_download` is true for the great
   * majority of patterns, which makes `download.kind` `ravelry` and leaves
   * `showExternalLink` false — so a paid pattern nobody here owns drew "Import
   * a PDF" and no way to go and look at the thing. It also quietly covers the
   * case that used to draw nothing at all: an external pattern whose URL did
   * not survive `readWebUrl`.
   *
   * Falls back to the cached bookmark, so it is still a link offline — the
   * permalink is in `favorites.raw` and does not change.
   */
  const permalink =
    (pattern === null ? null : readString(pattern.permalink)) ??
    firstString(parseRaw(cached?.raw), [
      ["favorited", "permalink"],
      ["permalink"],
    ]);

  const ravelryUrl =
    permalink === null
      ? null
      : `https://www.ravelry.com/patterns/library/${encodeURIComponent(permalink)}`;

  /**
   * The two links Ravelry's own page has that this screen did not.
   *
   * Both are in the payload and both were being dropped on the floor:
   *
   * - **Where it is bought.** `download_location.url` is a `/purchase/` link
   *   for a paid pattern and a `/dls/` one for a free pattern, and
   *   `classifyPatternDownload` keeps it only for the `external` case — so for
   *   the great majority of paid patterns, which Ravelry hosts itself, the URL
   *   was read and thrown away. `free === false` is what separates the two,
   *   rather than the shape of the path.
   * - **The designer's own site.** `pattern.url`, which nothing here read. It
   *   is the empty string as often as not, and on an external pattern it is
   *   usually the same link the download block already offers — so it is
   *   trimmed, scheme-checked, and dropped when it duplicates that one.
   */
  const location = pattern?.download_location ?? null;
  const locationType = readString(location?.type)?.toLowerCase() ?? null;

  const purchaseUrl =
    location !== null && location.free === false && locationType !== "external"
      ? webUrl(location.url)
      : null;

  const siteUrl = webUrl(pattern?.url);
  const websiteUrl = siteUrl === externalUrl ? null : siteUrl;

  /** "90 NOK", "6 USD" — the currency as Ravelry names it, never guessed at. */
  const price = pattern === null ? null : priceLabel(pattern.price, pattern.currency);

  /**
   * Whether the block offers to take a file by hand.
   *
   * Exactly where the ladder has run out, and nowhere else:
   *
   * - `external`, where the file was never Ravelry's and the browser above is
   *   only the first half of getting it.
   * - `ask`, the paid pattern nobody here has bought — which is precisely the
   *   pattern somebody bought on Etsy or LoveCrafts and already has.
   * - after a real `noDownload`, where Ravelry was asked for the file, took the
   *   pattern into the library, and had nothing to attach.
   *
   * Not beside "Download for offline" or "Add to library & download" while
   * either still might work: a second way to do the same thing is one more
   * than this block should have, and the Ravelry copy is the better one — it
   * comes with a volume and an attachment and can be fetched again. Not while
   * a download is in flight, for the same reason. Not once a file is here,
   * where the two controls are Open and Remove and neither is this.
   */
  const canImport =
    pdf === null &&
    busy === null &&
    (offline === "external" || offline === "ask" || problem === "noDownload");

  /** The Ravelry control this branch draws, if it has one to draw. */
  const showExternalLink = offline === "external" && externalUrl !== null;
  const showAcquire = offline === "download" || offline === "add";
  /**
   * Unconditional, unlike every other control in this block.
   *
   * The rest are drawn on what can be *done* about the file, and each of them
   * is absent most of the time. Looking the pattern up is not that: it works on
   * every pattern, whatever its download says, and it is the one thing a
   * knitter can always fall back on when the block has nothing else to offer.
   */
  const showRavelryLink = ravelryUrl !== null;
  /**
   * Where to buy it, offered only when buying is the actual next step.
   *
   * Not on a pattern already downloaded, not on one the library says is owned —
   * in both of those the knitter has bought it and a Buy button would be an
   * insult with a price on it. `ask` is precisely the paid-and-unowned case, and
   * it is the line this control belongs under.
   */
  const showPurchase = offline === "ask" && purchaseUrl !== null;
  const showWebsite = websiteUrl !== null;

  const openPdf = useCallback(() => {
    if (id === null) {
      return;
    }
    router.push({
      pathname: "/pdf/[patternId]",
      params: { patternId: id, name },
    });
  }, [id, name]);

  /**
   * The designer's page, in the in-app browser — the same handoff a link in the
   * notes gets, and for the same reason: this is still reading the pattern, and
   * coming back should be one tap. A browser that refuses to open is not worth
   * an alert. The URL was checked for an http(s) scheme in `pdfs.ts`; a payload
   * that carried anything else arrives here as null and draws no control.
   */
  const openExternal = useCallback(() => {
    if (externalUrl === null) {
      return;
    }
    void WebBrowser.openBrowserAsync(externalUrl).catch(() => undefined);
  }, [externalUrl]);

  /**
   * Ravelry's own purchase page, in the in-app browser.
   *
   * The app takes no money and holds no card: this hands over to Ravelry, who
   * sell the designer's pattern, exactly as their own page does. What comes
   * back is a pattern in the knitter's library, which the block above already
   * knows how to notice and download.
   */
  const openPurchase = useCallback(() => {
    if (purchaseUrl === null) {
      return;
    }
    void WebBrowser.openBrowserAsync(purchaseUrl).catch(() => undefined);
  }, [purchaseUrl]);

  /** The designer's own site — "visit pattern website" on Ravelry's page. */
  const openWebsite = useCallback(() => {
    if (websiteUrl === null) {
      return;
    }
    void WebBrowser.openBrowserAsync(websiteUrl).catch(() => undefined);
  }, [websiteUrl]);

  /** The pattern on ravelry.com, in the same in-app browser and for the same reason. */
  const openRavelry = useCallback(() => {
    if (ravelryUrl === null) {
      return;
    }
    void WebBrowser.openBrowserAsync(ravelryUrl).catch(() => undefined);
  }, [ravelryUrl]);

  return (
    <SafeAreaView
      edges={["top"]}
      style={[styles.screen, { backgroundColor: colors.paper }]}
    >
      <BackBar />

      {empty ? (
        <Text style={[styles.stamp, { color: colors.ink2 }]}>
          {!settled
            ? "Loading"
            : state.offline
              ? "Unavailable offline."
              : "Pattern unavailable."}
        </Text>
      ) : (
        <ScrollView
          contentContainerStyle={{ paddingBottom: space.s10 + insets.bottom }}
        >
          <View style={[styles.photo, { borderBottomColor: colors.hairline }]}>
            <PhotoFrame src={photo} label="pattern photo" aspect="4/5" />
            {saved ? (
              <View style={[styles.saved, { backgroundColor: colors.surface }]}>
                <Text style={[styles.savedGlyph, { color: colors.ink }]}>
                  ♥
                </Text>
              </View>
            ) : null}
          </View>

          <View style={styles.block}>
            <Text style={[styles.title, { color: colors.ink }]}>{name}</Text>

            {designer ? (
              <Text style={[styles.designer, { color: colors.ink2 }]}>
                {designer}
              </Text>
            ) : null}

            {/* Only once the request has answered: until then the saved copy
                is simply what is on screen first, not a fallback. */}
            {settled && pattern === null ? (
              <Text style={[styles.notice, { color: colors.aqua }]}>
                offline · showing saved copy
              </Text>
            ) : null}

            {inLibrary || queued || free ? (
              <View style={styles.marks}>
                {inLibrary ? <Badge tone="library">in library</Badge> : null}
                {queued ? <Badge tone="queued">queued</Badge> : null}
                {free ? <Badge tone="neutral">free</Badge> : null}
              </View>
            ) : null}
          </View>

          {facts.length > 0 ? (
            <View
              style={[
                styles.block,
                styles.ruled,
                { borderTopColor: colors.hairline },
              ]}
            >
              <View style={styles.facts}>
                {facts.map((fact) => (
                  <Stamp key={fact.label} label={fact.label}>
                    {fact.value}
                  </Stamp>
                ))}
              </View>
            </View>
          ) : null}

          {/* The actions, under the facts and above the designer's own words —
              after everything there is to know about the pattern, before
              everything there is to read.

              Drawn on `canStart` alone, which is the stricter of the two
              conditions in the row: Save wants only a session and an id. The
              only pattern that satisfies that and not `canStart` is one drawn
              without a live payload, and this screen only draws one of those
              when it has a cached bookmark to draw it from — which is to say,
              when it is already saved. A second gate would buy an inert
              "Saved" under a ♥ that is already up, and nothing else. */}
          {canStart ? (
            <View
              style={[
                styles.block,
                styles.ruled,
                { borderTopColor: colors.hairline },
              ]}
            >
              {/* One band, two widths. Both controls are `lg`, because two
                  rectangles on different baselines would read as a mistake
                  rather than a hierarchy — the weight is carried by the fill
                  and by the two-to-one split instead, which is what makes this
                  an action with a companion rather than a choice of two. */}
              <View style={styles.actionRow}>
                <View style={styles.startSlot}>
                  <Button
                    variant="primary"
                    size="lg"
                    full
                    accessibilityLabel={`Start a project from ${name}`}
                    onPress={start}
                  >
                    Start project
                  </Button>
                </View>

                {/* Inert rather than absent once it is saved: the row keeps its
                    shape, and "Saved" answers the question the button raises.
                    It is not a toggle — un-saving destroys a Ravelry bookmark,
                    and nothing on this screen should do that by being tapped
                    twice. */}
                <View style={styles.saveSlot}>
                  <Button
                    variant="secondary"
                    size="lg"
                    full
                    disabled={saved || saving}
                    accessibilityLabel={
                      saved ? `${name} is saved` : `Save ${name} to your saves`
                    }
                    onPress={save}
                  >
                    {saved ? "Saved" : "Save"}
                  </Button>
                </View>
              </View>

              {/* The busy line only while there is nothing better to say: the
                  moment the write lands the button reads "Saved", and leaving
                  "Saving…" under it through the refresh would be the block
                  arguing with itself about something already done. */}
              {saving && !saved ? (
                <Text style={[styles.notice, { color: colors.ink2 }]}>
                  Saving…
                </Text>
              ) : saveProblem !== null ? (
                <Text
                  style={[
                    styles.notice,
                    {
                      color:
                        saveProblem === "offline"
                          ? colors.aqua
                          : colors.mustard,
                    },
                  ]}
                >
                  {SAVE_NOTICES[saveProblem]}
                </Text>
              ) : null}
            </View>
          ) : null}

          {/* Quiet by construction: the row above is what there is to do with
              a pattern, and taking a copy of it is housekeeping.

              It used to appear only when it had something to say about a file,
              which meant a pattern with no download to offer had no block —
              and so no way through to the pattern itself. The Ravelry link is
              worth drawing on its own, so the block now also appears for that
              alone, and on those patterns it is a label and one link. */}
          {offline !== null || showRavelryLink ? (
            <View
              style={[
                styles.block,
                styles.ruled,
                { borderTopColor: colors.hairline },
              ]}
            >
              <Text style={[styles.sectionLabel, { color: colors.ink2 }]}>
                Pattern
              </Text>

              {offline === "downloaded" ? (
                // Where it came from, when it did not come from Ravelry. Worth
                // one word: it is the difference between a file this app can
                // fetch again and one only the knitter can replace.
                <Text style={[styles.notice, { color: colors.spruce }]}>
                  {pdf?.source === "imported"
                    ? "Imported · available offline"
                    : "Available offline"}
                </Text>
              ) : offline === "external" ? (
                <Text style={[styles.notice, { color: colors.ink2 }]}>
                  {EXTERNAL_NOTICE}
                </Text>
              ) : offline === "ask" ? (
                /* The price, when Ravelry gave one. The line used to ask
                   whether the pattern was in the knitter's library and say
                   nothing about what it would cost to put it there — which is
                   the one fact that decides what they do next. */
                <Text style={[styles.notice, { color: colors.ink2 }]}>
                  {price === null
                    ? "In your Ravelry library? Download appears here."
                    : `${price} on Ravelry · the download appears here once it's yours.`}
                </Text>
              ) : null}

              {/* One line at a time, most recent thing first. An import that
                  just failed outranks whatever Ravelry said before it: that
                  line is why they reached for the picker, and it comes back by
                  itself the moment the import is cancelled or succeeds. */}
              {busy !== null ? (
                <Text style={[styles.notice, { color: colors.ink2 }]}>
                  {busy === "add" ? "Adding to library…" : "Downloading…"}
                </Text>
              ) : importing ? (
                <Text style={[styles.notice, { color: colors.ink2 }]}>
                  Importing…
                </Text>
              ) : importProblem !== null ? (
                <Text style={[styles.notice, { color: colors.mustard }]}>
                  {IMPORT_NOTICES[importProblem]}
                </Text>
              ) : notice !== null ? (
                <Text
                  style={[
                    styles.notice,
                    {
                      color:
                        notice === "offline" ? colors.aqua : colors.mustard,
                    },
                  ]}
                >
                  {PDF_NOTICES[notice]}
                </Text>
              ) : null}

              {offline === "downloaded" ? (
                <View style={styles.actions}>
                  <Button
                    variant="quiet"
                    size="sm"
                    accessibilityLabel={`Open the pattern PDF for ${name}`}
                    onPress={openPdf}
                  >
                    Open
                  </Button>
                  {/* Here too, and last: a copy on the phone is the reason to
                      be on this screen, but looking the pattern up is still
                      worth a tap — the notes, the comments and the errata are
                      not in the PDF. */}
                  {showRavelryLink ? (
                    <Button
                      variant="quiet"
                      size="sm"
                      accessibilityLabel={`View ${name} on Ravelry`}
                      onPress={openRavelry}
                    >
                      View on Ravelry
                    </Button>
                  ) : null}
                  {/* Ghost rather than quiet: throwing the copy away is the
                      least likely thing anybody came here to do. */}
                  <Button
                    variant="ghost"
                    size="sm"
                    accessibilityLabel={`Remove the downloaded PDF for ${name}`}
                    onPress={removeDownload}
                  >
                    Remove download
                  </Button>
                </View>
              ) : showPurchase ||
                showExternalLink ||
                showAcquire ||
                showWebsite ||
                showRavelryLink ||
                canImport ? (
                /* At most two quiet words, in the order they are done in:
                   whatever Ravelry can still do for this pattern, and then the
                   way in by hand. Nothing at all is a real answer, and it is
                   one case — an external pattern that carried no usable URL,
                   with a download somehow already in flight. The line above
                   stands on its own there, which beats a control going
                   nowhere. */
                <View style={styles.actions}>
                  {/* First, because on a paid pattern it is the whole answer:
                      everything else in this row is a way of reading about
                      something the knitter cannot open yet. The price is on the
                      label rather than only in the line above — a control that
                      leads to a payment should say so before it is tapped. */}
                  {showPurchase ? (
                    <Button
                      variant="quiet"
                      size="sm"
                      accessibilityLabel={
                        price === null
                          ? `Buy ${name} on Ravelry`
                          : `Buy ${name} on Ravelry for ${price}`
                      }
                      onPress={openPurchase}
                    >
                      {price === null ? "Buy on Ravelry" : `Buy on Ravelry · ${price}`}
                    </Button>
                  ) : null}

                  {showExternalLink ? (
                    <Button
                      variant="quiet"
                      size="sm"
                      accessibilityLabel={`Open the pattern page for ${name} in a browser`}
                      onPress={openExternal}
                    >
                      Open pattern page
                    </Button>
                  ) : null}

                  {showAcquire ? (
                    <Button
                      variant="quiet"
                      size="sm"
                      disabled={busy !== null}
                      accessibilityLabel={
                        offline === "add"
                          ? `Add ${name} to your library and download it`
                          : `Download ${name} for offline`
                      }
                      onPress={() =>
                        acquire(offline === "add" ? "add" : "download")
                      }
                    >
                      {offline === "add"
                        ? "Add to library & download"
                        : "Download for offline"}
                    </Button>
                  ) : null}

                  {/* The designer's own site, which Ravelry's page calls
                      "visit pattern website". Dropped when it is the same link
                      the external branch above already drew — that one has the
                      better copy for the case, and twice is worse than once. */}
                  {showWebsite ? (
                    <Button
                      variant="quiet"
                      size="sm"
                      accessibilityLabel={`Visit the pattern website for ${name}`}
                      onPress={openWebsite}
                    >
                      Pattern website
                    </Button>
                  ) : null}

                  {/* After whatever Ravelry can still do about the file, and
                      before the way in by hand: the two fallbacks in the order
                      a knitter would try them. */}
                  {showRavelryLink ? (
                    <Button
                      variant="quiet"
                      size="sm"
                      accessibilityLabel={`View ${name} on Ravelry`}
                      onPress={openRavelry}
                    >
                      View on Ravelry
                    </Button>
                  ) : null}

                  {canImport ? (
                    <Button
                      variant="quiet"
                      size="sm"
                      disabled={importing}
                      accessibilityLabel={`Import a PDF you already have for ${name}`}
                      onPress={importPdf}
                    >
                      Import a PDF
                    </Button>
                  ) : null}
                </View>
              ) : null}
            </View>
          ) : null}

          {hasNotes(notesHtml, notesMarkdown) ? (
            <View
              style={[
                styles.block,
                styles.ruled,
                { borderTopColor: colors.hairline },
              ]}
            >
              <Text style={[styles.sectionLabel, { color: colors.ink2 }]}>
                Notes
              </Text>
              <RichText html={notesHtml} markdown={notesMarkdown} />
            </View>
          ) : null}
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  photo: { borderBottomWidth: 1 },
  saved: {
    position: "absolute",
    top: 8,
    right: 8,
    width: 26,
    height: 26,
    alignItems: "center",
    justifyContent: "center",
  },
  savedGlyph: {
    fontFamily: fonts.ui,
    fontSize: 13,
    lineHeight: 16,
  },
  block: {
    paddingHorizontal: space.s4,
    paddingVertical: space.s5,
    gap: space.s2,
  },
  ruled: { borderTopWidth: 1 },
  title: {
    // 28, the screen-title size. Leading is opened past `type.title`'s 30 for
    // the same reason Discover's two-line title is: Yuji Mai's strokes clip at
    // that tightness, and a pattern name is free to wrap.
    fontFamily: fonts.display,
    fontSize: 28,
    lineHeight: 32,
  },
  designer: {
    fontFamily: fonts.ui,
    fontSize: type.body.fontSize,
    lineHeight: type.body.lineHeight,
  },
  notice: {
    fontFamily: fonts.ui,
    fontSize: type.small.fontSize,
    lineHeight: type.small.lineHeight,
    letterSpacing: trackSmall,
  },
  marks: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 6,
    marginTop: 2,
  },
  facts: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: space.s4,
  },
  /**
   * Two controls, one band. Both are `lg` — 56pt, comfortably over the 48pt
   * minimum — and both slots take their height from the row, so nothing here
   * can put the two of them on different baselines.
   *
   * The row must never wrap or truncate, and `lg`'s 24pt of padding a side is
   * tuned for a button that owns the screen's width rather than a third of it,
   * so the narrow slot is the one worth checking. At the narrowest width this
   * app runs at — 360dp on Android, 375pt on the smallest supported iPhone —
   * the block's 16pt margins and the 8pt gap leave the save slot 106pt, which
   * is about 58pt of label after the padding. "Saved" is five characters of
   * 17pt Solway Medium, near 47. It fits, and it is the tightest thing here;
   * anything longer in that slot wants the split widened before the label is.
   */
  actionRow: {
    flexDirection: "row",
    alignItems: "stretch",
    gap: space.s2,
  },
  // Two thirds against one. The split is the hierarchy: `full` inside each
  // slot fills the share flex gave it, so the primary stays the wide one at
  // every width without a single hardcoded number.
  startSlot: { flex: 2 },
  saveSlot: { flex: 1 },
  actions: {
    flexDirection: "row",
    flexWrap: "wrap",
    alignItems: "center",
    gap: space.s1,
    // The `sm` button's own 12pt of padding, pulled back, so its label starts
    // on the same line as the block's text rather than 12pt inside it.
    marginLeft: -12,
    marginTop: 2,
  },
  sectionLabel: {
    fontFamily: fonts.ui,
    fontSize: type.small.fontSize,
    lineHeight: type.small.lineHeight,
    letterSpacing: trackSmall,
  },
  stamp: {
    fontFamily: fonts.ui,
    fontSize: type.small.fontSize,
    lineHeight: type.small.lineHeight,
    letterSpacing: trackSmall,
    textAlign: "center",
    paddingTop: space.s10,
    paddingHorizontal: space.s4,
  },
});
