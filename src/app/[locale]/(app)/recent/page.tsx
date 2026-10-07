import { Suspense } from "react";
import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { Clock } from "lucide-react";
import { listRecent } from "@/lib/data/drive";
import { ListSkeleton, ListView } from "@/components/drive/views";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("nav");
  return { title: t("recent") };
}

export default function RecentPage() {
  return (
    <Suspense fallback={<ListSkeleton />}>
      <Recent />
    </Suspense>
  );
}

async function Recent() {
  const [items, t, nav] = await Promise.all([listRecent(), getTranslations("drive"), getTranslations("nav")]);
  return (
    <ListView
      title={nav("recent")}
      items={items}
      mode="recent"
      empty={{ icon: <Clock className="size-12" />, title: t("emptyRecent") }}
    />
  );
}
