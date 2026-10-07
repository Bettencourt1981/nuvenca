import { Suspense } from "react";
import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { SearchX } from "lucide-react";
import { searchItems } from "@/lib/data/drive";
import { ListSkeleton, ListView } from "@/components/drive/views";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("drive");
  return { title: t("searchTitle") };
}

export default function SearchPage({ searchParams }: PageProps<"/[locale]/search">) {
  return (
    <Suspense fallback={<ListSkeleton />}>
      <Results searchParams={searchParams} />
    </Suspense>
  );
}

async function Results({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const { q } = await searchParams;
  const query = (Array.isArray(q) ? q[0] : q)?.trim() ?? "";
  const [items, t] = await Promise.all([searchItems(query), getTranslations("drive")]);
  return (
    <ListView
      title={query ? t("searchResults", { query }) : t("searchTitle")}
      items={items}
      mode="search"
      empty={{ icon: <SearchX className="size-12" />, title: t("emptySearch", { query }) }}
    />
  );
}
