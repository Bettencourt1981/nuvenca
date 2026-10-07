-- =============================================================================
-- Nuvenca — indexes for foreign keys followed on deletes
-- =============================================================================
--
-- Deleting a row makes Postgres look up every row that references it. Without
-- an index that is a full scan of the referencing table, once per deleted row.
-- These cover the deletes the app makes every day: old file versions (cleanup),
-- comments, files purged from the trash, and workspaces.
--
-- References to auth.users (created_by, actor_id…) stay unindexed on purpose:
-- accounts are rarely deleted, and those indexes would slow every insert.

create index files_current_version_idx on public.files (current_version_id) where current_version_id is not null;
create index document_comments_parent_idx on public.document_comments (parent_id) where parent_id is not null;
create index notifications_file_idx on public.notifications (file_id) where file_id is not null;
create index notifications_workspace_idx on public.notifications (workspace_id) where workspace_id is not null;
create index notification_emails_file_idx on public.notification_emails (file_id) where file_id is not null;
create index notification_emails_workspace_idx on public.notification_emails (workspace_id) where workspace_id is not null;
create index file_versions_workspace_idx on public.file_versions (workspace_id);
create index document_states_workspace_idx on public.document_states (workspace_id);
create index document_versions_workspace_idx on public.document_versions (workspace_id);
create index document_assets_workspace_idx on public.document_assets (workspace_id);
