import { Suspense } from "react";
import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { Star } from "lucide-react";
import { listStarred } from "@/lib/data/drive";
import { ListSkeleton, ListView } from "@/components/drive/views";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("nav");
  return { title: t("starred") };
}

export default function StarredPage() {
  return (
    <Suspense fallback={<ListSkeleton />}>
      <Starred />
    </Suspense>
  );
}

async function Starred() {
  const [items, t, nav] = await Promise.all([listStarred(), getTranslations("drive"), getTranslations("nav")]);
  return (
    <ListView
      title={nav("starred")}
      items={items}
      mode="starred"
      empty={{ icon: <Star className="size-12" />, title: t("emptyStarred"), hint: t("emptyStarredHint") }}
    />
  );
}
