import { Suspense } from "react";
import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { getWorkspaces } from "@/lib/data/drive";
import { ListSkeleton } from "@/components/drive/views";
import { ActivityPage } from "@/components/activity/activity-page";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("activity");
  return { title: t("personalTitle") };
}

export default function PersonalActivityPage() {
  return (
    <Suspense fallback={<ListSkeleton />}>
      <PersonalActivity />
    </Suspense>
  );
}

async function PersonalActivity() {
  const [workspaces, t] = await Promise.all([getWorkspaces(), getTranslations("activity")]);
  const personal = workspaces.find((w) => w.kind === "personal")!;
  return <ActivityPage workspace={personal} title={t("personalTitle")} backHref="/settings" />;
}
