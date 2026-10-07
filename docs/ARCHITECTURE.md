# Nuvenca architecture

## Overview

```
                ┌──────────────────────────── Vercel (fra1) ────────────────────────────┐
 Browser ──────▶│ Next.js 16: pages, Server Actions, route handlers, proxy (auth + i18n)│
   │            └───────────────┬───────────────────────────────────────────────────────┘
   │                            │ user session (RLS) / secret key (signing URLs only)
   │                            ▼
   │            ┌──────────────── Supabase (eu-central-1) ───────────────┐
   └──────────▶ │ Auth · Postgres (RLS + functions) · Storage (private)  │
  signed URLs   │ Realtime (private channels: live edits, cursors)       │
  + websocket   └─────────────────────────────────────────────────────────┘
```

There are only two services: Vercel and Supabase. The editors run in the browser and use no
third-party editor server, licence or branding.

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
    resolves public links (including reading a shared document's content), and merges document
    edits (`compact_document` can only be run with the secret key).

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

## Plans and billing readiness

- Every workspace has a `plan_id`. Limits are read from `plans`, so changing a limit or adding a
  plan is a data change, not a code change.
- Beta defaults: 5 GB per workspace, 100 MB per file, 5 members per team, and 30 days in the trash.
- **Adding Stripe later:**
  1. Create Checkout and Portal sessions for a workspace.
  2. Handle Stripe webhooks in a route handler that upserts `subscriptions`.
  3. In the same handler, set `workspaces.plan_id`.

  Quota enforcement already reads the plan.

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

### Limits of the beta

| Area | Limit |
| --- | --- |
| Word import | Keeps structure (headings, lists, tables, bold and italic, images), not the exact page layout. |
| Excel export | Charts are not exported yet. |
| Google Docs and Sheets | Users download the file from Google as `.docx` or `.xlsx` and upload it. Direct import comes in stage 3. |
| Offline | Editing needs a connection. Short drops are handled: edits are kept and saved on reconnect. |
| Search | Only file and folder names are searched, not document contents. |
| Size | Sheets go up to 100,000 rows and 702 columns (A to ZZ). Only the visible cells are drawn. Imports stop at 250,000 cells. |

## Roadmap

| Stage | Scope | Status |
| --- | --- | --- |
| 1 | Accounts, file manager, uploads, previews, sharing (people + links), team workspaces, quotas | **Done** |
| 2 | Nuvenca Docs and Sheets: live co-editing, comments, version history, Word/Excel import and export | **Done** |
| 3 | Google Docs/Sheets import through the Google Picker (`drive.file` scope, so no restricted-scope security review), search inside documents, email notifications for shares, chart export to Excel | Planned |
| 4 | Billing (Stripe), admin console, audit log, offline editing (PWA with local storage of documents) | Planned |
