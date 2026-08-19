/**
 * Getting one picture of the finished thing.
 *
 * Two ways in, and they need different amounts of ceremony. The camera always
 * needs the knitter's permission, so it is asked for — once, by the system, at
 * the moment they tap the button that wants it. The library needs none: both
 * platforms hand the picker to a separate process now (PHPicker on iOS, the
 * photo picker on Android), which returns exactly the one photograph that was
 * chosen and nothing else, and asking for library access anyway would be a
 * dialog in front of a screen that has no use for the answer.
 *
 * Nothing here throws and nothing here alerts. Every path out is one of four
 * words, and the screen turns them into a quiet line under the frame — a
 * refused permission is a state, not an error, and it is certainly not
 * something to interrupt somebody with three seconds after they finished a
 * sweater.
 */

import * as ImagePicker from "expo-image-picker";

import type { UploadFile } from "@/data/ravelry";

export type Pick =
  | { readonly kind: "picked"; readonly file: UploadFile }
  /** They backed out of the picker. Nothing to say about it. */
  | { readonly kind: "canceled" }
  /** Permission refused — the only case with anything to fix, in Settings. */
  | { readonly kind: "denied" }
  /** The picker itself would not open: no camera on this device, mostly. */
  | { readonly kind: "unavailable" };

/**
 * Images only, and re-encoded a little.
 *
 * `quality` below 1 is what keeps a 12-megapixel HEIC from being sent over a
 * train's worth of signal; Ravelry stores at 1600px anyway. No `allowsEditing`:
 * iOS's editor crops to a square, and the frame this lands in is 4/5.
 */
const OPTIONS: ImagePicker.ImagePickerOptions = {
  mediaTypes: ["images"],
  quality: 0.9,
};

const MIME_BY_EXTENSION: Record<string, string> = {
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  png: "image/png",
  heic: "image/heic",
  heif: "image/heif",
};

const EXTENSION_BY_MIME: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/heic": "heic",
  "image/heif": "heif",
};

/** What a photograph with no name of its own is called on the way up. */
const FALLBACK_NAME = "finished-object";

function extensionOf(path: string | null | undefined): string | null {
  if (typeof path !== "string") {
    return null;
  }

  // Query strings and fragments are not part of a filename, and a content://
  // URI can carry both.
  const name = path.split(/[?#]/)[0];
  const dot = name.lastIndexOf(".");

  return dot === -1 ? null : name.slice(dot + 1).toLowerCase();
}

/**
 * The picked asset as a multipart file part.
 *
 * Both of the interesting fields are documented as possibly missing — a
 * library the knitter granted limited access to hands back no filename, and
 * some Android providers know no MIME type — so each has a fallback and the two
 * agree with each other: whatever type we settle on decides the extension the
 * name ends in.
 */
function fileFrom(asset: ImagePicker.ImagePickerAsset): UploadFile {
  const declared = typeof asset.mimeType === "string" ? asset.mimeType.toLowerCase() : null;
  const guessed = MIME_BY_EXTENSION[extensionOf(asset.fileName ?? asset.uri) ?? ""];
  // JPEG last: it is what `quality` re-encodes to, and what a camera roll is
  // full of.
  const type = declared ?? guessed ?? "image/jpeg";

  const named = typeof asset.fileName === "string" ? asset.fileName.trim() : "";
  const name = named === "" ? `${FALLBACK_NAME}.${EXTENSION_BY_MIME[type] ?? "jpg"}` : named;

  return { uri: asset.uri, name, type };
}

function read(result: ImagePicker.ImagePickerResult): Pick {
  const asset = result.canceled ? undefined : result.assets[0];
  return asset === undefined ? { kind: "canceled" } : { kind: "picked", file: fileFrom(asset) };
}

/** The camera, once the system has said yes. */
export async function takePhoto(): Promise<Pick> {
  try {
    const permission = await ImagePicker.requestCameraPermissionsAsync();

    if (!permission.granted) {
      return { kind: "denied" };
    }

    return read(await ImagePicker.launchCameraAsync(OPTIONS));
  } catch {
    // A device with no camera, or a picker that could not be presented. Either
    // way the other button still works.
    return { kind: "unavailable" };
  }
}

/** The photo library. No permission request — see the module comment. */
export async function chooseFromLibrary(): Promise<Pick> {
  try {
    return read(await ImagePicker.launchImageLibraryAsync(OPTIONS));
  } catch {
    return { kind: "unavailable" };
  }
}
