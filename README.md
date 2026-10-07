# Nuvenca

Cloud storage with sharing, plus documents and spreadsheets that several people can edit at once,
built on **Next.js (Vercel)** and **Supabase**. Interface in Portuguese (pt-PT) and English.

> **Status: beta, stages 1 and 2 of 4 done.** The file manager, sharing, team workspaces and the
> document and spreadsheet editors are working. The editors are Nuvenca's own, built only on
> open-source libraries with permissive licences (MIT, ISC, BSD). There is no third-party editor
> server, licence or branding. See [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) for the design and
> roadmap.

## What works today

### Drive

- **Accounts:** sign-up and sign-in with email and password or Google, plus password reset.
- **Files:** upload files (drag and drop, with progress), create folders, rename, move, star, search,
  view recent files, and use a trash with restore. Trash empties itself after 30 days.
- **Previews and downloads:** images, PDF, video, audio and text files preview in the browser.
  Everything else can be downloaded.
- **Sharing:** share a file or folder with people by email as **viewer**, **commenter** or
  **editor**, including people who don't have an account yet. Folder access applies to
  everything inside.
- **Public links:** "Anyone with the link" access, which can be turned off at any time.
- **Team workspaces:** shared spaces for companies, with members, admins and their own storage.
- **Plans and quotas:** storage and file-size limits are enforced per workspace. The data model is
  ready for paid plans; there is no billing yet.

### Documents (Nuvenca Docs)

- **Live co-editing:** everyone's changes appear as they type, with each person's cursor and name.
- **Formatting:** headings, fonts and sizes, colours and highlight, lists and checklists, tables,
  images, links, alignment, quotes and code.
- **Comments:** comment on a selection, reply, and resolve threads.
- **Version history:** automatic versions every 10 minutes while editing, plus named versions. You
  can preview any version and restore it.
- **Word:** download as `.docx`. "Open with Nuvenca Docs" on an uploaded `.docx` creates an
  editable copy.

### Spreadsheets (Nuvenca Sheets)

- **Live co-editing** with everyone's selected cells shown.
- **Formulas:** about 400 functions (maths, statistics, text, date, lookup, logical, financial…),
  references to other sheets, and formulas that adjust when rows or columns are inserted.
- **Sheets:** multiple tabs that you can rename, duplicate, reorder and delete.
- **Formatting:** number, currency, percentage and date formats, fonts, colours, borders,
  alignment, wrapping and merged cells. Rows and columns can be frozen and resized.
- **Data:** sorting, filters, and charts (column, bar, line, area, pie, scatter).
- **Also:** comments on cells, version history, undo and redo, copy and paste (including from
  Excel and Google Sheets), and printing.
- **Excel and CSV:** download as `.xlsx` or `.csv`. "Open with Nuvenca Sheets" on an uploaded
  `.xlsx` or `.csv` creates an editable copy.
- Numbers are typed and shown in the user's language, for example `1,5` in Portuguese and `1.5`
  in English.

### Known limits of the beta

- **Word import:** keeps the structure (headings, lists, tables, bold, images) but not the exact
  page layout. Headers and footers, page size and columns are lost.
- **Excel export:** keeps values, formulas, formatting, merges and frozen panes, but charts are
  not exported yet.
- **Google Docs and Sheets:** download the file from Google as `.docx` or `.xlsx` and upload it.
  Direct import through the Google Picker is planned for stage 3.
- **Offline editing:** not supported yet. The editor shows when the connection is lost and
  catches up when it comes back.
- **Search:** finds file and folder names but does not look inside documents yet.
- **Sorting:** sorts the selected range. Comments attached to sorted cells stay where they were.

## Run it locally

Requirements:

- Node.js 20.9 or later
- Docker (used by the local Supabase stack)

```bash
npm install
npm run db:start                 # starts Supabase locally and prints the keys
cp .env.example .env.local       # fill in the publishable and secret keys printed above
npm run dev                      # http://localhost:3000
```

