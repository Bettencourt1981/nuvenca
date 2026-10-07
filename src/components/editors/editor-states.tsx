import { getTranslations } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { buttonClasses } from "@/components/ui/button";
import { Logo } from "@/components/logo";

export function EditorSkeleton() {
  return (
    <div className="flex h-dvh flex-col">
      <div className="h-[88px] shrink-0 border-b border-border bg-surface" />
      <div className="h-11 shrink-0 border-b border-border bg-surface" />
      <div className="flex-1 bg-surface-muted p-6">
        <div className="mx-auto h-full max-w-[816px] animate-pulse rounded bg-surface" />
      </div>
    </div>
  );
}

export async function EditorNotFound() {
  const t = await getTranslations("file");
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center gap-6 px-4 text-center">
      <Logo />
      <div>
        <h1 className="text-xl font-semibold">{t("notFound")}</h1>
        <p className="mt-2 text-muted">{t("notFoundHint")}</p>
      </div>
      <Link href="/drive" className={buttonClasses()}>
        {(await getTranslations("nav"))("myDrive")}
      </Link>
    </main>
  );
}
