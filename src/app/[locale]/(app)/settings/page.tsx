import { Suspense } from "react";
import type { Metadata } from "next";
import { getLocale, getTranslations } from "next-intl/server";
import { ChevronRight, UsersRound } from "lucide-react";
import { Link } from "@/i18n/navigation";
import { getProfile, getWorkspaces } from "@/lib/data/drive";
import { ListSkeleton, PageContainer, PageHeader } from "@/components/drive/views";
import { ProfileForm } from "@/components/settings/profile-form";
import { StorageCard } from "@/components/settings/storage-card";
import { Section } from "@/components/settings/section";
import type { Locale } from "@/i18n/routing";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("settings");
  return { title: t("title") };
}

export default function SettingsPage() {
  return (
    <Suspense fallback={<ListSkeleton />}>
      <Settings />
    </Suspense>
  );
}

async function Settings() {
  const [profile, workspaces, t, ws, locale] = await Promise.all([
    getProfile(),
    getWorkspaces(),
    getTranslations("settings"),
    getTranslations("workspace"),
    getLocale(),
  ]);
  const personal = workspaces.find((w) => w.kind === "personal")!;
  const teams = workspaces.filter((w) => w.kind === "team");

  return (
    <PageContainer>
      <PageHeader title={t("title")} />
      <div className="max-w-2xl space-y-6">
        <Section title={t("profile")}>
          <ProfileForm email={profile.email} fullName={profile.fullName} locale={locale as Locale} />
        </Section>
        <Section title={t("storage")}>
          <StorageCard workspace={personal} />
          <p className="mt-4 rounded-lg bg-primary-soft px-3 py-2 text-sm">{t("betaNotice")}</p>
        </Section>
        {teams.length > 0 ? (
          <Section title={t("workspaces")}>
            <ul className="-mx-2">
              {teams.map((team) => (
                <li key={team.id}>
                  <Link
                    href={`/workspaces/${team.id}/settings`}
                    className="flex items-center gap-3 rounded-lg px-2 py-2.5 hover:bg-surface-hover"
                  >
                    <UsersRound className="size-5 text-muted" aria-hidden />
                    <span className="min-w-0 flex-1 truncate">{team.name}</span>
                    <span className="text-sm text-muted">{ws(`roles.${team.role}`)}</span>
                    <ChevronRight className="size-4 text-muted" aria-hidden />
                  </Link>
                </li>
              ))}
            </ul>
          </Section>
        ) : null}
      </div>
    </PageContainer>
  );
}
