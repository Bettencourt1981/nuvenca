# Nuvenca architecture

## Overview

```
                ┌──────────────────────────── Vercel (dub1) ────────────────────────────┐
 Browser ──────▶│ Next.js 16: pages, Server Actions, route handlers, proxy (auth + i18n)│
   │            └───────────────┬───────────────────────────────────────────────────────┘
   │                            │ user session (RLS) / secret key (server-side, after checks)
   │                            ▼
   │            ┌──────────────── Supabase (eu-west-1) ──────────────────┐
   └──────────▶ │ Auth · Postgres (RLS + functions) · Storage (private)  │
  signed URLs   │ Realtime (private channels: edits, cursors, the bell)  │
  + websocket   └─────────────────────────────────────────────────────────┘
   │
   └─ optional, straight from the browser: Google Picker + Drive API (drive.file scope)
      optional, from Vercel: any SMTP provider for notification emails
      optional, from Vercel: Stripe (Checkout, customer portal, signed webhooks)
```

Only Vercel and Supabase are required. The editors run in the browser and use no third-party
editor server, licence or branding. Google Drive, email and Stripe are optional add-ons that
switch on when their settings are present. Vercel's functions run in the region next to the
Supabase project (`dub1` for eu-west-1), because a page makes several database calls.

- **The bytes never pass through Vercel.**
  - Uploads: the server checks permissions and quota, then hands the browser a signed upload URL,
    and the browser PUTs the file to Storage.
  - Downloads: the server redirects to a 60-second signed URL.
  - This avoids Vercel's 4.5 MB request limit and keeps hosting costs low.
