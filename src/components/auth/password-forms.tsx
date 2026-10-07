"use client";

import { useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { CheckCircle2 } from "lucide-react";
import { Link, useRouter } from "@/i18n/navigation";
import { requestPasswordReset, updatePassword } from "@/lib/actions/account";
import { useErrorMessage } from "@/hooks/use-error-message";
import { Button, buttonClasses } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";

function ErrorText({ children }: { children: string | null }) {
  return children ? (
    <p role="alert" className="rounded-lg bg-danger-soft px-3 py-2 text-sm text-danger">
      {children}
    </p>
  ) : null;
}

export function ForgotPasswordForm() {
  const t = useTranslations("auth");
  const message = useErrorMessage();
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);
  const [pending, startTransition] = useTransition();

  return (
    <>
      <h1 className="text-xl font-semibold">{t("forgotTitle")}</h1>
      <p className="mb-6 mt-2 text-sm text-muted">{t("forgotHelp")}</p>
      {sent ? (
        <p className="flex items-start gap-2 rounded-lg bg-primary-soft px-3 py-2 text-sm text-foreground">
          <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden />
          {t("resetSent")}
        </p>
      ) : (
        <form
          className="space-y-4"
          onSubmit={(event) => {
            event.preventDefault();
            const form = new FormData(event.currentTarget);
            setError(null);
            startTransition(async () => {
              const result = await requestPasswordReset({ email: String(form.get("email")) });
              if (result.ok) setSent(true);
              else setError(message(result.error));
            });
          }}
        >
          <div>
            <Label htmlFor="email">{t("email")}</Label>
            <Input id="email" name="email" type="email" autoComplete="email" required />
          </div>
          <ErrorText>{error}</ErrorText>
          <Button type="submit" className="w-full" disabled={pending}>
            {pending ? <Spinner /> : null}
            {t("sendResetLink")}
          </Button>
        </form>
      )}
      <p className="mt-6 text-center text-sm">
        <Link href="/login" className="font-medium text-primary hover:underline">
          {t("backToSignIn")}
        </Link>
      </p>
    </>
  );
}

export function ResetPasswordForm() {
  const t = useTranslations("auth");
  const message = useErrorMessage();
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [pending, startTransition] = useTransition();

  if (done) {
    return (
      <div className="text-center">
        <CheckCircle2 className="mx-auto size-10 text-success" aria-hidden />
        <p className="mt-4 font-medium">{t("passwordUpdated")}</p>
        <Link href="/drive" className={buttonClasses({ className: "mt-6 w-full" })}>
          {t("signIn")}
        </Link>
      </div>
    );
  }

  return (
    <>
      <h1 className="mb-6 text-xl font-semibold">{t("newPasswordTitle")}</h1>
      <form
        className="space-y-4"
        onSubmit={(event) => {
          event.preventDefault();
          const form = new FormData(event.currentTarget);
          setError(null);
          startTransition(async () => {
            const result = await updatePassword({ password: String(form.get("password")) });
            if (result.ok) {
              setDone(true);
              router.refresh();
            } else if (result.error === "not_authenticated") {
              router.push("/login?error=link");
            } else {
              setError(message(result.error));
            }
          });
        }}
      >
        <div>
          <Label htmlFor="password">{t("newPassword")}</Label>
          <Input
            id="password"
            name="password"
            type="password"
            autoComplete="new-password"
            minLength={8}
            maxLength={72}
            required
          />
          <p className="mt-1.5 text-xs text-muted">{t("passwordHint")}</p>
        </div>
        <ErrorText>{error}</ErrorText>
        <Button type="submit" className="w-full" disabled={pending}>
          {pending ? <Spinner /> : null}
          {t("updatePassword")}
        </Button>
      </form>
    </>
  );
}
