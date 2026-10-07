# Nuvenca

Cloud storage with sharing, plus documents and spreadsheets that several people can edit at once,
built on **Next.js (Vercel)** and **Supabase**. Interface in Portuguese (pt-PT) and English.

> **Status: beta, stages 1 to 4 done.** The file manager, sharing, team workspaces, the
> document and spreadsheet editors, search inside files, email and in-app notifications, Google
> Drive import/export, the activity log, Stripe billing, the admin console and offline editing are
> working. The editors are Nuvenca's own, built only on
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
- **Email notifications:** people get an email when something is shared with them (with an
  optional message), or when they're added to a team. It's in their language, and people without
  an account are invited to sign up. Changing someone's role doesn't email them again.
- **Search inside files:** search looks at names and at the text inside Nuvenca documents and
  spreadsheets, PDFs, Word, Excel, PowerPoint and text files. It ignores accents and matches the
  start of words ("orcam" finds "Orçamento"), shows the matching passage, and only finds files
  the person can open.
- **Team workspaces:** shared spaces for companies, with members, admins and their own storage.
- **Plans and quotas:** storage, file-size and member limits are enforced per workspace and come
  from the workspace's plan (see [Billing](#billing)).

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
- **Excel and CSV:** download as `.xlsx` or `.csv`, charts included. "Open with Nuvenca Sheets"
  on an uploaded `.xlsx` or `.csv` creates an editable copy, charts included.
- Numbers are typed and shown in the user's language, for example `1,5` in Portuguese and `1.5`
  in English.

### Google Drive

- **Import from Google Drive** (New menu) opens Google's file picker.
  - Google Docs and Sheets become Nuvenca documents and spreadsheets.
  - Other files (PDF, Office, images…) are copied as they are.
- **Save to Google Drive** (File menu of the editors) creates a Google Doc or Sheet from the file.
- Nuvenca only asks for access to the files the person picks or creates (`drive.file`). It never
  sees the rest of their Drive.
- Google's scripts load only when someone opens a menu with a Google Drive option. The Google
  token stays in the browser tab.

### Activity and notifications

- **Activity log:** uploads, edits to the file tree (create, rename, move, trash, restore,
  delete), downloads (including through public links), sharing and team changes, with who did
  what and when.
  - Team owners and admins see their team's log; everyone sees the log of their own drive
    (Settings → Activity).
  - Filters (files, downloads, sharing, team), search, and CSV export (up to 10,000 rows).
  - Kept 30 days on Free and 365 days on paid plans.
- **Notification bell:** live notifications when something is shared with you, when you're added
  to a team, and when someone comments on your file or replies in a thread you're in. Clicking
  one opens the file. Notifications are kept 90 days.

### Billing

- **Plans:** Free, Pro (personal drive) and Business (teams, charged per member). Limits and prices
  live in the database and are edited in the admin console. A plan is offered only once it is
  public and has a price.
- **Stripe Checkout** for upgrades (cards and the other methods enabled in Stripe, VAT number
  and billing address collected, promotion codes accepted), and the **Stripe customer portal**
  for invoices, payment details, plan changes and cancellation.
- Stripe's webhooks keep the plan in sync: renewals, failed payments, cancellations at the end of
  the period, and seat counts when team members are added or removed. Only the workspace owner
  can pay or manage billing.
