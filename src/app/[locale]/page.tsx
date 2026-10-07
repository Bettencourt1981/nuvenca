import { useTranslations } from "next-intl";
import { Cloud, FileSpreadsheet, Share2 } from "lucide-react";
import { Link } from "@/i18n/navigation";
import { buttonClasses } from "@/components/ui/button";
import { Logo } from "@/components/logo";
import { LanguageSwitcher } from "@/components/language-switcher";

export default function LandingPage() {
  const t = useTranslations("landing");
  const common = useTranslations("common");

  const features = [
    { icon: Cloud, title: t("features.driveTitle"), text: t("features.driveText") },
    { icon: Share2, title: t("features.shareTitle"), text: t("features.shareText") },
    { icon: FileSpreadsheet, title: t("features.editorsTitle"), text: t("features.editorsText"), soon: true },
  ];

  return (
    <div className="flex min-h-dvh flex-col">
      <header className="mx-auto flex w-full max-w-6xl items-center justify-between gap-4 px-4 py-4 sm:px-6">
        <Logo />
        <div className="flex items-center gap-2 sm:gap-4">
          <LanguageSwitcher className="hidden sm:inline-flex" />
          <Link href="/login" className={buttonClasses({ variant: "ghost" })}>
            {t("signIn")}
          </Link>
        </div>
      </header>

      <main className="flex-1">
        <section className="mx-auto max-w-4xl px-4 pb-16 pt-12 text-center sm:px-6 sm:pt-20">
          <span className="inline-flex items-center rounded-full bg-primary-soft px-3 py-1 text-xs font-medium text-primary">
            {common("beta")}
          </span>
          <h1 className="mt-5 text-balance text-4xl font-semibold tracking-tight sm:text-5xl">{t("headline")}</h1>
          <p className="mx-auto mt-5 max-w-2xl text-pretty text-lg text-muted">{t("subheadline")}</p>
          <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
            <Link href="/signup" className={buttonClasses({ size: "lg" })}>
              {t("getStarted")}
            </Link>
            <Link href="/login" className={buttonClasses({ size: "lg", variant: "secondary" })}>
              {t("signIn")}
            </Link>
          </div>
        </section>

        <section className="mx-auto grid max-w-6xl gap-4 px-4 pb-20 sm:grid-cols-3 sm:px-6">
          {features.map(({ icon: Icon, title, text, soon }) => (
            <div key={title} className="rounded-2xl border border-border bg-surface p-6">
              <div className="flex size-10 items-center justify-center rounded-xl bg-primary-soft text-primary">
                <Icon className="size-5" aria-hidden />
              </div>
              <h2 className="mt-4 flex items-center gap-2 font-semibold">
                {title}
                {soon ? (
                  <span className="shrink-0 whitespace-nowrap rounded-full bg-surface-muted px-2 py-0.5 text-xs font-medium text-muted">
                    {t("comingSoon")}
                  </span>
                ) : null}
              </h2>
              <p className="mt-2 text-sm text-muted">{text}</p>
            </div>
          ))}
        </section>
      </main>

      <footer className="border-t border-border py-6">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 text-sm text-muted sm:px-6">
          <span>© Nuvenca</span>
          <LanguageSwitcher className="sm:hidden" />
        </div>
      </footer>
    </div>
  );
}
