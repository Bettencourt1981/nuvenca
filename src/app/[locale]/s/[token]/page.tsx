import { Suspense } from "react";
import type { Metadata } from "next";
import { getFormatter, getLocale, getTranslations } from "next-intl/server";
import { ChevronRight, Download, FolderOpen, Link2Off } from "lucide-react";
import { Link } from "@/i18n/navigation";
import { listPublicFolder, resolveShare } from "@/lib/data/public-share";
import { getCurrentUser } from "@/lib/auth";
import { formatBytes } from "@/lib/utils";
import { Logo } from "@/components/logo";
import { buttonClasses } from "@/components/ui/button";
import { FileIcon } from "@/components/drive/file-icon";
import { FilePreview } from "@/components/drive/file-preview";

type Props = PageProps<"/[locale]/s/[token]">;

export async function generateMetadata({ params, searchParams }: Props): Promise<Metadata> {
  const [{ token }, query] = await Promise.all([params, searchParams]);
  const share = await resolveShare(token, typeof query.item === "string" ? query.item : null);
  // Shared pages are private by nature: keep them out of search engines.
  return { title: share?.item.name, robots: { index: false, follow: false } };
}

export default function PublicSharePage({ params, searchParams }: Props) {
  return (
    <div className="flex min-h-dvh flex-col">
      <Suspense fallback={<div className="h-16 border-b border-border bg-surface" />}>
        <Header />
      </Suspense>
      <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-6 sm:px-6">
        <Suspense fallback={<div className="h-64 animate-pulse rounded-2xl bg-surface-muted" />}>
          <SharedContent params={params} searchParams={searchParams} />
        </Suspense>
      </main>
    </div>
  );
}

async function Header() {
  const [user, t] = await Promise.all([getCurrentUser(), getTranslations("publicShare")]);
  return (
    <header className="flex h-16 items-center justify-between gap-4 border-b border-border bg-surface px-4 sm:px-6">
      <Link href="/">
        <Logo />
      </Link>
      <Link href={user ? "/drive" : "/login"} className={buttonClasses({ variant: "secondary", size: "sm" })}>
        {user ? t("openInDrive") : t("signInForMore")}
      </Link>
    </header>
  );
}

async function SharedContent({ params, searchParams }: Pick<Props, "params" | "searchParams">) {
  const [{ token }, query] = await Promise.all([params, searchParams]);
  const itemId = typeof query.item === "string" ? query.item : null;
  const [share, t, actions, format, locale] = await Promise.all([
    resolveShare(token, itemId),
    getTranslations("publicShare"),
    getTranslations("drive.actions"),
    getFormatter(),
    getLocale(),
  ]);

  if (!share) {
    return (
      <div className="flex flex-col items-center py-24 text-center">
        <Link2Off className="size-12 text-muted" aria-hidden />
        <h1 className="mt-4 text-xl font-semibold">{t("invalidTitle")}</h1>
        <p className="mt-2 max-w-md text-muted">{t("invalidText")}</p>
      </div>
    );
  }

  const base = `/s/${token}`;
  const download = (id: string) => `/api/s/${token}/download?file=${id}`;
  const { item } = share;

  const breadcrumbs = share.root.kind === "folder" && share.item.id !== share.root.id ? (
    <nav aria-label="Breadcrumb" className="mb-2">
      <ol className="flex flex-wrap items-center gap-1 text-sm">
        {share.trail.map((crumb, index) => (
          <li key={crumb.id} className="flex items-center gap-1">
            {index > 0 ? <ChevronRight className="size-4 text-muted" aria-hidden /> : null}
            {crumb.id === item.id ? (
              <span className="px-1 font-medium">{crumb.name}</span>
            ) : (
              <Link href={crumb.id === share.root.id ? base : `${base}?item=${crumb.id}`} className="px-1 text-muted hover:underline">
                {crumb.name}
              </Link>
            )}
          </li>
        ))}
      </ol>
    </nav>
  ) : null;

  if (item.kind === "file") {
    return (
      <div>
        {breadcrumbs}
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <div className="flex min-w-0 items-center gap-2">
            <FileIcon kind="file" name={item.name} mimeType={item.mimeType} className="size-6" />
            <h1 className="truncate text-xl font-medium">{item.name}</h1>
            <span className="text-sm text-muted">{formatBytes(item.sizeBytes, locale)}</span>
          </div>
          <a href={download(item.id)} className={buttonClasses()}>
            <Download className="size-4" />
            {actions("download")}
          </a>
        </div>
        <FilePreview
          name={item.name}
          mimeType={item.mimeType}
          sizeBytes={item.sizeBytes}
          src={`${download(item.id)}&inline=1`}
          downloadHref={download(item.id)}
        />
        <p className="mt-6 text-center text-xs text-muted">{t("sharedBy")}</p>
      </div>
    );
  }

  const children = await listPublicFolder(item.id);
  return (
    <div>
      {breadcrumbs}
      <h1 className="mb-4 flex items-center gap-2 text-xl font-medium">
        <FileIcon kind="folder" name={item.name} mimeType={null} className="size-6" />
        {item.name}
      </h1>
      {children.length === 0 ? (
        <div className="flex flex-col items-center py-20 text-muted">
          <FolderOpen className="size-12" aria-hidden />
        </div>
      ) : (
        <ul className="divide-y divide-border rounded-2xl border border-border bg-surface">
          {children.map((child) => (
            <li key={child.id} className="flex items-center gap-3 px-4 py-3">
              <FileIcon kind={child.kind} name={child.name} mimeType={child.mimeType} />
              <Link href={`${base}?item=${child.id}`} className="min-w-0 flex-1 truncate text-sm hover:underline">
                {child.name}
              </Link>
              <span className="hidden text-sm text-muted sm:block">
                {format.dateTime(new Date(child.updatedAt), { dateStyle: "medium" })}
              </span>
              <span className="hidden w-20 text-right text-sm text-muted sm:block">
                {child.kind === "file" ? formatBytes(child.sizeBytes, locale) : "—"}
              </span>
              {child.kind === "file" ? (
                <a
                  href={download(child.id)}
                  className="rounded-lg p-1.5 text-muted hover:bg-surface-hover"
                  aria-label={actions("download")}
                >
                  <Download className="size-4" />
                </a>
              ) : (
                <span className="w-7" />
              )}
            </li>
          ))}
        </ul>
      )}
      <p className="mt-6 text-center text-xs text-muted">{t("sharedBy")}</p>
    </div>
  );
}
