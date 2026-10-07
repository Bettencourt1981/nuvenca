"use client";

import { useState, useTransition } from "react";
import { useLocale, useTranslations } from "next-intl";
import { MailCheck } from "lucide-react";
import { Link } from "@/i18n/navigation";
import { signUp } from "@/lib/actions/account";
import { useErrorMessage } from "@/hooks/use-error-message";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import { Divider, GoogleButton } from "./google-button";

export function SignupForm() {
  const t = useTranslations("auth");
  const locale = useLocale();
  const message = useErrorMessage();
  const [error, setError] = useState<string | null>(null);
  const [sentTo, setSentTo] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  if (sentTo) {
    return (
      <div className="text-center">
        <MailCheck className="mx-auto size-10 text-primary" aria-hidden />
        <h1 className="mt-4 text-xl font-semibold">{t("checkEmailTitle")}</h1>
        <p className="mt-2 text-sm text-muted">{t("checkEmailText", { email: sentTo })}</p>
      </div>
    );
  }

  return (
    <>
      <h1 className="mb-6 text-xl font-semibold">{t("signUpTitle")}</h1>
      <GoogleButton />
      <Divider />
      <form
        className="space-y-4"
        onSubmit={(event) => {
          event.preventDefault();
          const form = new FormData(event.currentTarget);
          const email = String(form.get("email"));
          setError(null);
          startTransition(async () => {
            const result = await signUp({
              email,
              password: String(form.get("password")),
              fullName: String(form.get("fullName")),
              locale,
            });
            if (!result) return;
            if (!result.ok) setError(message(result.error));
            else if (result.data.needsConfirmation) setSentTo(email);
          });
        }}
      >
        <div>
          <Label htmlFor="fullName">{t("fullName")}</Label>
          <Input id="fullName" name="fullName" autoComplete="name" required maxLength={120} />
        </div>
        <div>
          <Label htmlFor="email">{t("email")}</Label>
          <Input id="email" name="email" type="email" autoComplete="email" required />
        </div>
        <div>
          <Label htmlFor="password">{t("password")}</Label>
          <Input
            id="password"
            name="password"
            type="password"
            autoComplete="new-password"
            minLength={8}
            maxLength={72}
            required
            aria-describedby="password-hint"
          />
          <p id="password-hint" className="mt-1.5 text-xs text-muted">
            {t("passwordHint")}
          </p>
        </div>
        {error ? (
          <p role="alert" className="rounded-lg bg-danger-soft px-3 py-2 text-sm text-danger">
            {error}
          </p>
        ) : null}
        <Button type="submit" className="w-full" disabled={pending}>
          {pending ? <Spinner /> : null}
          {t("signUp")}
        </Button>
        <p className="text-center text-xs text-muted">{t("termsNotice")}</p>
      </form>
      <p className="mt-6 text-center text-sm text-muted">
        {t("haveAccount")}{" "}
        <Link href="/login" className="font-medium text-primary hover:underline">
          {t("signIn")}
        </Link>
      </p>
    </>
  );
}
