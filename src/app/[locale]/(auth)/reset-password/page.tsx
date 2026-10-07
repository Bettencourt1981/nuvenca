import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { ResetPasswordForm } from "@/components/auth/password-forms";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("auth");
  return { title: t("newPasswordTitle") };
}

// Reached from the password-reset email, which signs the user in first.
export default function ResetPasswordPage() {
  return <ResetPasswordForm />;
}
