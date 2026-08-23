/**
 * Add a yarn — the app's second write, on its own sheet.
 *
 * It used to be an area that unfolded inside Cast on, on the reasoning that a
 * sheet over a sheet is a place to get lost. What it actually was is a screen's
 * worth of decisions — search, or type a name; then a weight, then a colourway
 * — folded into a list that already had two of its own, with its button forced
 * quiet because the action on that screen was already spoken for. Given its own
 * sheet it gets the shape it always wanted: one thing to do, said once at the
 * bottom, filled, because here it *is* the action.
 *
 * There are two ways through, and they are the same two as before:
 *
 * - **Search** the yarn database and tap a result. The yarn is then staged —
 *   shown with its company and weight, one tap from being put back.
 * - **Add by name**, for the skein that is not in the database or not worth
 *   finding: a name and one of the twelve weights, typed.
 *
 * Either way, once there is a yarn to talk about the sheet asks everything the
 * edit sheet asks, in the edit sheet's order and its markup: colourway, colour,
 * dye lot, location, status, notes. A skein described on the way in is a skein
 * nobody has to open a second sheet to describe, and two sheets asking
 * different questions about the same object only ever read as an oversight.
 *
 * Nothing is written until the button at the bottom, and then it can take two
 * requests. `stash/create.json` accepts the yarn, the status and the pack —
 * which is to say the colourway and the colour family — and has nowhere at all
 * to put a dye lot, a location or a note; those three are only verified on the
 * entry's own endpoint, the one the edit sheet posts to. So the create goes
 * first, and if the knitter wrote any of the three an update follows it
 * carrying only those. A skein with none of them is one request, as it always
 * was, and a failure in either half fails the add out loud — the same thing
 * this sheet has always done with the refresh below.
 *
 * The notes box here needs none of the edit sheet's care. That one keeps its
 * box shut until a second request has read what is already written there,
 * because `stash/list.json` carries no notes and an open empty box is a promise
 * to save over them. A brand-new entry has none to lose.
 *
 * The shade dialled in under the swatches is in neither request: there is no
 * field on a stash entry that would hold one. It waits for the create to hand
 * back an id and then hangs on that id, on this device — see `yarn-colors.ts`.
 *
 * Then the mirror is brought level with Ravelry, because the screen this
 * returns to reads the mirror and not the network. The id of what was written
 * goes in the slot `pending-selection` keeps, and Cast on picks the skein up
 * from there.
 *
 * That last step only happens when asked — `?handBack=1`, which Cast on passes
 * and Stash does not. Stash opens this sheet to add yarn and nothing else, and
 * an id left in the slot there would arrive preselected on the next project the
 * knitter started, which they never asked for.
 *
 * A request in flight is a stamped line under the button it belongs to, a
 * failure is a quieter one, and both clear the moment it is tried again.
 */

import { router, useLocalSearchParams } from "expo-router";
import { useCallback, useState } from "react";
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
import { FilterChip } from "@/components/ui/filter-chip";
import { TextField } from "@/components/ui/text-field";
import {
  createStashEntry,
  refreshStash,
  rememberYarnColor,
  rememberYarnPhoto,
  STASH_STATUSES,
  STASH_STATUS_IN_STASH,
  updateStashEntry,
  yarnWeightId,
  YARN_WEIGHTS,
  type RavelryYarnSummary,
  type StashPack,
  type StashUpdate,
} from "@/data";
import { readParam } from "@/features/detail/raw";
import { setPendingStashSelection } from "@/features/start-project/pending-selection";
import { triage, type Problem } from "@/features/start-project/problem";
import { AddRow, StagedYarn, YarnResult } from "@/features/start-project/rows";
import {
  useYarnSearch,
  yarnPhoto,
} from "@/features/start-project/use-yarn-search";
import { ColorGrid } from "@/features/stash/color-grid";
import { haptics } from "@/haptics";
import { fonts, space, trackSmall, type, useTheme } from "@/theme";

