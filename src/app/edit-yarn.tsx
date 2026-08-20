/**
 * Edit a yarn — the first thing in this app that rewrites something Ravelry
 * already has.
 *
 * `add-yarn`'s shell and `add-yarn`'s footer, because it is the same kind of
 * decision said a second time. What is different is everything about how it
 * saves, and all of it comes from one fact: **the stash list carries no
 * `notes`.** `stash/list.json` sends the colourway, the dye lot, the location
 * and the status, and not a word of the notes; those only exist on
 * `/people/{user}/stash/{id}.json`, one entry at a time.
 *
 * A sheet that posted every field back would therefore wipe the notes of any
 * knitter who opened it on a train. So nothing is posted that was not touched:
 * the sheet keeps what it opened with, compares on save, and sends the
 * difference. Verified on a live entry (2026-08-19) that this is safe — a
 * partial `pack` *merges*, so sending `{colorway}` alone leaves
 * `color_family_id` where it was, and `stash_status_id` alone touches nothing
 * else.
 *
 * The notes box is the honest half of that. It is filled by a second request
 * for the entry, and until that lands — or if it never does — the box is
 * disabled and says so, because an empty box the knitter could type into is a
 * promise to save what they typed over notes nobody has read yet.
 *
 * - **Colour** is the one field that is picked rather than typed: Ravelry's
 *   twenty colour families as swatches. See `ColorGrid`.
 * - **Name** and **weight** appear only for an entry with no database yarn.
 *   Where Ravelry knows the yarn, those facts are the yarn's, not this skein's.
 */

import { router, useLocalSearchParams } from "expo-router";
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
import { FilterChip } from "@/components/ui/filter-chip";
import { TextField } from "@/components/ui/text-field";
import {
  forgetYarnColor,
  getStashById,
  getYarnColor,
  refreshStash,
  rememberYarnColor,
  stashEntryShow,
  STASH_STATUSES,
  updateStashEntry,
  yarnWeightId,
  YARN_WEIGHTS,
  type StashPack,
  type StashUpdate,
} from "@/data";
import {
  firstNumber,
  firstString,
  parseRaw,
  readId,
} from "@/features/detail/raw";
import { triage, type Problem } from "@/features/start-project/problem";
import { ColorGrid } from "@/features/stash/color-grid";
import { fonts, space, trackMicro, type, useTheme } from "@/theme";

const NOTICES: Record<Problem, string> = {
  failed: "Couldn't save the changes.",
  // Aqua, not mustard: nothing went wrong, the request simply never left.
  offline: "You're offline · try again later.",
  signedOut: "Sign in on the You tab to edit yarn.",
};

/** What the sheet opened with, and what it compares against on the way out. */
type Draft = {
  colorway: string;
  dyeLot: string;
  location: string;
  personalName: string;
  weight: string | null;
  statusId: number | null;
  colorFamilyId: number | null;
  /**
   * The shade dialled in on this device, or null to sit on the family's own
   * swatch. Never posted — Ravelry has nowhere to put it. See `yarn-colors.ts`.
   */
  colorHex: string | null;
};

/** Trimmed, with the empty string standing for "nothing here". */
function clean(value: string | null | undefined): string {
  return typeof value === "string" ? value.trim() : "";
}

