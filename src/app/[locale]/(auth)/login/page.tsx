import { Suspense } from "react";
import type { Metadata } from "next";
import { useTranslations } from "next-intl";
import { getTranslations } from "next-intl/server";
import { LoginForm } from "@/components/auth/login-form";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("auth");
  return { title: t("signIn") };
}

export default function LoginPage() {
  const t = useTranslations("auth");
  return (
    <>
      <h1 className="mb-6 text-xl font-semibold">{t("signInTitle")}</h1>
      <Suspense>
        <LoginForm />
      </Suspense>
    </>
  );
}
