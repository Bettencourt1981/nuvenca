import { Suspense } from "react";
import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { Trash2 } from "lucide-react";
import { Link } from "@/i18n/navigation";
import { getWorkspaces, listTrash } from "@/lib/data/drive";
import { ListSkeleton, ListView, workspaceLabels } from "@/components/drive/views";
import { EmptyTrashButton } from "@/components/drive/empty-trash-button";
import { cn } from "@/lib/utils";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("nav");
  return { title: t("trash") };
}

export default function TrashPage({ searchParams }: PageProps<"/[locale]/trash">) {
  return (
    <Suspense fallback={<ListSkeleton />}>
      <Trash searchParams={searchParams} />
    </Suspense>
  );
}

async function Trash({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const { workspace: requested } = await searchParams;
  const [workspaces, t, nav] = await Promise.all([getWorkspaces(), getTranslations("drive"), getTranslations("nav")]);
  const workspace = workspaces.find((w) => w.id === requested) ?? workspaces.find((w) => w.kind === "personal")!;
  const [items, labels] = await Promise.all([listTrash(workspace.id), workspaceLabels(workspaces)]);

  return (
    <ListView
      title={nav("trash")}
      items={items}
      mode="trash"
      actions={<EmptyTrashButton workspaceId={workspace.id} disabled={items.length === 0} />}
      notice={
        <div className="mb-3 space-y-3">
          {workspaces.length > 1 ? (
            <div className="flex flex-wrap gap-2">
              {workspaces.map((w) => (
                <Link
                  key={w.id}
                  href={w.kind === "personal" ? "/trash" : `/trash?workspace=${w.id}`}
                  className={cn(
                    "rounded-full border px-3 py-1 text-sm",
                    w.id === workspace.id
                      ? "border-primary bg-primary-soft text-primary"
                      : "border-border text-muted hover:bg-surface-hover",
                  )}
                >
                  {labels[w.id]}
                </Link>
              ))}
            </div>
          ) : null}
          <p className="rounded-lg bg-surface-muted px-3 py-2 text-sm text-muted">
            {t("trashNotice", { days: workspace.trashRetentionDays })}
          </p>
        </div>
      }
      empty={{
        icon: <Trash2 className="size-12" />,
        title: t("emptyTrash"),
        hint: t("emptyTrashHint", { days: workspace.trashRetentionDays }),
      }}
    />
  );
}
