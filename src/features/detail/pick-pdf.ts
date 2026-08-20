/**
 * Getting one pattern PDF off the phone itself.
 *
 * Most patterns are not Ravelry's to hand over — the file lives on the
 * designer's own site, or it was bought on a marketplace Ravelry has never
 * heard of — so the way in is the knitter's own Files app: they download it in
 * a browser, tap Import, and pick it. This is the whole of that first half.
 * `importPatternPdf` in `pdfs.ts` is the second, and it is what decides whether
 * the thing picked is really a PDF.
 *
 * Split out of the screen for the same reason `finish/photo.ts` is: the data
 * layer should not know which picker was used, and a screen should not hold a
 * try/catch around a native module. Nothing here throws and nothing here
 * alerts — every path out is one of three words, and backing out of the picker
 * is the commonest of them and says nothing at all.
 */

import * as DocumentPicker from "expo-document-picker";

import type { PickedPdf } from "@/data/pdfs";

export type PdfPick =
  | { readonly kind: "picked"; readonly file: PickedPdf }
  /** They backed out of the picker. Nothing to say about it. */
  | { readonly kind: "canceled" }
  /** The picker itself would not open. Rare, and nothing to be done in-app. */
  | { readonly kind: "unavailable" };

/**
 * PDFs only, and copied where we can read it.
 *
 * `copyToCacheDirectory` is the default and is written down anyway, because
 * everything after this depends on it: it is what turns a document-provider
 * URI into a file in this app's own cache, which is the only kind
 * `importPatternPdf` can open to check its first bytes and then copy. `type`
 * narrows the picker itself — a knitter looking for their pattern should not be
 * offered every photograph on the phone — and is not trusted afterwards, since
 * a provider is free to be wrong about it.
 */
const OPTIONS: DocumentPicker.DocumentPickerOptions = {
  type: "application/pdf",
  copyToCacheDirectory: true,
  multiple: false,
};

/** The system document picker. See the module comment for what it cannot do. */
export async function choosePdf(): Promise<PdfPick> {
  try {
    const result = await DocumentPicker.getDocumentAsync(OPTIONS);
    // `canceled` and an empty list are the same event as far as this screen is
    // concerned: no file came back, and nobody needs telling.
    const asset = result.canceled ? undefined : result.assets[0];

    return asset === undefined
      ? { kind: "canceled" }
      : {
          kind: "picked",
          file: {
            uri: asset.uri,
            name: asset.name,
            // Both are documented as possibly missing, and both are only ever
            // read as a fallback, so `null` rather than a guess.
            size: asset.size ?? null,
            mimeType: asset.mimeType ?? null,
          },
        };
  } catch {
    return { kind: "unavailable" };
  }
}