const NOTICES: Record<Problem, string> = {
  failed: "Couldn't add the yarn.",
  // Aqua, not mustard: nothing went wrong, the request simply never left.
  offline: "You're offline · try again later.",
  signedOut: "Sign in on the Stash tab to add yarn.",
};

export default function AddYarnScreen() {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const { user } = useAuth();
  const params = useLocalSearchParams();

  const username = user?.username ?? null;
  // Cast on asks for the skein back, because it opened this sheet in the
  // middle of choosing one. Stash does not — it opened it to add yarn and
  // nothing more, and a slot filled there would turn up preselected on
  // whatever project is started next. See `pending-selection`.
  const handsBack = readParam(params.handBack) === "1";

  const [query, setQuery] = useState("");
  const [staged, setStaged] = useState<RavelryYarnSummary | null>(null);
  const [byName, setByName] = useState(false);
  const [personalName, setPersonalName] = useState("");
  const [weight, setWeight] = useState<string | null>(null);

  // What the skein is, as opposed to which yarn it is. None of it is touched by
  // staging or unstaging a search result: a knitter who typed a dye lot and
  // then went back to find the right yarn in the database meant to keep it.
  const [colorway, setColorway] = useState("");
  const [colorFamilyId, setColorFamilyId] = useState<number | null>(null);
  // Ravelry has nowhere to put this one. See `yarn-colors.ts`, and the write.
  const [colorHex, setColorHex] = useState<string | null>(null);
  const [dyeLot, setDyeLot] = useState("");
  const [location, setLocation] = useState("");
  // Not null, the way the edit sheet's is: a skein being added is in the stash
  // until the knitter says otherwise, and that is worth saying out loud on the
  // chips rather than leaving the rail blank and posting the same id anyway.
  const [statusId, setStatusId] = useState(STASH_STATUS_IN_STASH);
  const [notes, setNotes] = useState("");

  const [saving, setSaving] = useState(false);
  const [problem, setProblem] = useState<Problem | null>(null);

  // A staged yarn is an answer, so the search stops looking for another one.
  const search = useYarnSearch(query, staged === null);

  const canAdd = staged !== null || personalName.trim() !== "";

  const stageYarn = useCallback((chosen: RavelryYarnSummary) => {
    setStaged(chosen);
    // Picking a yarn out of the database is the answer to "can't find it?",
    // so the hand-typed path folds away rather than sitting underneath one.
    setByName(false);
    setPersonalName("");
    setWeight(null);
    setProblem(null);
  }, []);

  const clearStaged = useCallback(() => setStaged(null), []);

  const openByName = useCallback(() => {
    setByName(true);
    setProblem(null);
  }, []);

  const toggleWeight = useCallback((permalink: string) => {
    setWeight((current) => (current === permalink ? null : permalink));
  }, []);

  const addToStash = useCallback(() => {
    if (saving || !canAdd) {
      return;
    }

    // Every attempt starts clean: the last failure clears on retry.
    setProblem(null);

    if (username === null) {
      setProblem("signedOut");
      haptics.error();
      return;
    }

    setSaving(true);

    void (async () => {
      try {
        const databaseYarn = typeof staged?.id === "number" ? staged.id : null;
        const trimmedName = personalName.trim();
        const trimmedColorway = colorway.trim();

        const pack: StashPack = {};

        if (databaseYarn === null) {
          pack.personal_name = trimmedName;

          // A weight this app cannot match to an id is dropped rather than
          // guessed at, and never worth failing the whole add over.
          const id = weight === null ? null : await weightId(weight);
          if (id !== null) {
            pack.personal_yarn_weight_id = id;
          }
        }

        if (trimmedColorway !== "") {
          pack.colorway = trimmedColorway;
        }

        // Only ever set, never cleared. The edit sheet posts a null to mean
        // "take the colour off"; an entry that does not exist yet has no colour
        // on it, so nothing chosen is simply a key left off.
        if (colorFamilyId !== null) {
          pack.color_family_id = colorFamilyId;
        }

        const entry = await createStashEntry(username, {
          yarn_id: databaseYarn ?? undefined,
          stash_status_id: statusId,
          pack: Object.keys(pack).length === 0 ? undefined : pack,
        });

        const newId = typeof entry.id === "number" ? entry.id : null;

        // The other half of the write, and only because the create shape has
        // nowhere to put these three — see the head of this file. One request
        // carrying whatever was actually typed, and no request at all when that
        // is nothing, which is most skeins.
        if (newId !== null) {
          const changes: StashUpdate = {};
          const trimmedDyeLot = dyeLot.trim();
          const trimmedLocation = location.trim();
          const trimmedNotes = notes.trim();

          if (trimmedDyeLot !== "") {
            changes.dye_lot = trimmedDyeLot;
          }

          if (trimmedLocation !== "") {
            changes.location = trimmedLocation;
          }

          if (trimmedNotes !== "") {
            changes.notes = trimmedNotes;
          }

          if (Object.keys(changes).length > 0) {
            await updateStashEntry(username, newId, changes);
          }
        }

        // The photograph off the search result, kept before the refresh below
        // rather than fetched after it: a stash record carries no picture at
        // all, and this one is already in hand. Written even when the yarn had
        // none, so the fill behind the list does not go asking about it.
        if (databaseYarn !== null && staged !== null) {
          rememberYarnPhoto(databaseYarn, yarnPhoto(staged) ?? null);
        }

        // The family went to Ravelry in the pack; the shade stays here, on the
        // id Ravelry has just handed back, because until there was one there
        // was nothing to hang a colour on.
        if (newId !== null && colorHex !== null) {
          rememberYarnColor(newId, colorHex, colorFamilyId);
        }

        // Cast on's stash list is read from the mirror, so the new skein has
        // to be in it before this sheet gets out of the way — and the slot
        // below is how the row it names gets chosen once it is.
        await refreshStash(username);

        if (handsBack && newId !== null) {
          setPendingStashSelection(newId);
        }

        // Said before the sheet goes: the skein is in the stash, and the screen
        // underneath has no way to say so on this one's behalf.
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
    canAdd,
    colorFamilyId,
    colorHex,
    colorway,
    dyeLot,
    handsBack,
    location,
    notes,
    personalName,
    saving,
    staged,
    statusId,
    username,
    weight,
  ]);

  // What the search has to say for itself, in one stamped line under the
  // field: never an empty results area, never a spinner.
  const searching = search.signedOut
    ? "Sign in on the Stash tab to search yarns."
    : search.unavailable
      ? "Search unavailable · check connection"
      : search.loading
        ? "Searching"
        : query.trim() !== "" && search.yarns.length === 0
          ? "No yarns by that name."
          : null;

  // The results and "Can't find it?" are one run of rows, and opening the
  // hand-typed path takes that last row out of it: with nothing found there is
  // no run left to draw, and an empty one would still take a section's worth of
  // space out of the gap below.
  const hasRows = !byName || search.yarns.length > 0;

  return (
    // No `SafeAreaView` top edge, for the same reason as Cast on: on iOS this
    // route is a sheet, already inset from the status bar by the presentation
    // itself. Android presents it full-bleed, so it does need the inset.
    <View
      style={[
        styles.screen,
        {
          backgroundColor: colors.paper,
          paddingTop: Platform.OS === "android" ? insets.top : 0,
        },
      ]}
    >
      <BackBar title="Add a yarn" />

      <KeyboardAvoidingView
        style={styles.screen}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <ScrollView
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="on-drag"
          contentContainerStyle={styles.content}
        >
          <View style={styles.field}>
            <Text style={[styles.fieldLabel, { color: colors.ink2 }]}>Search yarns</Text>
            {/* The keyboard is up on arrival: the knitter opened this sheet to
                name a yarn, and the field is the first thing to do. */}
            <TextField
              value={query}
              onChangeText={setQuery}
              accessibilityLabel="Search yarns"
              autoFocus
              editable={!saving}
              returnKeyType="done"
            />
            {searching === null ? null : (
              <Text
                style={[
                  styles.note,
                  { color: search.unavailable || search.signedOut ? colors.aqua : colors.ink2 },
                ]}
              >
                {searching}
              </Text>
            )}
          </View>

          {staged === null ? (
            <>
              {/* The rows keep the hairlines and the flush stacking a list
                  wants: they are results to scan past, not fields to fill in,
                  and the "add by name" row is one of them until it is tapped. */}
              {hasRows ? (
                <View>
                  {search.yarns.map((yarn, index) => (
                    // A result Ravelry sent no id for is keyed by where it
                    // landed: two yarns of the same name would otherwise be
                    // one row.
                    <YarnResult
                      key={`result-${yarn.id ?? yarn.permalink ?? index}`}
                      yarn={yarn}
                      onPress={() => stageYarn(yarn)}
                    />
                  ))}

                  {byName ? null : (
                    <AddRow label="Can't find it? Add by name" open={false} onPress={openByName} />
                  )}
                </View>
              ) : null}

              {byName ? (
                <>
                  <View style={styles.field}>
                    <Text style={[styles.fieldLabel, { color: colors.ink2 }]}>Name</Text>
                    <TextField
                      value={personalName}
                      onChangeText={setPersonalName}
                      accessibilityLabel="Yarn name"
                      editable={!saving}
                      returnKeyType="done"
                    />
                  </View>

                  <View style={styles.weights}>
                    <View style={styles.field}>
                      <Text style={[styles.fieldLabel, { color: colors.ink2 }]}>Weight</Text>
                    </View>
                    <ScrollView
                      horizontal
                      showsHorizontalScrollIndicator={false}
                      keyboardShouldPersistTaps="handled"
                      contentContainerStyle={styles.rail}
                    >
                      {YARN_WEIGHTS.map((option) => (
                        <FilterChip
                          key={option.permalink}
                          flush
                          label={option.label}
                          active={weight === option.permalink}
                          onPress={() => toggleWeight(option.permalink)}
                        />
                      ))}
                    </ScrollView>
                  </View>
                </>
              ) : null}
            </>
          ) : (
            <StagedYarn yarn={staged} onClear={clearStaged} />
          )}

          {/* Everything about the skein rather than the yarn, written once and
              hung under whichever of the two ways through got here — two copies
              of a form this long is how the two of them drift apart. It waits
              for a yarn: before there is one this sheet is a search field and a
              run of results, and a form under those would be a form about
              nothing in particular. */}
          {staged !== null || byName ? (
            <>
              <View style={styles.field}>
                <Text style={[styles.fieldLabel, { color: colors.ink2 }]}>Colorway</Text>
                <TextField
                  value={colorway}
                  onChangeText={setColorway}
                  accessibilityLabel="Colorway"
                  editable={!saving}
                  returnKeyType="done"
                />
              </View>

              <View style={styles.stack}>
                <View style={styles.field}>
                  <Text style={[styles.fieldLabel, { color: colors.ink2 }]}>Colour</Text>
                </View>
                <ColorGrid
                  selected={colorFamilyId}
                  hex={colorHex}
                  onSelect={setColorFamilyId}
                  onTweak={setColorHex}
                  disabled={saving}
                />
              </View>

              <View style={styles.field}>
                <Text style={[styles.fieldLabel, { color: colors.ink2 }]}>Dye lot</Text>
                <TextField
                  value={dyeLot}
                  onChangeText={setDyeLot}
                  accessibilityLabel="Dye lot"
                  editable={!saving}
                  returnKeyType="done"
                />
              </View>

              <View style={styles.field}>
                <Text style={[styles.fieldLabel, { color: colors.ink2 }]}>Location</Text>
                <TextField
                  value={location}
                  onChangeText={setLocation}
                  accessibilityLabel="Location"
                  editable={!saving}
                  returnKeyType="done"
                />
              </View>

              <View style={styles.stack}>
                <View style={styles.field}>
                  <Text style={[styles.fieldLabel, { color: colors.ink2 }]}>Status</Text>
                </View>
                <ScrollView
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  keyboardShouldPersistTaps="handled"
                  contentContainerStyle={styles.rail}
                >
                  {/* A chip here only ever chooses, where a weight chip on the
                      hand-typed path also unchooses: a skein is in one of these
                      five whether or not anybody says so, so there is no blank
                      to go back to. The edit sheet's rail behaves the same. */}
                  {STASH_STATUSES.map((option) => (
                    <FilterChip
                      key={option.id}
                      flush
                      label={option.label}
                      active={statusId === option.id}
                      onPress={() => setStatusId(option.id)}
                    />
                  ))}
                </ScrollView>
              </View>

              {/* Open from the start, unlike the edit sheet's, which stays shut
                  until it has read what is already written there. Nothing has
                  been written here yet. */}
              <View style={styles.field}>
                <Text style={[styles.fieldLabel, { color: colors.ink2 }]}>Notes</Text>
                <TextField
                  value={notes}
                  onChangeText={setNotes}
                  accessibilityLabel="Notes"
                  editable={!saving}
                  returnKeyType="done"
                />
              </View>
            </>
          ) : null}
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
          {saving ? (
            <Text style={[styles.stamp, { color: colors.ink2 }]}>Adding…</Text>
          ) : problem !== null ? (
            <Text
              style={[
                styles.stamp,
                { color: problem === "failed" ? colors.mustard : colors.aqua },
              ]}
            >
              {NOTICES[problem]}
            </Text>
          ) : null}

          {/* The one action on this screen. It was quiet while this was an
              area inside Cast on, because Cast on's action was the button below
              it; on its own sheet there is nothing else here to be. */}
          <Button
            variant="primary"
            size="lg"
            full
            disabled={!canAdd || saving}
            onPress={addToStash}
          >
            Add to stash
          </Button>
        </View>
      </KeyboardAvoidingView>
    </View>
  );
}

/**
 * The weight's Ravelry id, or null.
 *
 * The lookup is one memoized read of a table that cannot change, and a stash
 * entry is perfectly good without it, so a failure here is swallowed rather
 * than turned into an error the knitter has to do something about.
 */
async function weightId(permalink: string): Promise<number | null> {
  try {
    return await yarnWeightId(permalink);
  } catch {
    return null;
  }
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  content: {
    // What used to divide one field from the next is this gap and not a rule:
    // the field draws its own box now, and a hairline outside it would be a
    // second edge saying the same thing. 32 rather than the 24 the ruled
    // rhythm came to, because without the line 24 reads as one group and not
    // two.
    gap: space.s8,
    paddingTop: space.s3,
    paddingBottom: space.s6,
  },
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
  // The weight rail has to reach both edges, so the inset moves off the block
  // and onto the label inside it.
  weights: { gap: space.s2 },
  // The same arrangement for the colour grid and the status rail, which reach
  // both edges too — the edit sheet's `stack`, at the gap it uses there, so the
  // two sheets put the same blocks at the same distance from their labels.
  stack: { gap: space.s3 },
  rail: {
    // 17 rather than 16: every chip is `flush`, which pulls it 1px left to
    // share its neighbour's border, and the first chip has no neighbour.
    paddingLeft: space.s4 + 1,
    paddingRight: space.s4,
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
  stamp: {
    fontFamily: fonts.ui,
    fontSize: type.small.fontSize,
    lineHeight: type.small.lineHeight,
    letterSpacing: trackSmall,
    textAlign: "center",
  },
});