- **The database is the security boundary.**
  - Row Level Security decides what each user can read.
  - All writes go through `SECURITY DEFINER` functions that check permissions explicitly.
  - Clients have no direct INSERT, UPDATE or DELETE on any table except their own stars.
  - The secret key is only used on the server, after a permission check. It signs storage URLs,
    resolves public links (including reading a shared document's content), merges document
    edits (`compact_document` can only be run with the secret key), reads uploads to index their
    text, prunes the email, activity and notification logs, applies Stripe subscriptions, and
    serves the admin console (after checking the admin's email).

## Data model (`supabase/migrations`)

| Table | Purpose |
| --- | --- |
| `profiles` | Name, email and language for each user. Created by a trigger on sign-up. |
| `workspaces` | A **personal** workspace per user ("My files"), plus **team** workspaces. Holds `plan_id` and `storage_used_bytes`. |
| `workspace_members` | Membership and role (`owner`, `admin`, `member`). Members can edit everything in the workspace. |
| `plans` | Limits per plan: storage quota, maximum file size, members, trash retention, feature flags and prices. |
| `subscriptions` | Payment-provider details per workspace (empty until billing launches). |
| `files` | Files and folders in one table. `ancestor_ids` stores the full path, so permission checks and moves are single indexed operations. |
| `file_versions` | Every uploaded object. Uploads create version 1. Storage usage is the sum of ready versions. |
| `file_shares` | Grants by email with role `viewer`, `commenter` or `editor`. `user_id` is filled in once that email belongs to a confirmed account. |
| `share_links` | "Anyone with the link" access: one link per item, with a role and an on/off switch. |
| `file_stars` | Each user's starred items. |
| `drive_items` (view) | Files plus the caller's access level, whether they starred it, and the owner's name. Used by every list. |
| `document_states` | The merged content of a Nuvenca document or spreadsheet (a Yjs update). |
| `document_updates` | Edits appended by the editors since the last merge. They are merged into `document_states` once there are enough of them. |
| `document_versions` | Version history: automatic snapshots every 10 minutes of editing, plus named versions. |
| `file_contents` | Searchable text of each file, with a full-text index (see *Search*). |
| `notification_emails` | Log of share and team emails, for rate limiting. Not readable through the API; pruned after 90 days. |
| `document_comments` | Comment threads and replies, anchored to a text range or a cell. |
| `document_assets` | Images inserted into documents (stored in Storage, counted in the quota). |

### Access levels

Each user gets one access level per item:

| Level | Meaning |
| --- | --- |
| 0 | No access |
| 1 | Viewer |
| 2 | Commenter |
| 3 | Editor |
| 4 | Workspace member |

The level is the highest of two sources: workspace membership, and any share on the item or one of
its folders. Shares are inherited downwards. The pgTAP tests in `supabase/tests` cover isolation,
inheritance, invitations sent before sign-up, quotas, trash and team roles.

## Plans and billing (stage 4)

- Every workspace has a `plan_id`. Limits are read from `plans`, so changing a limit or adding a
  plan is a data change, not a code change. The admin console edits them.
- `plans.features` holds the rest: `for` (`personal` or `team`), `per_seat`,
  `version_history_days` and `audit_log_days`.
- Defaults: Free has 5 GB per workspace, 100 MB per file and 5 members per team. Pro and Business
  exist but aren't offered until they get a price and are marked public.
- **Checkout** (`startCheckout`): only the owner, only a public priced plan for this kind of
  workspace, and not when a subscription already exists. The Stripe price is found by lookup key
  (`nuvenca_<plan>_<interval>`), so prices can change in Stripe without a deploy. The Stripe
  customer is recorded in `billing_customers`, which no client can read. Per-seat plans start
  with the member count.
- **Webhooks** (`/api/billing/webhook`): the signature is verified, then the subscription is
  fetched again from Stripe (events can arrive late or out of order) and applied with
  `apply_subscription`. Active, trialing and past-due keep the paid plan; anything else returns
  the workspace to Free. A failure answers 500 so Stripe retries.
- **Seats:** adding or removing a team member updates the subscription quantity after the
  response, with proration.
- `subscriptions` can be read by owners and admins, but only the columns the UI needs (not the
  Stripe ids).

## Internationalisation

- `next-intl` runs with `localePrefix: "never"`, so URLs stay clean (`/drive`, not `/pt/drive`).
- The language is detected from the browser on the first visit, saved in a cookie, and can be
  changed in the user menu or in Settings.
- The translations are `src/messages/{en,pt}.json`. TypeScript checks the keys used in code, and
  `npm run check:i18n` keeps both files in sync.

## Editors (stage 2)

Nuvenca's documents and spreadsheets are its own, built on permissively licensed libraries:

| Part | Libraries (licence) |
| --- | --- |
| Real-time collaboration | Yjs, y-protocols (MIT), over Supabase Realtime |
| Document editor | Tiptap 3 and ProseMirror (MIT) |
| Word import and export | mammoth (BSD-2) in the browser, docx (MIT) on the server |
| Spreadsheet formulas | Nuvenca's own parser and evaluator, with formulajs (MIT) for the function library |
| Number formats | numfmt (MIT), the same format codes as Excel |
| Charts | Chart.js (MIT) |
| Excel import and export | ExcelJS (MIT) |

### How live editing works

- **Content model.** A native file is a row in `files` with the MIME type
  `application/vnd.nuvenca.document` or `application/vnd.nuvenca.spreadsheet`. Its content is a Yjs
  CRDT document. Concurrent edits from several people merge automatically, without a server
  deciding the order.
- **Opening a file.** The editor calls `load_document`. It returns the merged state plus the edits
  added since, but only if the caller has access.
- **Live edits.** Each change is broadcast on the private Realtime channel `file:<id>`, batched
  every 60 ms. Policies on `realtime.messages` only let people with access to the file join that
  channel, and only editors send edits. Cursors and names travel on the same channel.
- **Saving.** Editors also append their changes to `document_updates` through
  `append_document_update`. They save after 0.8 seconds of quiet, and at least every 4 seconds
  while typing. The header shows "Saving…" and then "All changes saved". After 50 updates, a server
  action merges them into `document_states`. The merge uses a revision check, so it is safe when
  several people edit at once.
- **Reconnecting.** On reconnect, the editor saves what is pending, reloads what others saved
  meanwhile, and asks the people who are online for anything else.
- **Permissions.** Viewers and commenters get a read-only editor. Commenters can still add comments.
  Public links open a read-only view rendered from the stored state.

### Spreadsheet model

- **Stable ids.** Rows and columns have stable ids, and cells are stored under `rowId:colId`.
  Inserting or deleting rows only changes the order lists, so it merges cleanly with what others
  are typing.
- **Formulas.** They are stored with references to those ids, so they follow inserted and deleted
  rows the way Excel does. They are shown in A1 notation.
- **Sorting.** Sorting moves cell contents within the range, like Excel and Google Sheets. Formulas
  that point at the range keep pointing at the same cells.
- **Evaluation.** Formulas are evaluated in the browser, memoised, with circular references
  detected. About 400 functions are available.
- **Excel export.** `.xlsx` files are written on the server (`/api/files/<id>/download`) from the
  stored state. Formulas keep their last computed result, so Excel shows values immediately.
- **Charts in Excel files.** ExcelJS reads and writes cells but not charts, so
  `xlsx-charts.ts` handles the DrawingML parts.
  - On export, it adds a drawing and chart XML for each chart, with cached values.
  - On import, it reads charts written by Excel, Google Sheets, LibreOffice or openpyxl, whatever
    their XML prefixes. Before ExcelJS loads the cells, it removes the drawing parts, which some
    files make ExcelJS fail on.

### Limits of the beta

| Area | Limit |
| --- | --- |
| Word import | Keeps structure (headings, lists, tables, bold and italic, images), not the exact page layout. |
| Excel files | Common chart types go both ways. Pivot tables, macros, conditional formatting, images in sheets, and charts that plot another sheet's data are not imported. |
| Google files | Docs and Sheets are converted through Word/Excel, so the same limits apply. Google's export limit is 10 MB. |
| Offline | Only documents and pages opened before on the device work offline. Uploads, sharing, search and the file list need a connection. |
| Search | No OCR for scanned PDFs. Uploads over 25 MB are found by name only. The first 200,000 characters of each file are indexed. |
| Size | Sheets go up to 100,000 rows and 702 columns (A to ZZ). Only the visible cells are drawn. Imports stop at 250,000 cells. |

## Search (stage 3)

- **What is indexed.** `file_contents` holds one row of plain text per file.
  - **Nuvenca documents and spreadsheets:** the editors write it about 4 seconds after an edit,
    through `set_file_content`. Each editor indexes only their own edits. Imported files are
    indexed when they are created.
  - **Uploads:** the server extracts text after the upload finishes (`after()` in
    `finishUpload`): plain text, HTML, Word (mammoth), Excel (ExcelJS), PowerPoint (slide XML)
    and PDF (unpdf). Files up to 25 MB are read.
- **Matching.** A Postgres text search configuration (`nuvenca_search`) uses the `unaccent`
  dictionary on top of `simple`. Portuguese and English behave the same, accents and case don't
  matter, and every word is matched as a prefix. Name matches use the same accent folding.
- **Who finds what.** `search_files` runs with the caller's rights (`SECURITY INVOKER`), so RLS on
  `files` decides. People only find what they can open, and nothing in the trash.
- **Results.** `ts_headline` provides the matching passage. Matches are marked with private-use
  characters and highlighted in React without HTML injection.

## Email notifications (stage 3)

- **What triggers an email.**
  - A new share (not a role change), unless "Notify people by email" is unticked.
  - Being added to a team.
- **How it's sent.** The server action asks the database for the email's details:
  `prepare_share_notification` or `prepare_member_notification`. That call checks the caller may
  share, that the share is new, and the rate limit (30 an hour and 100 a day per sender), and it
  logs the email. The email is then sent over SMTP after the response (`after()`), so sharing
  stays fast.
- **Language.** Emails are written in the recipient's profile language, or the sharer's language
  for people without an account. Choosing a language in the top bar saves it on the profile.
- **People without an account** get a sign-up link with their address filled in. The share is
  attached to their account when they confirm that email.
- **Safety.** Every user-provided value is HTML-escaped, subjects are kept on one line, and
  replies go to the person who shared.

## Google Drive (stage 3)

Everything happens in the browser with a short-lived token (`src/lib/google/drive.ts`). Nuvenca's
servers never see Google credentials.

1. **Access.** Google Identity Services asks for the `drive.file` scope. The app sees only files
   the person picks in the Google Picker or that Nuvenca creates. It isn't a restricted scope, so
   no security assessment is needed.
2. **Import.**
   - Google Docs and Sheets are exported as Word/Excel, converted in the browser
     (`importAsNativeFile`) and stored as native files: created empty, the content appended
     straight to Supabase, then merged. Large files never go through a Vercel function.
   - Other files are uploaded with the normal upload flow.
3. **Save to Google Drive.** The editor downloads its own Word/Excel export and uploads it to
   Drive (multipart) with a Google Docs/Sheets MIME type, so Google converts it.

## Activity log (stage 4)

- `audit_events` is filled by **triggers** on files, shares, share links, team members and
  workspaces, so every way of changing data is covered, including the server's own jobs. The
  actor is `auth.uid()`, or the admin recorded in the `nuvenca.actor_id` setting for changes made
  from the admin console. Names are copied into the event, so the log still reads well after a
  file or person is gone.
- Downloads are logged by the download routes after the response (`log_file_download`), with
  `via: link` for public links. Previews aren't logged.
- Trashing a folder logs one event, not one per item inside. Uploads are logged when they finish.
- RLS: team owners and admins read their team's events; everyone reads their own drive's.
- Retention follows the plan (`audit_log_days`); the daily cleanup job prunes older events.

## In-app notifications (stage 4)

- `notifications` rows are written by triggers: a new share (or an invite that becomes an account),
  being added to a team, and comments (to the file's owner and the people in the thread who can
  still open it). Nobody is notified of their own actions.
- The bell reads the latest 30 and listens on the private Realtime channel
  `notifications:<user id>` for new rows. Realtime checks the channel name against the signed-in
  user, and `postgres_changes` also applies the table's RLS (own rows only).
- Notifications are kept 90 days.

## Admin console (stage 4)

- `/admin` is for the emails in `PLATFORM_ADMIN_EMAILS`, checked against the verified email of
  the session. Everyone else gets "page not found".
- The data comes from `admin_*` functions that only the secret key can run. Changing a
  workspace's plan by hand records the admin in the workspace's activity log.

## Offline and PWA (stage 4)

- **Documents:** each editor keeps a copy of the Yjs document in IndexedDB
  (`nuvenca-doc:<user>:<file>`, via y-indexeddb). Without a connection the editor opens from it,
  and edits go on being stored locally.
- **Merging back:** on reconnect, the provider loads the server state and compares it with the
  local copy (`Y.snapshot`). What the server lacks is saved and broadcast. Yjs merges concurrent
  edits, so nobody's work is lost.
- **Pages:** `public/sw.js` caches the app's code (cache first) and the pages someone opens
  (network first). A page never opened shows `offline.html`. API calls and Supabase are never
  cached by the service worker.
- **Privacy:** the copies belong to the signed-in user. Signing out, or another person signing in
  on the device, deletes them.
- The web app manifest (`src/app/manifest.ts`) makes Nuvenca installable on phones and computers.

## Roadmap

| Stage | Scope | Status |
| --- | --- | --- |
| 1 | Accounts, file manager, uploads, previews, sharing (people + links), team workspaces, quotas | **Done** |
| 2 | Nuvenca Docs and Sheets: live co-editing, comments, version history, Word/Excel import and export | **Done** |
| 3 | Google Drive import and "Save to Google Drive", search inside files, email notifications, charts in Excel files | **Done** |
| 4 | Billing (Stripe), admin console, activity log, offline editing (PWA with local copies of documents), in-app notifications | **Done** |
| Next | OCR for scanned PDFs: needs a text-recognition service or a background worker, because a Vercel function or the browser is too slow for multi-page scans. Uploading and moving files while offline. | Planned |
