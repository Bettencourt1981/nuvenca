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
  signed URLs   └─────────────────────────────────────────────────────────┘
  (upload/download straight to Storage)

  Stage 2 adds:  ONLYOFFICE Document Server (EU VPS or ONLYOFFICE cloud)
                 ⇄ Vercel (JWT-signed editor config, save callback) ⇄ Storage
```

- **The bytes never pass through Vercel.**
  - Uploads: the server checks permissions and quota, then hands the browser a signed upload URL,
    and the browser PUTs the file to Storage.
  - Downloads: the server redirects to a 60-second signed URL.
  - This avoids Vercel's 4.5 MB request limit and keeps hosting costs low.
- **The database is the security boundary.**
  - Row Level Security decides what each user can read.
  - All writes go through `SECURITY DEFINER` functions that check permissions explicitly.
  - Clients have no direct INSERT, UPDATE or DELETE on any table except their own stars.
  - The secret key is only used on the server, after a permission check: to sign storage URLs and
    to resolve public links.

## Data model (`supabase/migrations`)

| Table | Purpose |
| --- | --- |
| `profiles` | Name, email and language for each user. Created by a trigger on sign-up. |
| `workspaces` | A **personal** workspace per user ("My files"), plus **team** workspaces. Holds `plan_id` and `storage_used_bytes`. |
| `workspace_members` | Membership and role (`owner`, `admin`, `member`). Members can edit everything in the workspace. |
| `plans` | Limits per plan: storage quota, maximum file size, members, trash retention, feature flags and prices. |
| `subscriptions` | Payment-provider details per workspace (empty until billing launches). |
| `files` | Files and folders in one table. `ancestor_ids` stores the full path, so permission checks and moves are single indexed operations. |
| `file_versions` | Every stored object. Uploads create version 1; the editors will add new versions on save. Storage usage is the sum of ready versions. |
| `file_shares` | Grants by email with role `viewer`, `commenter` or `editor`. `user_id` is filled in once that email belongs to a confirmed account. |
| `share_links` | "Anyone with the link" access: one link per item, with a role and an on/off switch. |
| `file_stars` | Each user's starred items. |
| `drive_items` (view) | Files plus the caller's access level, whether they starred it, and the owner's name. Used by every list. |

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

## Roadmap

| Stage | Scope | Status |
| --- | --- | --- |
| 1 | Accounts, file manager, uploads, previews, sharing (people + links), team workspaces, quotas | **Done** |
| 2 | Document and spreadsheet editors: create and edit `.docx` and `.xlsx` (and `.pptx` at no extra cost), live co-editing, comments, version history, Word and Excel import/export | Next |
| 3 | Google Docs/Sheets import and export via the Google Picker (`drive.file` scope, so no restricted-scope security review), email notifications for shares, search inside documents | Planned |
| 4 | Billing (Stripe), admin console, audit log, offline viewing (PWA) | Planned |

### Editor engine decision (stage 2)

The requirements are: live co-editing, high-fidelity Word and Excel import/export, advanced
formulas, charts, filters, comments, version history and mobile. Three options were compared:

| Option | Fidelity and features | Effort | Cost and licensing notes |
| --- | --- | --- | --- |
| **ONLYOFFICE Docs** (recommended) | Native `.docx`/`.xlsx`/`.pptx`. Co-editing, comments, history, charts, pivots and 400+ formulas built in. | Weeks | **Community edition:** free, AGPLv3. Must keep ONLYOFFICE branding. No mobile web editing. **Developer edition:** white-label, mobile and scaling, priced by quote. A hosted "Docs Developer Cloud" also exists. Needs a server: about 4 GB RAM to start. |
| Collabora Online | Good (LibreOffice core). Rendering happens on the server. | Weeks | MPL. Commercial support is quote-based for SaaS. Heavier servers. |
| Build our own (Tiptap + Yjs for docs, Univer for sheets) | Lower Word/Excel fidelity. | Many months | Univer's co-editing, xlsx import/export and charts are paid "Pro" features. |

**ONLYOFFICE is the recommendation.**

- **How it fits the current design:** stage 1 already stores files as versions in Storage, so an
  edited document simply becomes the next `file_versions` row. The editor's save callback lands in
  a Vercel route handler.
- **For the beta:** start with the free Community edition on a small EU server.
- **Before a public launch:** move to the Developer edition, which adds white-label and mobile
  editing.
- Pricing and licence terms change. Confirm them with ONLYOFFICE before committing.
