/**
 * Edit a project — the second thing in this app that rewrites something
 * Ravelry already has, and the first that can take one away.
 *
 * `edit-yarn`'s shell and `edit-yarn`'s footer, for the same reason that sheet
 * borrowed `add-yarn`'s: it is the same decision said again over a thing that
 * already exists. The name is the display line, exactly as it is on the sheet
 * that cast the project on — there is no quiet title above the fields here,
 * because the first box *is* the project's name and printing it twice would be
 * printing it twice.
 *
 * It saves the way the yarn sheet saves, and for a reason that rhymes with the
 * stash's: **`projects/list.json` carries no `notes`.** The mirror this sheet
 * opens over is built from that endpoint, so the notes a knitter wrote on the
 * train are only ever on `/projects/{username}/{id}.json`, one project at a
 * time. A sheet that posted every field back would wipe them. So nothing is
 * posted that was not touched: the sheet keeps what it opened with, compares on
 * save, and sends the difference — Ravelry merges a partial project the way it
 * merges a partial pack.
 *
 * Both notes boxes are the honest half of that. They are filled by a second
 * request for the project, and until it lands — or if it never does — they are
 * disabled and say so, because an empty box the knitter could type into is a
 * promise to save what they typed over notes nobody has read yet.
 *
 * The yarn and the needles come off that same request, and they are here for
 * the same reason the notes are: the casting-on sheet asks for both, and a form
 * that could not change them afterwards would be a form that made a knitter
 * cast on twice to fix one skein. They are Cast on's own rows, unfolded inline
 * — choosing a yarn here is the choice made there, said a second time, and the
 * two adding sheets hand back to this screen exactly as they hand back to that
 * one.
 *
 * Neither is seeded from the mirror, and neither is seeded until that request
 * lands, because both are *replacements* rather than edits:
 *
 * - **Ravelry replaces a project's whole needle list with whatever array it is
 *   sent.** A sheet that opened on an empty selection and saved would take
 *   every needle off the project, so nothing is offered to choose from until
 *   the sheet knows which ones are already there.
 * - **A project's yarn is not a project field.** It is a *pack* — a record of
 *   its own, which the project endpoint accepts at the cast on and refuses ever
 *   after. Moving it is the pack API; see `createPack` in `@/data/ravelry`.
 *
 * One pack, and only the first one drawing on the stash. A project can carry
 * several, and a pack can be hand-typed, half-used, bought somewhere, weighed —
 * none of which this app has ever had a screen for. So the sheet edits the one
 * pack it can name, says plainly when there are others, and leaves those alone.
 *
 * At the far end of the form is the one tap in this app that cannot be taken
 * back, and it asks twice. The row counter's delete does not, and the
 * difference is the whole argument: that one is a local row about where a
 * sleeve got to, and the knitter can make another. This one is a `DELETE`
 * against Ravelry that destroys the photographs, the notes, the yarn and the
 * date — years of somebody's record, gone off every device they own — and no
 * amount of tapping Back brings it home. So the first tap only arms it, says
 * plainly what it is about to do, and waits; any keystroke anywhere on the form
 * puts it back to sleep.
 *
 * Deleting leaves for Home rather than dismissing onto the project screen,
 * which by then is a husk keyed to an id nothing will answer for.
 */

import { router, useFocusEffect, useLocalSearchParams } from "expo-router";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { useAuth } from "@/auth/context";
import { BackBar } from "@/components/back-bar";
import { Button } from "@/components/ui/app-button";
import { TextField } from "@/components/ui/text-field";
import {
  createPack,
  deletePack,
  deleteProject,
  deleteRowCounter,
  ensureProjectDetail,
  forgetProjectDetail,
  getNeedleSizes,
  getProjectById,
  getProjectDetail,
  getRowCounters,
  projectShow,
  refreshProjects,
  updatePack,
  updateProject,
  useNeedles,
  useStash,
  type ProjectUpdate,
  type RavelryNeedleSize,
} from "@/data";
import {
  at,
  firstNumber,
  firstString,
  parseRaw,
  readId,
} from "@/features/detail/raw";
import {
  needleSizeIds,
  sizeKey,
  sizeOptions,
} from "@/features/start-project/needle-sizes";
import {
  consumePendingNeedleSelection,
  consumePendingStashSelection,
  pendingStashSelection,
} from "@/features/start-project/pending-selection";
import { triage, type Problem } from "@/features/start-project/problem";
import {
  AddRow,
  NeedleChoice,
  SizeGrid,
  YarnChoice,
} from "@/features/start-project/rows";
import { haptics } from "@/haptics";
import { fonts, space, trackSmall, type, useTheme } from "@/theme";