export default function EditYarnScreen() {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const { user } = useAuth();
  const { id: param } = useLocalSearchParams<"/edit-yarn">();

  const username = user?.username ?? null;
  const id = readId(param);

  // One read, not a live one: this sheet is a form, and a sync rewriting the
  // row underneath a half-typed colourway would take the knitter's work away.
  const row = useMemo(() => (id === null ? null : getStashById(id)), [id]);
  const raw = useMemo(() => parseRaw(row?.raw), [row]);

  // A stash entry of a database yarn takes its name and weight from that yarn.
  // Only a hand-typed one carries its own, and only there are they editable.
  const hasDatabaseYarn = row?.yarnId !== null && row?.yarnId !== undefined;

  const opened = useMemo<Draft>(
    () => ({
      colorway: clean(
        firstString(raw, [["colorway_name"], ["primary_pack", "colorway"]]) ??
          row?.colorway,
      ),
      dyeLot: clean(
        firstString(raw, [["dye_lot"], ["primary_pack", "dye_lot"]]),
      ),
      location: clean(firstString(raw, [["location"]])),
      personalName: clean(
        firstString(raw, [["primary_pack", "personal_name"]]) ?? row?.yarnName,
      ),
      weight: weightPermalink(row?.weightName ?? null),
      statusId: firstNumber(raw, [
        ["stash_status", "id"],
        ["stash_status_id"],
      ]),
      colorFamilyId: firstNumber(raw, [
        ["primary_pack", "color_family_id"],
        ["packs", "0", "color_family_id"],
        ["color_family_id"],
      ]),
      colorHex: id === null ? null : getYarnColor(id),
    }),
    [id, raw, row],
  );

  // Seeded once and then owned by the knitter. `opened` cannot change under it
  // — it is memoized on an `id` this sheet is mounted for — so there is no
  // effect syncing the two, and nothing that could take a half-typed colourway
  // away mid-edit.
  const [draft, setDraft] = useState<Draft>(opened);
  const [saving, setSaving] = useState(false);
  const [problem, setProblem] = useState<Problem | null>(null);

  // Notes live nowhere but on the entry's own endpoint — see the note at the
  // top. Until this lands the box stays shut rather than inviting a knitter to
  // type over something it has not read.
  const [notes, setNotes] = useState("");
  const [notesOpened, setNotesOpened] = useState<string | null>(null);

  useEffect(() => {
    if (username === null || id === null) {
      return;
    }

    let live = true;

    void (async () => {
      try {
        const entry = await stashEntryShow(username, id);
        const written = clean(firstString(entry, [["notes"], ["comment"]]));

        if (live) {
          setNotes(written);
          setNotesOpened(written);
        }
      } catch {
        // One quiet line where the box would be. Everything else on this sheet
        // still saves — the notes are simply not this knitter's to lose today.
      }
    })();

    return () => {
      live = false;
    };
  }, [id, username]);

  const set = useCallback(<K extends keyof Draft>(key: K, value: Draft[K]) => {
    setDraft((current) => ({ ...current, [key]: value }));
    setProblem(null);
  }, []);

  const notesChanged = notesOpened !== null && notes.trim() !== notesOpened;

  const changed =
    notesChanged ||
    draft.colorway !== opened.colorway ||
    draft.dyeLot !== opened.dyeLot ||
    draft.location !== opened.location ||
    draft.statusId !== opened.statusId ||
    draft.colorFamilyId !== opened.colorFamilyId ||
    draft.colorHex !== opened.colorHex ||
    (!hasDatabaseYarn &&
      (draft.personalName !== opened.personalName ||
        draft.weight !== opened.weight));

  const save = useCallback(() => {
    if (saving || !changed || id === null) {
      return;
    }

    if (username === null) {
      setProblem("signedOut");
      return;
    }

    setProblem(null);
    setSaving(true);

    void (async () => {
      try {
        const pack: StashPack = {};
        const changes: StashUpdate = {};

        if (draft.colorway !== opened.colorway) {
          pack.colorway = draft.colorway;
        }

        if (draft.colorFamilyId !== opened.colorFamilyId) {
          // Null is the clear, and Ravelry takes it as one — verified.
          pack.color_family_id = draft.colorFamilyId;
        }

        if (!hasDatabaseYarn) {
          if (draft.personalName !== opened.personalName) {
            pack.personal_name = draft.personalName;
          }

          if (draft.weight !== opened.weight && draft.weight !== null) {
            // A weight this app cannot match to an id is dropped rather than
            // guessed at, exactly as the add sheet drops it.
            const weightId = await lookupWeight(draft.weight);
            if (weightId !== null) {
              pack.personal_yarn_weight_id = weightId;
            }
          }
        }

        if (draft.dyeLot !== opened.dyeLot) {
          changes.dye_lot = draft.dyeLot;
        }

        if (draft.location !== opened.location) {
          changes.location = draft.location;
        }

        if (draft.statusId !== opened.statusId && draft.statusId !== null) {
          changes.stash_status_id = draft.statusId;
        }

        if (notesChanged) {
          changes.notes = notes.trim();
        }

        if (Object.keys(pack).length > 0) {
          changes.pack = pack;
        }

        // The family goes to Ravelry; the shade stays here, because there is
        // no field on a stash entry that will hold one. Written before the
        // request rather than after it: it is a local row that cannot fail, and
        // if the network half does fail the knitter still has the colour they
        // just matched by eye.
        if (draft.colorHex !== opened.colorHex) {
          if (draft.colorHex === null) {
            forgetYarnColor(id);
          } else {
            rememberYarnColor(id, draft.colorHex, draft.colorFamilyId);
          }
        }

        // Nothing changed on Ravelry's side of it — a shade-only edit is done.
        if (Object.keys(changes).length > 0) {
          await updateStashEntry(username, id, changes);
        }

        // The screen behind this one reads the mirror, not the network, so the
        // edit has to be in it before this sheet gets out of the way.
        await refreshStash(username);

        router.back();
      } catch (error) {
        setProblem(triage(error));
      } finally {
        setSaving(false);
      }
    })();
  }, [
    changed,
    draft,
    hasDatabaseYarn,
    id,
    notes,
    notesChanged,
    opened,
    saving,
    username,
  ]);

  const title = row?.colorway ?? row?.yarnName ?? "this yarn";

  return (
    // No `SafeAreaView` top edge, for the same reason as Add a yarn: on iOS this
    // route is a sheet, already inset from the status bar by the presentation.
    <View
      style={[
        styles.screen,
        {
          backgroundColor: colors.paper,
          paddingTop: Platform.OS === "android" ? insets.top : 0,
        },
      ]}
    >
      <BackBar title="Edit yarn" />

      {row === null ? (
        <Text style={[styles.stamp, { color: colors.ink2 }]}>
          Yarn unavailable.
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
            {/* The screen's name went up to the bar; this line did not follow
                it, because the bar says which screen this is and only this says
                which skein. */}
            <View style={styles.block}>
              <Text style={[styles.note, { color: colors.ink2 }]}>{title}</Text>
            </View>

            {hasDatabaseYarn ? null : (
              <>
                <View style={styles.field}>
                  <Text style={[styles.fieldLabel, { color: colors.ink2 }]}>
                    Name
                  </Text>
                  <TextField
                    value={draft.personalName}
                    onChangeText={(value) => set("personalName", value)}
                    accessibilityLabel="Yarn name"
                    editable={!saving}
                    returnKeyType="done"
                  />
                </View>

                <View style={styles.weights}>
                  <View style={styles.field}>
                    <Text style={[styles.fieldLabel, { color: colors.ink2 }]}>
                      Weight
                    </Text>
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
                        active={draft.weight === option.permalink}
                        onPress={() =>
                          set(
                            "weight",
                            draft.weight === option.permalink
                              ? null
                              : option.permalink,
                          )
                        }
                      />
                    ))}
                  </ScrollView>
                </View>
              </>
            )}

            <View style={styles.field}>
              <Text style={[styles.fieldLabel, { color: colors.ink2 }]}>
                Colorway
              </Text>
              <TextField
                value={draft.colorway}
                onChangeText={(value) => set("colorway", value)}
                accessibilityLabel="Colorway"
                editable={!saving}
                returnKeyType="done"
              />
            </View>

            <View style={styles.stack}>
              <View style={styles.field}>
                <Text style={[styles.fieldLabel, { color: colors.ink2 }]}>
                  Colour
                </Text>
              </View>
              <ColorGrid
                selected={draft.colorFamilyId}
                hex={draft.colorHex}
                onSelect={(value) => set("colorFamilyId", value)}
                onTweak={(value) => set("colorHex", value)}
                disabled={saving}
              />
            </View>

            <View style={styles.field}>
              <Text style={[styles.fieldLabel, { color: colors.ink2 }]}>
                Dye lot
              </Text>
              <TextField
                value={draft.dyeLot}
                onChangeText={(value) => set("dyeLot", value)}
                accessibilityLabel="Dye lot"
                editable={!saving}
                returnKeyType="done"
              />
            </View>

            <View style={styles.field}>
              <Text style={[styles.fieldLabel, { color: colors.ink2 }]}>
                Location
              </Text>
              <TextField
                value={draft.location}
                onChangeText={(value) => set("location", value)}
                accessibilityLabel="Location"
                editable={!saving}
                returnKeyType="done"
              />
            </View>

            <View style={styles.stack}>
              <View style={styles.field}>
                <Text style={[styles.fieldLabel, { color: colors.ink2 }]}>
                  Status
                </Text>
              </View>
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                keyboardShouldPersistTaps="handled"
                contentContainerStyle={styles.rail}
              >
                {STASH_STATUSES.map((option) => (
                  <FilterChip
                    key={option.id}
                    flush
                    label={option.label}
                    active={draft.statusId === option.id}
                    onPress={() => set("statusId", option.id)}
                  />
                ))}
              </ScrollView>
            </View>

            <View style={styles.field}>
              <Text style={[styles.fieldLabel, { color: colors.ink2 }]}>
                Notes
              </Text>
              <TextField
                value={notes}
                onChangeText={setNotes}
                accessibilityLabel="Notes"
                editable={!saving && notesOpened !== null}
                returnKeyType="done"
              />
              {notesOpened === null ? (
                <Text style={[styles.note, { color: colors.aqua }]}>
                  Notes couldn&rsquo;t be loaded · they&rsquo;ll be left as they
                  are
                </Text>
              ) : null}
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
            {saving ? (
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
                {NOTICES[problem]}
              </Text>
            ) : null}

            <Button
              variant="primary"
              size="lg"
              full
              disabled={!changed || saving}
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

/** The weight chip that matches a name Ravelry gave us, or none. */
function weightPermalink(name: string | null): string | null {
  if (name === null) {
    return null;
  }

  const wanted = name.trim().toLowerCase();

  return (
    YARN_WEIGHTS.find((option) => option.label.toLowerCase() === wanted)
      ?.permalink ?? null
  );
}

/**
 * The weight's Ravelry id, or null — the same swallow as the add sheet's, for
 * the same reason: a stash entry is perfectly good without one, and a failed
 * lookup is not worth failing the whole save over.
 */
async function lookupWeight(permalink: string): Promise<number | null> {
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
    // s3 at the top, not the s5 a run under a display line takes: one micro
    // line is all that opens this one, and s5 under the bar's hairline hung it
    // low.
    paddingTop: space.s3,
    paddingBottom: space.s6,
  },
  // Which skein this is: inset like the fields below it, and nothing else.
  block: { paddingHorizontal: space.s4 },
  fieldLabel: {
    fontFamily: fonts.ui,
    fontSize: type.small.fontSize,
    lineHeight: type.micro.lineHeight,
    letterSpacing: trackMicro,
  },
  // One thing the sheet asks for: its label and the control under it.
  field: {
    paddingHorizontal: space.s4,
    gap: space.s2,
  },
  // Like `field`, but for the blocks whose rail or grid has to reach both
  // edges, so the inset moves off the block and onto the label inside it.
  stack: { gap: space.s3 },
  weights: { gap: space.s2 },
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
    fontSize: type.micro.fontSize,
    lineHeight: type.micro.lineHeight,
    letterSpacing: trackMicro,
  },
  stampLeft: {
    fontFamily: fonts.ui,
    fontSize: type.micro.fontSize,
    lineHeight: type.micro.lineHeight,
    letterSpacing: trackMicro,
  },
  stamp: {
    fontFamily: fonts.ui,
    fontSize: type.micro.fontSize,
    lineHeight: type.micro.lineHeight,
    letterSpacing: trackMicro,
    textAlign: "center",
    paddingTop: space.s10,
    paddingHorizontal: space.s4,
  },
});
