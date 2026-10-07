import { Suspense } from "react";
import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getFormatter, getLocale, getTranslations } from "next-intl/server";
import { ArrowLeft } from "lucide-react";
import { Link } from "@/i18n/navigation";
import { requireUser } from "@/lib/auth";
import { getAncestors, getItem, getWorkspaces } from "@/lib/data/drive";
import { ACCESS } from "@/lib/types";
import { formatBytes } from "@/lib/utils";
import { FileIcon } from "@/components/drive/file-icon";
import { FilePreview } from "@/components/drive/file-preview";
import { FileActions } from "@/components/drive/file-actions";
import { ListSkeleton, PageContainer, workspaceLabels } from "@/components/drive/views";
import { downloadHref } from "@/lib/links";

export async function generateMetadata({ params }: PageProps<"/[locale]/file/[fileId]">): Promise<Metadata> {
  const { fileId } = await params;
  const file = await getItem(fileId);
  return { title: file?.name };
}

export default function FilePage({ params }: PageProps<"/[locale]/file/[fileId]">) {
  return (
    <Suspense fallback={<ListSkeleton />}>
      <FileView params={params} />
    </Suspense>
  );
}

async function FileView({ params }: { params: Promise<{ fileId: string }> }) {
  const { fileId } = await params;
  const [user, file, t] = await Promise.all([requireUser(), getItem(fileId), getTranslations("file")]);

  if (!file || file.trashedAt) {
    return (
      <PageContainer>
        <div className="py-24 text-center">
          <h1 className="text-xl font-semibold">{t("notFound")}</h1>
          <p className="mt-2 text-muted">{t("notFoundHint")}</p>
        </div>
      </PageContainer>
    );
  }
  if (file.kind === "folder") redirect(`/drive/folders/${file.id}`);

  const [ancestors, workspaces, format, locale, nav] = await Promise.all([
    getAncestors(file),
    getWorkspaces(),
    getFormatter(),
    getLocale(),
    getTranslations("nav"),
  ]);
  const labels = await workspaceLabels(workspaces);
  const workspace = workspaces.find((w) => w.id === file.workspaceId);
  const parent = ancestors[ancestors.length - 1];
  const backHref = parent
    ? `/drive/folders/${parent.id}`
    : workspace
      ? workspace.kind === "personal"
        ? "/drive"
        : `/workspaces/${workspace.id}`
      : "/shared";
  const location = [workspace ? labels[workspace.id] : nav("sharedWithMe"), ...ancestors.map((a) => a.name)].join(" / ");
  const download = downloadHref(file.id);
  const owner = file.createdBy === user.id ? (await getTranslations("drive"))("ownerMe") : (file.ownerName ?? "—");

  const details: [string, string][] = [
    [t("type"), file.mimeType ?? "—"],
    [t("size"), formatBytes(file.sizeBytes, locale)],
    [t("location"), location],
    [t("owner"), owner],
    [t("modified"), format.dateTime(new Date(file.updatedAt), { dateStyle: "medium", timeStyle: "short" })],
    [t("created"), format.dateTime(new Date(file.createdAt), { dateStyle: "medium", timeStyle: "short" })],
  ];

  return (
    <PageContainer>
      <div className="flex flex-wrap items-center justify-between gap-3 py-3">
        <div className="flex min-w-0 items-center gap-2">
          <Link href={backHref} className="rounded-lg p-2 text-muted hover:bg-surface-hover" aria-label={nav("myDrive")}>
            <ArrowLeft className="size-5" />
          </Link>
          <FileIcon kind="file" name={file.name} mimeType={file.mimeType} className="size-6" />
          <h1 className="truncate text-xl font-medium" title={file.name}>
            {file.name}
          </h1>
        </div>
        <FileActions
          fileId={file.id}
          name={file.name}
          starred={file.starred}
          canShare={file.accessLevel >= ACCESS.editor}
          downloadHref={download}
        />
      </div>
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_18rem]">
        <FilePreview
          name={file.name}
          mimeType={file.mimeType}
          sizeBytes={file.sizeBytes}
          src={`${download}?inline=1`}
          downloadHref={download}
        />
        <aside className="h-fit rounded-xl border border-border bg-surface p-5">
          <h2 className="mb-4 font-semibold">{t("details")}</h2>
          <dl className="space-y-3 text-sm">
            {details.map(([label, value]) => (
              <div key={label}>
                <dt className="text-muted">{label}</dt>
                <dd className="break-words">{value}</dd>
              </div>
            ))}
          </dl>
        </aside>
      </div>
    </PageContainer>
  );
}
