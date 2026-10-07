"use client";

import { useTransition } from "react";
import { useLocale, useTranslations } from "next-intl";
import { Globe } from "lucide-react";
import { usePathname, useRouter } from "@/i18n/navigation";
import { routing, type Locale } from "@/i18n/routing";
import { saveLanguage } from "@/lib/actions/account";
import { cn } from "@/lib/utils";

/** `persist`: also save the choice on the signed-in user's profile. */
export function LanguageSwitcher({ className, persist = false }: { className?: string; persist?: boolean }) {
  const t = useTranslations("common");
  const locale = useLocale();
  const router = useRouter();
  const pathname = usePathname();
  const [pending, startTransition] = useTransition();

  return (
    <label className={cn("inline-flex items-center gap-1.5 text-sm text-muted", className)}>
      <Globe className="size-4" aria-hidden />
      <span className="sr-only">{t("language")}</span>
      <select
        value={locale}
        disabled={pending}
        onChange={(event) => {
          const next = event.target.value as Locale;
          startTransition(async () => {
            if (persist) await saveLanguage({ locale: next });
            router.replace(pathname, { locale: next });
          });
        }}
        className="cursor-pointer bg-transparent py-1 text-sm text-foreground focus:outline-none"
      >
        {routing.locales.map((value) => (
          <option key={value} value={value}>
            {t(`languages.${value}`)}
          </option>
        ))}
      </select>
    </label>
  );
}
