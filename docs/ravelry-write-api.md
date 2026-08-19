# Ravelry write API — captured from official docs 2026-08-18 (login-gated)

## ✅ EMPIRICALLY VERIFIED 2026-08-19 (live test on real account, test project created+deleted)

- **Encoding: the Project(POST) object goes as the RAW JSON request body** (Content-Type: application/json). Wrapping it as `{"data": {...}}` silently creates an EMPTY project (200, all fields ignored) — do not use the JSON envelope.
- **`needle_sizes` = bare array of needle size ids** (e.g. `[6]` for 4.0mm). Verified attached via the create response.
- **Pack inheritance works exactly as documented**: `packs: [{"stash_id": 32232941}]` → response pack carried the stash's yarn name and colorway. Packs appear in the create/show response under `packs` with their own pack `id`.
- Create response: `{project: {id, name, status_name, started ("YYYY/MM/DD" format!), pattern_id, needle_sizes: [{id, metric, us,...}], packs: [...]}}`.
- Reference values: crafts — Crochet=1, Knitting=2, Machine Knitting=6, Loom Knitting=7. Statuses — In progress=1, Finished=2, Hibernating=3, Frogged=4. Needle sizes: 54 records `{id, metric (mm), us, hook}` from GET /needles/sizes.json (e.g. 4.0mm → id 6).
- DELETE /projects/{username}/{id}.json → 200, returns the deleted project.

Base: https://api.ravelry.com — Bearer auth. All "authenticated" endpoints.

## Create project

`POST /projects/{username}/create.json` — param `data` = **Project (POST)** (JSON body or `data=` key; JSON required for nested packs).

**Project (POST) fields** (all optional unless noted; Date = YYYY-MM-DD):
- `name` String (the project name — not marked nullable, treat as required)
- `pattern_id` Integer — link to Ravelry pattern ("a project might have a pattern name and no pattern ID if not linked")
- `personal_pattern_name` String — when not linked to a db pattern
- `craft_id` Integer — valid list from `POST /projects/crafts.json` → `{crafts: Craft[]}`
- `project_status_id` Integer — valid list from `POST /projects/project_statuses.json` → `{project_statuses: ProjectStatus[]}`
- `started` Date, `completed` Date
- `progress` Integer (0–100)
- `needle_sizes` Array — "List of needle size IDs. **We will replace any existing needles with the contents of this array.**" (NeedleSize POST schema shows `metric: Integer`; exact element shape — bare ids vs {id} vs {metric} — needs one empirical test. Needle size IDs come from `GET /needles/sizes.json`.)
- `packs` Array of Pack (POST) — **"Only allowed on project creation. For updating or deleting use the pack API methods."**
- `notes` String (public, markdown), `private_notes` String
- `made_for` String, `made_for_user_id` Integer, `size` String, `rating` Integer
- `tag_names` Array (tags cannot contain commas)
- gauge fields: `gauge`, `gauge_divisor`, `gauge_pattern`, `gauge_repeats`, `row_gauge`, `ends_per_inch`, `picks_per_inch`

## Pack (POST) — the yarn allocation

Key rule from projects/create + packs docs: **"If associated with a stash entry, you only need to (optionally) supply the `total_weight` and `total_length` attributes. The rest are inherited"** from the stash record.

Fields (all nullable): `stash_id` Integer (stash entry this pack draws from — THE field for our flow), `yarn_id` Integer (only needed when the pack is NOT stash-associated), `project_id`, `colorway`, `dye_lot`, `color_family_id`, `skeins` String, `skein_length`, `skein_weight`, `total_length` String, `total_weight` String, `length_units` ('yards'|'meters'), `weight_units` ('grams'|'ounces'), `total_paid`, `total_paid_currency` (3-char), `shop_id`, `purchased_date` Date, personal_* fallback fields (personal_name, personal_yarn_weight_id via /yarn_weights.json, personal_gauge_* etc.).

Pack lifecycle after creation: `POST /packs/create.json` (data=Pack POST), `PUT /packs/{pack_id}.json` update, `DELETE /packs/{pack_id}.json`, `GET /packs/{pack_id}.json`.

## Other project ops

- `POST /projects/{username}/{id}.json` — update (data = Project POST; packs NOT allowed here)
- `DELETE /projects/{username}/{id}.json` — permanent delete, returns deleted Project (test cleanup)
- `GET /projects/{username}/{id}.json?include=comments` — show (full detail incl. notes; note list.json does NOT include notes)
- `POST /projects/{username}/{id}/create_photo.json` — image_id (from /upload/image.json) or source_url → {status_token}; monitor via /photos/status.json; any size accepted, stores ≤1600px + thumbnails
- `POST /projects/{username}/{id}/reorder_photos.json` — sort_order = space-delimited photo IDs (first = primary)
- `GET /projects/search.json` — full project search w/ on-site filter params (e.g. tag-list=red|blue for OR, "red blue" for AND); include=notes|packs; personal_attributes

## Queue (for later)

- `POST /people/{username}/queue/create.json` data = QueuedProject (POST); minimal entry = {pattern_id, sort_order}
- `POST /people/{username}/queue/{id}/update.json`, `DELETE /people/{username}/queue/{queued_project_id}.json`
- `POST /people/{username}/queue/{id}/reposition.json` insert_at (1-based)
- `GET /people/{username}/queue/order.json` — all names/ids/positions (tiny)
- queue/list accepts pattern_id filter, query, query_type=patterns|tags

