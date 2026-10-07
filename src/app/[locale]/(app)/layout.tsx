import { Suspense } from "react";
import { getProfile, getWorkspaces } from "@/lib/data/drive";
import { TopBar } from "@/components/app/top-bar";
import { SidebarNav } from "@/components/app/sidebar-nav";
import { UploadProvider } from "@/components/drive/upload-provider";
import { LogoMark } from "@/components/logo";

export default function AppLayout({ children }: LayoutProps<"/[locale]">) {
  return (
    <UploadProvider>
      <div className="flex h-dvh flex-col">
        <Suspense fallback={<TopBarFallback />}>
          <AppTopBar />
        </Suspense>
        <div className="flex min-h-0 flex-1">
          <aside className="hidden w-64 shrink-0 lg:block">
            <Suspense fallback={null}>
              <AppSidebar />
            </Suspense>
          </aside>
          <main className="min-w-0 flex-1 overflow-y-auto">{children}</main>
        </div>
      </div>
    </UploadProvider>
  );
}

async function AppTopBar() {
  const [profile, workspaces] = await Promise.all([getProfile(), getWorkspaces()]);
  return <TopBar user={{ email: profile.email, fullName: profile.fullName }} workspaces={workspaces} />;
}

async function AppSidebar() {
  return <SidebarNav workspaces={await getWorkspaces()} />;
}

function TopBarFallback() {
  return (
    <header className="flex h-16 shrink-0 items-center gap-4 border-b border-border bg-surface px-4">
      <LogoMark />
      <div className="h-10 flex-1 animate-pulse rounded-full bg-surface-muted lg:max-w-2xl" />
    </header>
  );
}