- Billing stays hidden until the Stripe keys are set ([step 5](#5-billing-with-stripe-optional)).

### Admin console

People whose email is in `PLATFORM_ADMIN_EMAILS` get an **Admin** entry in the sidebar:

- **Overview:** users, active users, teams, files, storage, plans, subscriptions, and sign-ups
  over the last 30 days.
- **Workspaces** and **users:** search, storage use, and changing a workspace's plan by hand
  (recorded in its activity log).
- **Plans:** limits, prices and which plans are offered.

### Offline and mobile

- Nuvenca installs as an app on phones and computers (PWA).
- Documents and spreadsheets opened on a device are kept on it. They open and can be edited
  without a connection, and the edits are merged with everyone else's when the connection comes
  back. Pages you opened before open offline too.
- Signing out deletes the offline copies from the device.

### Known limits of the beta

- **Word import:** keeps the structure (headings, lists, tables, bold, images) but not the exact
  page layout. Headers and footers, page size and columns are lost.
- **Excel files:** values, formulas, formatting, merges, frozen panes and the common chart types
  (column, bar, line, area, pie, scatter) go both ways. Pivot tables, macros, conditional
  formatting, images in sheets, and charts that plot another sheet's data are not imported.
- **Google files:** Google Docs and Sheets go through Word/Excel, so the same limits apply.
  Google exports files up to 10 MB. Forms, Sites and Maps can't be imported.
- **Offline:** only documents and pages already opened on the device work offline. Uploads,
  sharing, search and the file list need a connection.
- **Search:** scanned PDFs (images of text) aren't searchable, because there's no OCR yet (see the
  roadmap in [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md)). Uploads
  larger than 25 MB are found by name only, and only the first 200,000 characters of a file are
  indexed.
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
as password resets are captured at http://127.0.0.1:54324. To see share notifications there too,
set `SMTP_HOST=127.0.0.1`, `SMTP_PORT=54325` and `EMAIL_FROM=Nuvenca <no-reply@localhost>` in
`.env.local`.

### Useful scripts

| Command | What it does |
| --- | --- |
| `npm run check` | Translation key check, lint, TypeScript and unit tests |
| `npm test` | Unit tests: spreadsheet engine, Excel charts, search text extraction, email templates (Vitest) |
| `npm run db:test` | Database tests (pgTAP): permissions, sharing, documents, search, notifications, activity, billing |
| `npm run db:reset` | Rebuild the local database from `supabase/migrations` |
| `npm run db:types` | Regenerate `src/lib/supabase/database.types.ts` after a schema change |

## Deploy (Vercel + Supabase)

### 1. Supabase

1. **Create a project** in an EU region, for example **Ireland (eu-west-1)** or **Frankfurt
   (eu-central-1)**. Use the **Pro plan** for production. It brings daily backups, no pausing
   when idle, uploads larger than 50 MB, and leaked-password protection. Run the Vercel functions
   in the same area: `vercel.json` uses `dub1` (Dublin), next to eu-west-1; change it to `fra1`
   for eu-central-1.
2. **Apply the database schema** from your computer:
   ```bash
   npx supabase login
   npx supabase link --project-ref <your-project-ref>
   npx supabase db push
   ```
3. **Storage → Settings:** set the upload file size limit to the largest per-file limit of your
   plans: **5 GB** with the default Business plan. Each plan's own limit is checked before
   every upload.
4. **Realtime → Settings:** turn off **Allow public access**. The editors only use private
   channels, which check that each person has access to the file.
5. **Authentication → URL Configuration:**
   - Site URL: `https://<your-domain>`
   - Redirect URLs: `https://<your-domain>/**` and `https://*-<your-vercel-team>.vercel.app/**`
     (the second one covers preview deployments)
6. **Authentication → Emails → SMTP:** connect a real email provider, for example Resend, Brevo or
   Amazon SES (EU). Supabase's built-in sender is only meant for testing and is heavily
   rate-limited (2 emails an hour), so confirmation and reset emails would not reach beta users
   reliably.
7. **Authentication → Emails → Templates:** for *Confirm sign up*, *Reset password* and *Change
   email address*, paste the files from `supabase/templates/` and the subjects from
   `supabase/config.toml`. The emails are in Portuguese, or in English for accounts created in
   English.
8. **Authentication → Sign In / Providers → Email:** minimum password length **8** (the app asks
   for 8), and turn on **leaked password protection** (Pro plan).
9. **Google sign-in** (optional):
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
   | `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASSWORD`, `EMAIL_FROM` | Optional: email notifications (step 3). |
   | `NEXT_PUBLIC_GOOGLE_CLIENT_ID`, `NEXT_PUBLIC_GOOGLE_API_KEY`, `NEXT_PUBLIC_GOOGLE_APP_ID` | Optional: Google Drive import and export (step 4). |
   | `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `STRIPE_AUTOMATIC_TAX` | Optional: billing (step 5). |
   | `PLATFORM_ADMIN_EMAILS` | Comma-separated emails of the people who run Nuvenca. They get the admin console at `/admin`. |

3. Deploy. `vercel.json` already does two things:
   - pins server functions to Dublin (`dub1`), next to the Supabase project (see step 1.1);
   - schedules the daily cleanup of expired trash.

### 3. Email notifications (optional)

Share and team emails are sent over SMTP, so any provider works (Resend, Brevo, Amazon SES (EU),
Mailgun, Postmark…). You can use the same provider as Supabase Auth.

1. Verify your sending domain with the provider (SPF and DKIM records), so emails aren't marked
   as spam.
2. Set `SMTP_HOST`, `SMTP_PORT` (587, or 465 for SSL), `SMTP_USER`, `SMTP_PASSWORD` and
   `EMAIL_FROM` (for example `Nuvenca <no-reply@your-domain.com>`) in Vercel.

Without these settings, sharing works the same and no emails are sent. Each person can send at
most 30 notification emails an hour and 100 a day, which stops the feature being used for spam.

### 4. Google Drive (optional)

1. In [Google Cloud Console](https://console.cloud.google.com/), use the project of your Google
   sign-in (or create one). Enable the **Google Drive API** and the **Google Picker API**.
2. **OAuth consent screen:** add the scope `https://www.googleapis.com/auth/drive.file`. It isn't a
   restricted scope, so Google's security assessment isn't needed. The app still needs Google's
   brand verification before it's public.
3. **Credentials:**
   - **OAuth client ID** (type *Web application*). Authorised JavaScript origins:
     `https://<your-domain>` (plus `http://localhost:3000` for development).
   - **API key**, restricted to the Google Picker API and to your domain (HTTP referrers).
4. In Vercel, set `NEXT_PUBLIC_GOOGLE_CLIENT_ID`, `NEXT_PUBLIC_GOOGLE_API_KEY` and
   `NEXT_PUBLIC_GOOGLE_APP_ID` (the project **number**, on the project dashboard), then redeploy.
   These values are public by design.

Without these settings, the Google Drive menu items are hidden.

### 5. Billing with Stripe (optional)

1. **Products and prices.** In Stripe, create a product per paid plan, with a recurring price per
   interval. Give each price a **lookup key**: `nuvenca_<plan>_<monthly|yearly>`, for example
   `nuvenca_pro_monthly`, `nuvenca_pro_yearly` and `nuvenca_business_monthly`. Business prices
   are per member (Nuvenca sets the quantity to the team's size).
2. **Webhook.** Add an endpoint `https://<your-domain>/api/billing/webhook` with these events:
   `checkout.session.completed`, `checkout.session.async_payment_succeeded`,
   `checkout.session.async_payment_failed`, `customer.subscription.created`,
   `customer.subscription.updated`, `customer.subscription.deleted`,
   `customer.subscription.paused`, `customer.subscription.resumed`, `invoice.paid` and
   `invoice.payment_failed`.
3. **Customer portal.** Turn it on in Stripe (Settings → Billing → Customer portal), and allow
   cancellations, payment method updates and invoice history.
4. **Payment methods and VAT.** Enable the payment methods you want in Stripe; Checkout only shows
   those that work for subscriptions. Checkout collects the billing address and VAT number (NIF).
   To have Stripe Tax calculate VAT, set it up in Stripe and set `STRIPE_AUTOMATIC_TAX=true`.
5. **Vercel.** Set `STRIPE_SECRET_KEY` and `STRIPE_WEBHOOK_SECRET` (the endpoint's signing
   secret), then redeploy.
6. **Offer the plans.** In the admin console (**Admin → Plans**), set each plan's prices (they're
   shown to customers, so match Stripe's) and tick **Offered**.

## Project structure

```
src/
  app/[locale]/        Pages (pt/en are resolved from a cookie; URLs have no locale prefix)
    (auth)/            Sign in, sign up, password reset
    (app)/             The signed-in app: drive, shared, recent, starred, trash, settings…
    s/[token]/         Public share links
    (editor)/          Full-screen editors: document/[fileId], spreadsheet/[fileId]
  app/api/             Auth callback, downloads, activity CSV, Stripe webhook, cleanup cron
  components/          UI (drive browser, dialogs, upload manager, settings, activity, admin)
    editors/           Document editor (Tiptap) and spreadsheet editor (grid, toolbar, charts)
    google/            "Import from Google Drive" and "Save to Google Drive"
  lib/actions/         Server Actions (all writes)
  lib/collab/          Real-time sync of Yjs documents over Supabase Realtime
  lib/editors/sheets/  Spreadsheet model, formula engine, Excel import/export (with charts)
  lib/email/           SMTP sending and the notification email templates (pt/en)
  lib/google/          Google Identity, Picker and Drive API calls (browser only)
  lib/billing/         Stripe client, subscription and seat sync
  lib/offline.ts       Service worker registration and clearing offline copies
  lib/data/            Server-side reads
  messages/            Translations (en.json, pt.json; keys must match)
  proxy.ts             Session refresh, language detection, route protection
supabase/
  migrations/          Database schema, permissions and functions
  templates/           Supabase Auth emails (pt/en)
  tests/               pgTAP tests for permissions, sharing, documents, search, notifications, activity and billing
public/
  sw.js, offline.html  Service worker and the offline page
```