const NOTICES: Record<Problem, string> = {
  failed: "Couldn't save the changes.",
  // Aqua, not mustard: nothing went wrong, the request simply never left.
  offline: "You're offline · try again later.",
  signedOut: "Sign in on the Stash tab to edit projects.",
};

/** The same three sentences for the write that takes the project away. */
const DELETE_NOTICES: Record<Problem, string> = {
  failed: "Couldn't delete the project.",
  offline: "You're offline · try again later.",
  signedOut: "Sign in on the Stash tab to delete projects.",
};

/** What the sheet opened with, and what it compares against on the way out. */
type Draft = {
  name: string;
  madeFor: string;
  size: string;
};

/**
 * The one pack this sheet is allowed to move — see the head of this file.
 *
 * `id` is null in exactly one place: straight after `createPack`, when Ravelry
 * answered 200 but the response was not one this app could read an id out of.
 * The pack is on the project either way; this sheet simply cannot key another
 * call to it until it is reopened and reads the project again.
 */
type SeededPack = {
  readonly id: number | null;
  readonly stashId: number;
};

/**
 * The project as Ravelry had it a moment ago. Null until that request lands.
 *
 * Everything on it is something the mirror does not carry, or does not carry
 * reliably enough to overwrite from: the notes are not on `projects/list.json`
 * at all, and the needles and packs are only on the detail payload, which a
 * project nobody has opened yet does not have. See the head of this file.
 */
type Written = {
  notes: string;
  private: string;
  /** The needles on it, keyed by millimetres — see `needle-sizes`. */
  sizeKeys: readonly string[];
  pack: SeededPack | null;
  /** How many packs this sheet is deliberately not touching. */
  otherPacks: number;
};

/** Nothing chosen, as one frozen array rather than a new one every render. */
const NO_SIZES: readonly string[] = [];

/** Trimmed, with the empty string standing for "nothing here". */
function clean(value: string | null | undefined): string {
  return typeof value === "string" ? value.trim() : "";
}

/**
 * The needles a project has now, keyed the way Cast on keys them.
 *
 * A size record Ravelry sent no `metric` for is dropped, because millimetres
 * are the only name the drawer, the size table and this list share — and a
 * needle that cannot be keyed cannot be written back either. On a project
 * carrying one, saving any needle change at all will lose it: the write
 * replaces the whole list. Nothing here can prevent that; the alternative is
 * never letting a knitter fix their needles, which is worse.
 */
function needleKeys(project: unknown): string[] {
  const sizes = at(project, ["needle_sizes"]);

  if (!Array.isArray(sizes)) {
    return [];
  }

  const keys: string[] = [];

  for (const size of sizes) {
    const mm = firstNumber(size, [["metric"]]);

    if (mm !== null) {
      const key = sizeKey(mm);
      // A hook and a needle of the same size are one chip in the grid, so they
      // are one key here too.
      if (!keys.includes(key)) {
        keys.push(key);
      }
    }
  }

  return keys;
}

/**
 * The first pack drawing on the stash, and how many others there are.
 *
 * "Drawing on the stash" is the whole test: this sheet chooses yarn out of the
 * knitter's stash, so a pack it can edit is one that names a `stash_id`. A pack
 * built round a database yarn, or typed in by hand on ravelry.com, is somebody
 * else's record and is counted rather than touched.
 */
function packs(project: unknown): { pack: SeededPack | null; others: number } {
  const listed = at(project, ["packs"]);

  if (!Array.isArray(listed)) {
    return { pack: null, others: 0 };
  }

  let pack: SeededPack | null = null;

  for (const entry of listed) {
    const id = firstNumber(entry, [["id"]]);
    const stashId = firstNumber(entry, [["stash_id"]]);

    if (pack === null && id !== null && stashId !== null) {
      pack = { id, stashId };
    }
  }

  return { pack, others: listed.length - (pack === null ? 0 : 1) };
}

/** The same needles in a different order are the same needles. */
function sameSizes(a: readonly string[], b: readonly string[]): boolean {
  return a.length === b.length && a.every((key) => b.includes(key));
}

