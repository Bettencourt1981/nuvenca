# Nuvenca

Cloud storage with sharing, and soon document and spreadsheet editing, built on
**Next.js (Vercel)** and **Supabase**. Interface in Portuguese (pt-PT) and English.

> **Status: beta, stage 1 of 4.** Stage 1 (accounts, file manager, sharing, team
> workspaces) is done. The document and spreadsheet editors come next. See
> [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) for the design and roadmap.

## What works today

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
| `npm run check` | Translation key check, lint and TypeScript |
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
4. **Authentication → URL Configuration:**
   - Site URL: `https://<your-domain>`
   - Redirect URLs: `https://<your-domain>/**` and `https://*-<your-vercel-team>.vercel.app/**`
     (the second one covers preview deployments)
5. **Authentication → Emails → SMTP:** connect a real email provider, for example Resend, Brevo or
   Amazon SES (EU). Supabase's built-in sender is only meant for testing and is heavily
   rate-limited, so confirmation and reset emails would not reach beta users reliably.
6. **Google sign-in** (optional):
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
  app/api/             Auth callback, downloads (signed URLs), cleanup cron
  components/          UI (drive browser, dialogs, upload manager, settings)
  lib/actions/         Server Actions (all writes)
  lib/data/            Server-side reads
  messages/            Translations (en.json, pt.json; keys must match)
  proxy.ts             Session refresh, language detection, route protection
supabase/
  migrations/          Database schema, permissions and functions
  tests/               pgTAP tests for permissions and sharing
```