## Stash create (captured 2026-08-19)

`POST /people/{username}/stash/create.json` — data = **Stash (POST)** (expect raw-JSON-body encoding like projects/create; verify once).
Fields: `yarn_id` Integer (link to db yarn — find via /yarns/search.json), `pack` **Pack (POST) nested** (colorway, dye_lot, skeins, personal_name, personal_yarn_weight_id etc. — the yarn identity fallback when no yarn_id), `stash_status_id` Integer (1=active, 2=used up, 3=will trade/sell, 4=gone/sold, 5=in progress/handspun-only), `handspun` Boolean, `location` String, `notes`, `dye_lot` String, `tag_list` String (space-delimited).
Docs example: `{"yarn_id": 1, "dye_lot": 42}`. Also: stash/update, stash/delete, stash/create_photo (image_id or source_url) exist.

**✅ VERIFIED 2026-08-19 (live create+delete):** raw JSON body encoding (same as projects/create). `{yarn_id, stash_status_id: 1, notes, pack: {colorway, dye_lot}}` → 200, response `{stash: {id, yarn: {name...}, colorway_name, stash_status: {name: "In stash"}, packs: [{colorway...}]}}`. `DELETE /people/{username}/stash/{id}.json` → 200.
**yarns/search.json** result shape: `{id, name, permalink, yarn_weight: {name...}, first_photo, grams, discontinued, rating_average, machine_washable, min/max_gauge, gauge_divisor, personal_attributes}` — yarn company name via `yarn_company_name` or nested `yarn_company.name`.
NOTE: needle inventory has NO create endpoint (needles: list/sizes/types only) — needle "add" can only widen project selection to all 54 sizes, never write the user's inventory.

## Library / offline PDFs (captured 2026-08-19)

- `GET /people/{username}/library/search.json` — query, `type` (book|magazine|booklet|pattern|pdf), sort (title|added|published|author), page/page_size (default 100) → `{volumes: Volume[], paginator}`. PDF-type results only appear when searching YOUR OWN library.
- **Volume (full)**: `id`, `pattern_id`, `pattern_source_id`, `title`, `author_name`, `has_downloads`, `volume_attachments: VolumeAttachment[]` (the PDFs), `unapplied_updates`, cover/image urls, `notes`.
- **VolumeAttachment**: `product_attachment_id` (**use with generate_download_link**), `filename`, `bytes`, `content_type` (only "application/pdf"), `language_code`, `thumbnail_url`, `ravelry_download_url` (browser-session URL — not for API use).
- `POST /product_attachments/{id}/generate_download_link.json` → `{download_link}` (expiring direct URL). Requires **library-pdf** permission; OAuth tokens carrying library-pdf expire much faster (docs advise a second token; personal keys unaffected).
- `POST /volumes/create.json` data = `{pattern_id}` or `{pattern_source_id}` (one required) → adds to library. **Free Ravelry-download patterns get their PDFs attached automatically.** Docs etiquette: library = things the user owns; adding non-free patterns without purchase should be rare. `DELETE /volumes/{id}.json` removes. `POST /volumes/{id}/apply_updates.json` applies publisher updates.

**✅ FULL CHAIN VERIFIED 2026-08-19 with a real OAuth token (scope `offline library-pdf`):** volumes/create (raw JSON body, Bearer) → volume_attachments populate ASYNC (~2-6s; poll GET /volumes/{id}.json) → generate_download_link 200 → `{download_link: {activated_at, expires_at, url}}` → URL served application/pdf with `%PDF-` magic. Cleanup delete 200. **CRITICAL: generate_download_link 403s with a Basic-Auth personal key** ("Not authorized to generate download links") — personal keys do NOT carry library-pdf; only OAuth tokens that requested the scope work. The app's tokens request it at login (broker default scope), so on-device this works.

## Image upload (captured 2026-08-19)

1. `POST /upload/request_token.json` (authenticated) → `{upload_token}` — SINGLE USE.
2. `POST /upload/image.json` — **NOT authenticated** (no OAuth header): multipart/form-data with `upload_token` + `file0`…`file9` (PNG/JPEG/HEIF-HEIC; whole POST ≤ 50MB) → returns immediately: `{uploads: [{file0: {image_id}}, ...]}`.
3. `image_id` → `POST /projects/{username}/{id}/create_photo.json` → `{status_token}`; poll `/photos/status.json`; or `GET /upload/image/status.json?upload_token=` for upload results out-of-band.
Finish a project: `POST /projects/{username}/{id}.json` data `{project_status_id: 2, completed: "YYYY-MM-DD"}` (raw JSON body).

## Reference lookups (cache-friendly)

- `GET /needles/sizes.json` — NeedleSize records {id, metric (mm), us, hook, name, pretty_metric}
- `POST /projects/crafts.json` — crafts (knitting, crochet, …)
- `POST /projects/project_statuses.json` — status ids ("In progress", "Finished", "Hibernating", "Frogged", …)
- `GET /yarn_weights.json` — yarn weight ids
