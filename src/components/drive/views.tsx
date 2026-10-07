import type { ReactNode } from "react";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { ChevronRight, FolderOpen, Settings, UploadCloud } from "lucide-react";
import { Link } from "@/i18n/navigation";
import { requireUser } from "@/lib/auth";
import { getAncestors, getItem, getWorkspaces, listFolder } from "@/lib/data/drive";
import { ACCESS, type FileItem, type WorkspaceSummary } from "@/lib/types";
import { FileBrowser, type BrowserMode } from "./file-browser";
import { FolderToolbar } from "./folder-toolbar";

export async function workspaceLabels(workspaces: WorkspaceSummary[]): Promise<Record<string, string>> {
  const t = await getTranslations("nav");
  return Object.fromEntries(workspaces.map((w) => [w.id, w.kind === "personal" ? t("myDrive") : w.name]));
}

export function PageHeader({ title, actions }: { title: ReactNode; actions?: ReactNode }) {
  return (
    <div className="flex min-h-16 flex-wrap items-center justify-between gap-3 py-3">
      {typeof title === "string" ? (
        <h1 className="min-w-0 flex-1 truncate text-xl font-medium">{title}</h1>
      ) : (
        <div className="min-w-0 flex-1 text-xl font-medium">{title}</div>
      )}
      {actions ? <div className="flex shrink-0 items-center gap-2">{actions}</div> : null}
    </div>
  );
}

export function PageContainer({ children }: { children: ReactNode }) {
  return <div className="mx-auto w-full max-w-7xl px-4 pb-24 sm:px-6">{children}</div>;
}

type Crumb = { label: string; href?: string };

function Breadcrumbs({ crumbs }: { crumbs: Crumb[] }) {
  return (
    <nav aria-label="Breadcrumb">
      <ol className="flex min-w-0 flex-wrap items-center gap-1">
        {crumbs.map((crumb, index) => {
          const last = index === crumbs.length - 1;
          return (
            <li key={`${crumb.label}-${index}`} className="flex min-w-0 items-center gap-1">
              {crumb.href && !last ? (
                <Link
                  href={crumb.href}
                  className="truncate rounded-lg px-2 py-1 text-muted hover:bg-surface-hover hover:text-foreground"
                >
                  {crumb.label}
                </Link>
              ) : (
                <h1 className="truncate px-2 py-1 text-xl font-medium" aria-current="page">
                  {crumb.label}
                </h1>
              )}
              {!last ? <ChevronRight className="size-4 shrink-0 text-muted" aria-hidden /> : null}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}

/** The root of a workspace, or one of its folders. */
export async function FolderView({ workspaceId, folderId }: { workspaceId?: string; folderId?: string }) {
  const [user, workspaces, t, nav, wsT] = await Promise.all([
    requireUser(),
    getWorkspaces(),
    getTranslations("drive"),
    getTranslations("nav"),
    getTranslations("workspace"),
  ]);
  const labels = await workspaceLabels(workspaces);

  let folder: FileItem | null = null;
  let workspace: WorkspaceSummary | null = null;

  if (folderId) {
    folder = await getItem(folderId);
    if (!folder || folder.kind !== "folder" || folder.trashedAt) notFound();
    workspace = workspaces.find((w) => w.id === folder!.workspaceId) ?? null;
  } else {
    workspace = workspaces.find((w) => w.id === workspaceId) ?? null;
    if (!workspace) notFound();
  }

  const targetWorkspaceId = folder?.workspaceId ?? workspace!.id;
  const [items, ancestors] = await Promise.all([
    listFolder(targetWorkspaceId, folder?.id ?? null),
    folder ? getAncestors(folder) : Promise.resolve([]),
  ]);

  const rootHref = workspace ? (workspace.kind === "personal" ? "/drive" : `/workspaces/${workspace.id}`) : "/shared";
  const crumbs: Crumb[] = [
    { label: workspace ? labels[workspace.id] : nav("sharedWithMe"), href: rootHref },
    ...ancestors.map((a) => ({ label: a.name, href: `/drive/folders/${a.id}` })),
    ...(folder ? [{ label: folder.name }] : []),
  ];

  const accessLevel = folder ? folder.accessLevel : ACCESS.manager;
  const canEdit = accessLevel >= ACCESS.editor;
  const target = { workspaceId: targetWorkspaceId, parentId: folder?.id ?? null, label: crumbs[crumbs.length - 1].label };
  const isRoot = !folder;

  return (
    <PageContainer>
      <PageHeader
        title={<Breadcrumbs crumbs={crumbs} />}
        actions={
          <>
            {isRoot && workspace?.kind === "team" ? (
              <Link
                href={`/workspaces/${workspace.id}/settings`}
                className="rounded-lg p-2 text-muted hover:bg-surface-hover hover:text-foreground"
                aria-label={wsT("settings")}
                title={wsT("settings")}
              >
                <Settings className="size-5" />
              </Link>
            ) : null}
            <FolderToolbar
              target={target}
              canEdit={canEdit}
              shareFolder={folder && canEdit ? { id: folder.id, name: folder.name } : null}
            />
          </>
        }
      />
      {!canEdit ? <p className="mb-3 rounded-lg bg-surface-muted px-3 py-2 text-sm text-muted">{t("readOnlyNotice")}</p> : null}
      <FileBrowser
        items={items}
        mode="folder"
        currentUserId={user.id}
        uploadTarget={canEdit ? target : null}
        workspaceLabels={labels}
        empty={{
          icon: isRoot ? <UploadCloud className="size-12" /> : <FolderOpen className="size-12" />,
          title: isRoot ? t("emptyRoot") : t("emptyFolder"),
          hint: canEdit ? (isRoot ? t("emptyRootHint") : t("emptyFolderHint")) : undefined,
        }}
      />
    </PageContainer>
  );
}

/** Flat lists: shared with me, recent, starred, search, trash. */
export async function ListView({
  title,
  items,
  mode,
  empty,
  actions,
  notice,
  snippets,
}: {
  title: ReactNode;
  items: FileItem[];
  /** File id → matching passage (search results). */
  snippets?: Record<string, string>;
  mode: BrowserMode;
  empty: { icon: ReactNode; title: string; hint?: string };
  actions?: ReactNode;
  notice?: ReactNode;
}) {
  const [user, workspaces] = await Promise.all([requireUser(), getWorkspaces()]);
  return (
    <PageContainer>
      <PageHeader title={title} actions={actions} />
      {notice}
      <FileBrowser
        items={items}
        snippets={snippets}
        mode={mode}
        currentUserId={user.id}
        workspaceLabels={await workspaceLabels(workspaces)}
        empty={empty}
      />
    </PageContainer>
  );
}

export function ListSkeleton() {
  return (
    <PageContainer>
      <div className="flex h-16 items-center">
        <div className="h-6 w-48 animate-pulse rounded-lg bg-surface-muted" />
      </div>
      <div className="space-y-px">
        {Array.from({ length: 8 }, (_, index) => (
          <div key={index} className="flex h-12 items-center gap-3 border-b border-border px-3">
            <div className="size-5 animate-pulse rounded bg-surface-muted" />
            <div className="h-4 animate-pulse rounded bg-surface-muted" style={{ width: `${30 + ((index * 17) % 40)}%` }} />
          </div>
        ))}
      </div>
    </PageContainer>
  );
}
