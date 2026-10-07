import { Suspense } from "react";
import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { Users } from "lucide-react";
import { listSharedWithMe } from "@/lib/data/drive";
import { ListSkeleton, ListView } from "@/components/drive/views";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("nav");
  return { title: t("sharedWithMe") };
}

export default function SharedPage() {
  return (
    <Suspense fallback={<ListSkeleton />}>
      <Shared />
    </Suspense>
  );
}

async function Shared() {
  const [items, t, nav] = await Promise.all([listSharedWithMe(), getTranslations("drive"), getTranslations("nav")]);
  return (
    <ListView
      title={nav("sharedWithMe")}
      items={items}
      mode="shared"
      empty={{ icon: <Users className="size-12" />, title: t("emptyShared"), hint: t("emptySharedHint") }}
    />
  );
}
