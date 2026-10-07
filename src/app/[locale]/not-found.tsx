import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { buttonClasses } from "@/components/ui/button";
import { Logo } from "@/components/logo";

export default function NotFound() {
  const t = useTranslations("errors");
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center gap-6 px-4 text-center">
      <Logo />
      <div>
        <h1 className="text-2xl font-semibold">{t("notFoundTitle")}</h1>
        <p className="mt-2 text-muted">{t("notFoundText")}</p>
      </div>
      <Link href="/" className={buttonClasses()}>
        {t("goHome")}
      </Link>
    </main>
  );
}