export default function EditProjectScreen() {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const { user } = useAuth();
  const { id: param } = useLocalSearchParams<"/edit-project">();
  // The two drawers Cast on picks out of, read from the mirror the same way it
  // reads them, so both lists are right on the first frame with no network.
  const { data: stash } = useStash();
  const { data: needles } = useNeedles();

  const username = user?.username ?? null;
  const id = readId(param);

  // One read, not a live one: this sheet is a form, and a sync rewriting the
  // row underneath a half-typed name would take the knitter's work away.
  const row = useMemo(() => (id === null ? null : getProjectById(id)), [id]);
  const detail = useMemo(() => getProjectDetail(id), [id]);

  // The same project twice, one of them fuller — the detail leads, exactly as
  // it does on the screen this sheet opened over, so a field changed on
  // ravelry.com an hour ago is not seeded from last week's sync and posted
  // straight back over itself.
  const raw = useMemo(
    () => parseRaw(detail?.raw) ?? parseRaw(row?.raw),
    [detail, row],
  );

  const opened = useMemo<Draft>(
    () => ({
      name: clean(firstString(raw, [["name"]]) ?? row?.name ?? ""),
      madeFor: clean(firstString(raw, [["made_for"]])),
      size: clean(firstString(raw, [["size"]])),
    }),
    [raw, row],
  );

  // Seeded once and then owned by the knitter. `opened` cannot change under it
  // — it is memoized on an `id` this sheet is mounted for — so there is no
  // effect syncing the two, and nothing that could take a half-typed name away
  // mid-edit.
  const [draft, setDraft] = useState<Draft>(opened);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [armed, setArmed] = useState(false);
  const [problem, setProblem] = useState<Problem | null>(null);
  const [failedToDelete, setFailedToDelete] = useState(false);

  // Notes live nowhere but on the project's own endpoint — see the head of this
  // file. Until this lands both boxes stay shut rather than inviting a knitter
  // to type over something the sheet has not read. The yarn and the needles are
  // on the same request and wait on it for the same reason.
  const [notes, setNotes] = useState("");
  const [privateNotes, setPrivateNotes] = useState("");
  const [written, setWritten] = useState<Written | null>(null);
  // Told apart from "not yet", because waiting is not a state and unreachable
  // is: the sections say so in different words and different colours. Being
  // signed out counts as unreachable and is known without asking — there is
  // nothing to wait for when the request is never going to leave.
  const [readFailed, setReadFailed] = useState(false);
  const unread = readFailed || username === null || id === null;

  /**
   * What the knitter has chosen, or nothing at all yet.
   *
   * Deliberately not seeded from an effect. These are the only two things on
   * the sheet whose opening value arrives over the network, so there is a
   * window — small, but real — in which a knitter could choose before it lands,
   * and a seed dropped in afterwards would take that choice away. Instead
   * "untouched" is its own value, and what is on screen is the choice where
   * there is one and Ravelry's answer where there is not.
   */
  const [pickedYarn, setPickedYarn] = useState<number | null | undefined>(
    undefined,
  );
  const [pickedSizes, setPickedSizes] = useState<readonly string[] | null>(null);

  const yarnId = pickedYarn === undefined ? (written?.pack?.stashId ?? null) : pickedYarn;
  const sizeKeys = pickedSizes ?? written?.sizeKeys ?? NO_SIZES;

  // All sizes. The table is only asked for when the row is first opened, and
  // then it is the same table the save translates millimetres with.
  const [sizesOpen, setSizesOpen] = useState(false);
  const [sizeTable, setSizeTable] = useState<readonly RavelryNeedleSize[] | null>(
    null,
  );
  const [loadingSizes, setLoadingSizes] = useState(false);
  const [sizesUnavailable, setSizesUnavailable] = useState(false);

  const sizes = useMemo(
    () => (sizeTable === null ? [] : sizeOptions(sizeTable)),
    [sizeTable],
  );

  useEffect(() => {
    if (username === null || id === null) {
      return;
    }

    let live = true;

    void (async () => {
      try {
        const project = await projectShow(username, id);
        const held = packs(project);
        // The markdown the knitter typed, never `notes_html` — that is
        // Ravelry's rendering of it, and posting a rendering back would turn
        // every note in the account into its own tag soup.
        const found: Written = {
          notes: clean(firstString(project, [["notes"]])),
          private: clean(firstString(project, [["private_notes"]])),
          sizeKeys: needleKeys(project),
          pack: held.pack,
          otherPacks: held.others,
        };

        if (live) {
          setNotes(found.notes);
          setPrivateNotes(found.private);
          setWritten(found);
        }
      } catch {
        // One quiet line where the boxes are, and another where the rows are.
        // Everything else on this sheet still saves — the notes, the yarn and
        // the needles are simply not this knitter's to lose today.
        if (live) {
          setReadFailed(true);
        }
      }
    })();

    return () => {
      live = false;
    };
  }, [id, username]);

  const busy = saving || deleting;

  /**
   * Anything the knitter types, anywhere on the form.
   *
   * It clears the notice, which explained the last tap and not this one, and
   * it disarms the delete — somebody who has gone back to editing has stopped
   * asking to throw the project away.
   */
  const touch = useCallback(() => {
    setProblem(null);
    setFailedToDelete(false);
    setArmed(false);
  }, []);

  /**
   * Picking up the skein the Add a yarn sheet just wrote — Cast on's protocol,
   * replicated, because the slots are one process-wide pair shared with it.
   *
   * It runs when this screen is focused again, and again on every change to the
   * stash while it stays focused. `refreshStash` is awaited before the sheet
   * dismisses, so the row is usually already here; when it is not, `useStash`
   * is a live query and this fires again the moment it lands. Until then the id
   * stays in the slot rather than selecting a row that does not exist yet.
   *
   * It touches the form, which Cast on has no need to: a knitter who armed the
   * delete, went off to add a skein and came back is a knitter who has stopped
   * asking to throw the project away, and coming back to a live second tap
   * would be the worst surprise on this screen.
   */
  useFocusEffect(
    useCallback(() => {
      const pending = pendingStashSelection();

      if (pending === null || !stash.some((entry) => entry.id === pending)) {
        return;
      }

      consumePendingStashSelection();
      setPickedYarn(pending);
      touch();
    }, [stash, touch]),
  );

  /**
   * Picking up the needle the Add a needle sheet just wrote.
   *
   * Simpler than the skein above, because a needle is chosen by millimetres and
   * not by row: the size is a usable answer the moment the sheet hands it over.
   * The one thing this must not do is claim it before the project's own needles
   * have been read — a selection of exactly one size, saved, would replace the
   * lot. It cannot happen, because the row that opens that sheet is not drawn
   * until then; the guard is here so it stays that way.
   */
  useFocusEffect(
    useCallback(() => {
      if (written === null) {
        return;
      }

      const pending = consumePendingNeedleSelection();

      if (pending === null) {
        return;
      }

      setPickedSizes((current) => {
        const held = current ?? written.sizeKeys;
        return held.includes(pending) ? held : [...held, pending];
      });
      touch();
    }, [touch, written]),
  );

  // Anything left in either slot goes in the bin with this screen rather than
  // turning up preselected on the next project — the stash id because the row
  // it names may never have arrived, the size because the knitter has moved on.
  useEffect(
    () => () => {
      consumePendingStashSelection();
      consumePendingNeedleSelection();
    },
    [],
  );

  const set = useCallback(
    <K extends keyof Draft>(key: K, value: Draft[K]) => {
      setDraft((current) => ({ ...current, [key]: value }));
      touch();
    },
    [touch],
  );

  const toggleYarn = useCallback(
    (chosen: number) => {
      // Tapping the chosen skein again unchooses it, exactly as it does on Cast
      // on — and here that is the only way to say "take the yarn off this
      // project", which is why it has to keep working after the seed.
      setPickedYarn((current) => {
        const held = current === undefined ? (written?.pack?.stashId ?? null) : current;
        return held === chosen ? null : chosen;
      });
      touch();
    },
    [touch, written],
  );

  const toggleSize = useCallback(
    (key: string) => {
      setPickedSizes((current) => {
        const held = current ?? written?.sizeKeys ?? NO_SIZES;
        return held.includes(key)
          ? held.filter((other) => other !== key)
          : [...held, key];
      });
      touch();
    },
    [touch, written],
  );

  // `handBack` is what tells either sheet to leave what it wrote in the slot
  // this screen reads on focus — the same two pushes Cast on makes, because it
  // is the same handoff. See `pending-selection`.
  const addYarn = useCallback(
    () => router.push({ pathname: "/add-yarn", params: { handBack: "1" } }),
    [],
  );

  const addNeedle = useCallback(
    () => router.push({ pathname: "/add-needle", params: { handBack: "1" } }),
    [],
  );

  const toggleSizes = useCallback(() => {
    const opening = !sizesOpen;
    setSizesOpen(opening);

    if (!opening || sizeTable !== null || loadingSizes) {
      return;
    }

    setLoadingSizes(true);
    setSizesUnavailable(false);

    void (async () => {
      try {
        setSizeTable(await getNeedleSizes());
      } catch {
        // One quiet line inside the row that asked for it; the rest of the
        // sheet is still a working way to edit a project.
        setSizesUnavailable(true);
      } finally {
        setLoadingSizes(false);
      }
    })();
  }, [loadingSizes, sizeTable, sizesOpen]);

  /**
   * The difference between what the sheet opened with and what is in it now.
   *
   * Built rather than compared field by field on save, so that the thing which
   * decides whether Save is offered at all is the payload itself: an empty
   * object is nothing to post, and a button that posts nothing should not be
   * lit.
   *
   * The needles and the yarn are the two exceptions, and both for a reason and
   * not for convenience. Needles are a project field like the rest, but they go
   * to Ravelry as size *ids*, and turning millimetres into ids needs a table
   * this sheet may not have fetched yet — an await has no business in a memo,
   * so the payload gains its `needle_sizes` in the save. The yarn is not a
   * project field at all; it is a pack, and packs are their own three calls.
   */
  const changes = useMemo<ProjectUpdate>(() => {
    const next: ProjectUpdate = {};
    const name = draft.name.trim();

    // A project with no name is not a thing to write, so an emptied box is
    // read as "leave the name alone" rather than as a name of nothing.
    if (name !== opened.name && name !== "") {
      next.name = name;
    }

    const madeFor = draft.madeFor.trim();
    if (madeFor !== opened.madeFor) {
      // Empty here *is* the instruction, unlike the name: a jumper knitted for
      // somebody the knitter no longer wants recorded is cleared by clearing
      // the box, and there is no other way to say it.
      next.made_for = madeFor;
    }

    const size = draft.size.trim();
    if (size !== opened.size) {
      next.size = size;
    }

    if (written !== null) {
      const shared = notes.trim();
      if (shared !== written.notes) {
        next.notes = shared;
      }

      const own = privateNotes.trim();
      if (own !== written.private) {
        next.private_notes = own;
      }
    }

    return next;
  }, [draft, notes, opened, privateNotes, written]);

  // Both are false until the project's own record has been read, which is what
  // keeps an unseeded selection from ever being mistaken for an emptied one.
  const needlesChanged =
    written !== null && !sameSizes(sizeKeys, written.sizeKeys);
  const yarnChanged =
    written !== null && yarnId !== (written.pack?.stashId ?? null);

  const changed =
    Object.keys(changes).length > 0 || needlesChanged || yarnChanged;

  const save = useCallback(() => {
    if (busy || !changed || id === null) {
      return;
    }

    setArmed(false);

    if (username === null) {
      setProblem("signedOut");
      setFailedToDelete(false);
      haptics.error();
      return;
    }

    setProblem(null);
    setFailedToDelete(false);
    setSaving(true);

    void (async () => {
      try {
        const payload: ProjectUpdate = { ...changes };

        if (needlesChanged) {
          // The table this sheet already has, if the knitter opened All sizes;
          // otherwise the one fetch that turns millimetres into the ids the
          // write wants. `getNeedleSizes` is memoized for the session, so this
          // is usually a resolved promise.
          const table = sizeTable ?? (await getNeedleSizes());
          // Everything, not the difference: Ravelry replaces a project's whole
          // needle list with this array, so a partial one is a deletion.
          payload.needle_sizes = needleSizeIds(sizeKeys, table);
        }

        if (Object.keys(payload).length > 0) {
          await updateProject(username, id, payload);
        }

        // The pack afterwards, and last of the three writes. Everything above
        // it is a rewrite that costs nothing to send twice, so a failure here
        // leaves a sheet the knitter can simply save again.
        if (yarnChanged) {
          // The one pack this sheet seeded from, and never the others — see the
          // head of this file. A null id is a pack made a moment ago whose id
          // did not come back readable, which is a pack nothing can be keyed to
          // until the sheet is reopened.
          const seeded = written?.pack ?? null;
          const packId = seeded === null ? null : seeded.id;

          if (yarnId === null) {
            // Unchosen. The skein itself stays in the stash; this only unhooks
            // it from the project it was going into.
            if (packId !== null) {
              await deletePack(packId);
            }
          } else if (packId !== null) {
            // In place rather than delete-and-recreate, so the dye lot, the
            // shop and the yardage a knitter typed on ravelry.com survive a
            // change of skein made on a phone that never saw them.
            await updatePack(packId, { stash_id: yarnId });
          } else {
            const made = await createPack({ project_id: id, stash_id: yarnId });
            const madeId = made?.id;

            // Remembered the moment Ravelry agrees. Every other write on this
            // sheet is safe to repeat and this one is not, so if anything below
            // fails, the retry has to find the yarn already where it is.
            setWritten((current) =>
              current === null
                ? current
                : {
                    ...current,
                    pack: {
                      id: typeof madeId === "number" ? madeId : null,
                      stashId: yarnId,
                    },
                  },
            );
          }
        }

        // Both mirrors feed the screen underneath, and it reads the detail
        // first — so the list refresh alone would leave the project screen
        // showing the old notes until something else happened to refetch them.
        // After the pack, too: the detail is where the yarn is, and refetching
        // it before the pack moved would put the old skein straight back.
        await refreshProjects(username);
        await ensureProjectDetail(username, id);

        haptics.success();
        router.back();
      } catch (error) {
        setProblem(triage(error));
        haptics.error();
      } finally {
        setSaving(false);
      }
    })();
  }, [
    busy,
    changed,
    changes,
    id,
    needlesChanged,
    sizeKeys,
    sizeTable,
    username,
    written,
    yarnChanged,
    yarnId,
  ]);

  /**
   * The delete, in two taps.
   *
   * The first only arms it and puts the sentence on screen. The second is the
   * one that cannot be taken back — see the head of this file for why this is
   * the single control in the app that asks a second time.
   */
  const remove = useCallback(() => {
    if (busy || id === null) {
      return;
    }

    if (!armed) {
      setArmed(true);
      setProblem(null);
      setFailedToDelete(false);
      haptics.tap();
      return;
    }

    if (username === null) {
      // Nothing is attempted: a write with no account behind it fails at the
      // client, and saying so here costs no round trip.
      setProblem("signedOut");
      setFailedToDelete(true);
      setArmed(false);
      haptics.error();
      return;
    }

    setProblem(null);
    setFailedToDelete(false);
    setDeleting(true);

    void (async () => {
      try {
        await deleteProject(username, id);

        // Only once Ravelry has agreed. Everything below is this device
        // catching up with a project that no longer exists anywhere: the
        // counters and the detail row are the app's own and no list will ever
        // come along and notice they are orphaned.
        for (const counter of getRowCounters(id)) {
          deleteRowCounter(counter.id);
        }

        forgetProjectDetail(id);
        await refreshProjects(username);

        haptics.warning();
        // Not `back`. The screen under this sheet is the project that has just
        // stopped existing, and dismissing onto it would land the knitter on a
        // record of nothing. `dismissTo` unwinds the stack until it finds Home
        // and lands there instead — the tabs are the stack's first screen, so
        // it is always there to find.
        router.dismissTo("/");
      } catch (error) {
        setProblem(triage(error));
        setFailedToDelete(true);
        setArmed(false);
        haptics.error();
      } finally {
        setDeleting(false);
      }
    })();
  }, [armed, busy, id, username]);

  return (
    // No `SafeAreaView` top edge, for the same reason as the sheet next door:
    // on iOS this route is presented as a sheet and is already inset.
    <View
      style={[
        styles.screen,
        {
          backgroundColor: colors.paper,
          paddingTop: Platform.OS === "android" ? insets.top : 0,
        },
      ]}
    >
      <BackBar title="Edit project" />

      {row === null ? (
        <Text style={[styles.stamp, { color: colors.ink2 }]}>
          Project unavailable.
        </Text>
      ) : (
        <KeyboardAvoidingView
          style={styles.screen}
          behavior={Platform.OS === "ios" ? "padding" : undefined}
        >
          <ScrollView
            keyboardShouldPersistTaps="handled"
            keyboardDismissMode="on-drag"
            contentContainerStyle={styles.content}
          >
            {/* The display line, worn by the field, exactly as the casting-on
                sheet wears it. Nothing above it introduces the project,
                because this box already says which one it is. */}
            <View style={styles.field}>
              <Text style={[styles.fieldLabel, { color: colors.ink2 }]}>Name</Text>
              <TextField
                value={draft.name}
                onChangeText={(value) => set("name", value)}
                accessibilityLabel="Project name"
                editable={!busy}
                returnKeyType="done"
                size="display"
              />
            </View>

            <View style={styles.field}>
              <Text style={[styles.fieldLabel, { color: colors.ink2 }]}>
                Made for
              </Text>
              <TextField
                value={draft.madeFor}
                onChangeText={(value) => set("madeFor", value)}
                accessibilityLabel="Made for"
                editable={!busy}
                returnKeyType="done"
              />
            </View>

            <View style={styles.field}>
              <Text style={[styles.fieldLabel, { color: colors.ink2 }]}>Size</Text>
              <TextField
                value={draft.size}
                onChangeText={(value) => set("size", value)}
                accessibilityLabel="Size"
                editable={!busy}
                returnKeyType="done"
              />
            </View>

            {/* Cast on's two sections, in a form rather than a list: the same
                rows, the same rhythm of a label over a run of them, and the
                same two ways out to the sheets that widen them. Rendered inline
                rather than as a list of their own, because this screen is one
                scroll of things a knitter is changing about one project and a
                list inside it would scroll separately from the rest. The price
                is that every row is drawn at once where Cast on's list draws
                the ones on screen — worth paying for a stash and a drawer,
                which are small, and worth remembering if either stops being. */}
            <View style={styles.rows}>
              <View style={styles.field}>
                <Text style={[styles.fieldLabel, { color: colors.ink2 }]}>
                  Yarn
                </Text>
                {/* Said once, quietly, and only when it is true: a project
                    with yarn this sheet cannot name is a project whose other
                    skeins are going to survive whatever happens here, and a
                    knitter should hear that from the screen rather than work
                    it out from what comes back. */}
                {written !== null && written.otherPacks > 0 ? (
                  <Text style={[styles.note, { color: colors.ink2 }]}>
                    {written.otherPacks === 1
                      ? "1 other yarn on this project · left as it is"
                      : `${written.otherPacks} other yarns on this project · left as they are`}
                  </Text>
                ) : null}
              </View>

              {written === null ? (
                <View style={styles.field}>
                  <Text
                    style={[
                      styles.note,
                      { color: unread ? colors.aqua : colors.ink2 },
                    ]}
                  >
                    {unread
                      ? "Yarn couldn’t be loaded · it’ll be left as it is"
                      : "Loading"}
                  </Text>
                </View>
              ) : (
                <>
                  {stash.length === 0 ? (
                    <Text style={[styles.quiet, { color: colors.ink2 }]}>
                      Nothing in your stash yet.
                    </Text>
                  ) : (
                    stash.map((entry) => (
                      <YarnChoice
                        key={entry.id}
                        row={entry}
                        selected={yarnId === entry.id}
                        onPress={() => toggleYarn(entry.id)}
                      />
                    ))
                  )}
                  <AddRow label="Add a yarn" onPress={addYarn} />
                </>
              )}
            </View>

            <View style={styles.rows}>
              <View style={styles.field}>
                <Text style={[styles.fieldLabel, { color: colors.ink2 }]}>
                  Needles
                </Text>
              </View>

              {written === null ? (
                <View style={styles.field}>
                  <Text
                    style={[
                      styles.note,
                      { color: unread ? colors.aqua : colors.ink2 },
                    ]}
                  >
                    {unread
                      ? "Needles couldn’t be loaded · they’ll be left as they are"
                      : "Loading"}
                  </Text>
                </View>
              ) : (
                <>
                  {needles.length === 0 ? (
                    <Text style={[styles.quiet, { color: colors.ink2 }]}>
                      No needles recorded.
                    </Text>
                  ) : (
                    needles.map((needle) => (
                      <NeedleChoice
                        key={needle.id}
                        row={needle}
                        selected={
                          needle.sizeMm !== null &&
                          sizeKeys.includes(sizeKey(needle.sizeMm))
                        }
                        onPress={() => {
                          if (needle.sizeMm !== null) {
                            toggleSize(sizeKey(needle.sizeMm));
                          }
                        }}
                      />
                    ))
                  )}

                  {/* Four words for the whole caveat, as on Cast on: these go
                      on the project, and Ravelry has no way to put them in the
                      knitter's drawer. */}
                  <AddRow
                    label="All sizes"
                    note="project only"
                    open={sizesOpen}
                    onPress={toggleSizes}
                  />

                  {sizesOpen ? (
                    <SizeGrid
                      options={sizes}
                      selected={sizeKeys}
                      notice={{
                        line: sizesUnavailable
                          ? "Sizes unavailable · check connection"
                          : "Loading",
                        unavailable: sizesUnavailable,
                      }}
                      onPress={toggleSize}
                    />
                  ) : null}

                  <AddRow label="Add a needle" onPress={addNeedle} />
                </>
              )}
            </View>

            <View style={styles.field}>
              <Text style={[styles.fieldLabel, { color: colors.ink2 }]}>Notes</Text>
              <TextField
                value={notes}
                onChangeText={(value) => {
                  setNotes(value);
                  touch();
                }}
                accessibilityLabel="Notes"
                editable={!busy && written !== null}
                returnKeyType="done"
              />
            </View>

            <View style={styles.field}>
              {/* Named for what it is, the way the project screen names it:
                  nobody on ravelry.com can read this box, and that is worth
                  saying on the screen that lets somebody type into it. */}
              <Text style={[styles.fieldLabel, { color: colors.ink2 }]}>
                Private notes
              </Text>
              <TextField
                value={privateNotes}
                onChangeText={(value) => {
                  setPrivateNotes(value);
                  touch();
                }}
                accessibilityLabel="Private notes"
                editable={!busy && written !== null}
                returnKeyType="done"
              />
              {/* One line under the pair rather than one under each: it is a
                  single request that did not land, and saying so twice would
                  make it sound like two things went wrong. */}
              {written === null ? (
                <Text style={[styles.note, { color: colors.aqua }]}>
                  Notes couldn&rsquo;t be loaded · they&rsquo;ll be left as they
                  are
                </Text>
              ) : null}
            </View>

            {/* The thing the boxes above cannot say, at the far end of the form
                from the action and uncoloured — this app has no destructive
                tone, so the ghost button is how it says "least likely thing
                anybody came here to do". See the head of this file for why it
                is the one control that asks twice. */}
            <View style={styles.danger}>
              {armed ? (
                <View style={styles.block}>
                  <Text style={[styles.note, { color: colors.ink2 }]}>
                    This removes the project from Ravelry — photos, notes and
                    all. It can&rsquo;t be undone.
                  </Text>
                </View>
              ) : null}

              <View style={styles.aside}>
                <Button
                  variant="ghost"
                  size="sm"
                  disabled={busy}
                  accessibilityLabel={
                    armed
                      ? "Tap again to delete this project from Ravelry"
                      : "Delete this project"
                  }
                  onPress={remove}
                >
                  {armed ? "Tap again to delete" : "Delete project"}
                </Button>
              </View>
            </View>
          </ScrollView>

          <View
            style={[
              styles.footer,
              {
                backgroundColor: colors.paper,
                borderTopColor: colors.hairline,
                paddingBottom: space.s4 + insets.bottom,
              },
            ]}
          >
            {deleting ? (
              <Text style={[styles.stampLeft, { color: colors.ink2 }]}>
                Deleting…
              </Text>
            ) : saving ? (
              <Text style={[styles.stampLeft, { color: colors.ink2 }]}>
                Saving…
              </Text>
            ) : problem !== null ? (
              <Text
                style={[
                  styles.stampLeft,
                  { color: problem === "failed" ? colors.mustard : colors.aqua },
                ]}
              >
                {(failedToDelete ? DELETE_NOTICES : NOTICES)[problem]}
              </Text>
            ) : null}

            <Button
              variant="primary"
              size="lg"
              full
              disabled={!changed || busy}
              onPress={save}
            >
              Save changes
            </Button>
          </View>
        </KeyboardAvoidingView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  content: {
    // The sheet next door's measurements down to the last one: this is that
    // form over a project rather than a skein, and the two of them opening
    // differently would say they were not.
    gap: space.s8,
    paddingTop: space.s3,
    paddingBottom: space.s6,
  },
  /** Inset like the fields, for prose that is not a field. */
  block: { paddingHorizontal: space.s4 },
  fieldLabel: {
    fontFamily: fonts.ui,
    fontSize: type.small.fontSize,
    lineHeight: type.small.lineHeight,
    letterSpacing: trackSmall,
  },
  // One thing the sheet asks for: its label and the control under it.
  field: {
    paddingHorizontal: space.s4,
    gap: space.s2,
  },
  /**
   * A label and the run of choice rows under it. Like `field`, but the inset
   * moves off the block and onto the label inside it, because these rows draw
   * their own hairlines and have to reach both edges to do it — the same
   * arrangement the yarn sheet's colour grid and status rail sit in.
   */
  rows: { gap: space.s2 },
  /** What a section says when the drawer behind it is empty. */
  quiet: {
    fontFamily: fonts.ui,
    fontSize: type.small.fontSize,
    lineHeight: type.small.lineHeight,
    letterSpacing: trackSmall,
    paddingHorizontal: space.s4,
    paddingBottom: space.s2,
  },
  /** The warning and the button it belongs to, held together as one block. */
  danger: { gap: space.s2 },
  aside: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.s2,
    // The `sm` button's own 12pt of padding, pulled back, so the label starts
    // on the same line as every field label above it.
    paddingHorizontal: space.s4 - 12,
  },
  footer: {
    paddingTop: space.s4,
    paddingHorizontal: space.s4,
    gap: space.s3,
    borderTopWidth: 1,
  },
  note: {
    fontFamily: fonts.ui,
    fontSize: type.small.fontSize,
    lineHeight: type.small.lineHeight,
    letterSpacing: trackSmall,
  },
  stampLeft: {
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
