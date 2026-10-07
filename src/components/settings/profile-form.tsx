"use client";

import { useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { updateProfile } from "@/lib/actions/account";
import { useErrorMessage } from "@/hooks/use-error-message";
import { usePathname, useRouter } from "@/i18n/navigation";
import { routing, type Locale } from "@/i18n/routing";
import { Button } from "@/components/ui/button";
import { Input, Label, Select } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";

export function ProfileForm({ email, fullName, locale }: { email: string; fullName: string | null; locale: Locale }) {
  const t = useTranslations("settings");
  const common = useTranslations("common");
  const message = useErrorMessage();
  const router = useRouter();
  const pathname = usePathname();
  const [name, setName] = useState(fullName ?? "");
  const [language, setLanguage] = useState<Locale>(locale);
  const [pending, startTransition] = useTransition();

  return (
    <form
      className="space-y-4"
      onSubmit={(event) => {
        event.preventDefault();
        startTransition(async () => {
          const result = await updateProfile({ fullName: name, locale: language });
          if (!result.ok) return void toast.error(message(result.error));
          toast.success(t("profileSaved"));
          if (language !== locale) router.replace(pathname, { locale: language });
        });
      }}
    >
      <div>
        <Label htmlFor="settings-email">{t("email")}</Label>
        <Input id="settings-email" value={email} disabled readOnly />
      </div>
      <div>
        <Label htmlFor="settings-name">{t("fullName")}</Label>
        <Input id="settings-name" value={name} maxLength={120} onChange={(event) => setName(event.target.value)} />
      </div>
      <div>
        <Label htmlFor="settings-language">{t("language")}</Label>
        <Select
          id="settings-language"
          value={language}
          onChange={(event) => setLanguage(event.target.value as Locale)}
        >
          {routing.locales.map((value) => (
            <option key={value} value={value}>
              {common(`languages.${value}`)}
            </option>
          ))}
        </Select>
      </div>
      <Button type="submit" disabled={pending}>
        {pending ? <Spinner /> : null}
        {common("save")}
      </Button>
    </form>
  );
}