Locally, email confirmation is off, so you can sign up with any address. Emails such
as password resets are captured at http://127.0.0.1:54324.

### Useful scripts

| Command | What it does |
| --- | --- |
| `npm run check` | Translation key check, lint, TypeScript and unit tests |
| `npm test` | Unit tests for the spreadsheet engine (Vitest) |
| `npm run db:test` | Database permission tests (pgTAP) |
| `npm run db:reset` | Rebuild the local database from `supabase/migrations` |
| `npm run db:types` | Regenerate `src/lib/supabase/database.types.ts` after a schema change |

## Deploy (Vercel + Supabase)

### 1. Supabase

1. **Create a project** in the **Frankfurt (eu-central-1)** region. That keeps data in the EU and
   next to Vercel's `fra1` region. Use the **Pro plan** for production. It brings daily backups,
   no pausing when idle, and uploads larger than 50 MB.
2. **Apply the database schema** from your computer:
   ```bash
   npx supabase login
   npx supabase link --project-ref <your-project-ref>
   npx supabase db push
   ```
3. **Storage → Settings:** set the upload file size limit to at least **100 MB**. That is the beta
   plan's per-file limit.
4. **Realtime → Settings:** turn off **Allow public access**. The editors only use private
   channels, which check that each person has access to the file.
5. **Authentication → URL Configuration:**
   - Site URL: `https://<your-domain>`
   - Redirect URLs: `https://<your-domain>/**` and `https://*-<your-vercel-team>.vercel.app/**`
     (the second one covers preview deployments)
6. **Authentication → Emails → SMTP:** connect a real email provider, for example Resend, Brevo or
   Amazon SES (EU). Supabase's built-in sender is only meant for testing and is heavily
   rate-limited, so confirmation and reset emails would not reach beta users reliably.
7. **Google sign-in** (optional):
   1. In Google Cloud Console, create an OAuth client of type *Web application*.
   2. Add `https://<project-ref>.supabase.co/auth/v1/callback` as an authorised redirect URI.
   3. Paste the client ID and secret into **Authentication → Providers → Google**.

### 2. Vercel

1. Import the GitHub repository into Vercel. A **Pro** plan is needed for commercial use.
2. Add these environment variables. The Supabase integration on the Vercel Marketplace can fill in
   the first three for you.

   | Variable | Value |
   | --- | --- |
   | `NEXT_PUBLIC_SUPABASE_URL` | Project URL |
   | `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Publishable key (or the legacy `anon` key) |
   | `SUPABASE_SECRET_KEY` | Secret key (or the legacy `service_role` key). **Never expose it.** |
   | `NEXT_PUBLIC_SITE_URL` | `https://<your-domain>` |
   | `CRON_SECRET` | A long random string. Protects the daily cleanup job. |

3. Deploy. `vercel.json` already does two things:
   - pins server functions to Frankfurt (`fra1`);
   - schedules the daily cleanup of expired trash.

## Project structure

```
src/
  app/[locale]/        Pages (pt/en are resolved from a cookie; URLs have no locale prefix)
    (auth)/            Sign in, sign up, password reset
    (app)/             The signed-in app: drive, shared, recent, starred, trash, settings…
    s/[token]/         Public share links
    (editor)/          Full-screen editors: document/[fileId], spreadsheet/[fileId]
  app/api/             Auth callback, downloads (signed URLs, Word/Excel export), cleanup cron
  components/          UI (drive browser, dialogs, upload manager, settings)
    editors/           Document editor (Tiptap) and spreadsheet editor (grid, toolbar, charts)
  lib/actions/         Server Actions (all writes)
  lib/collab/          Real-time sync of Yjs documents over Supabase Realtime
  lib/editors/sheets/  Spreadsheet model, formula engine, Excel import/export
  lib/data/            Server-side reads
  messages/            Translations (en.json, pt.json; keys must match)
  proxy.ts             Session refresh, language detection, route protection
supabase/
  migrations/          Database schema, permissions and functions
  tests/               pgTAP tests for permissions, sharing and documents
```
