"use client";

import { useTransition } from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { useRouter } from "@/i18n/navigation";
import { joinViaLink } from "@/lib/actions/documents";
import { useErrorMessage } from "@/hooks/use-error-message";
import { Button } from "@/components/ui/button";

export function JoinLinkButton({ token, role }: { token: string; role: "commenter" | "editor" }) {
  const t = useTranslations("publicShare");
  const router = useRouter();
  const message = useErrorMessage();
  const [pending, startTransition] = useTransition();
  return (
    <Button
      disabled={pending}
      onClick={() =>
        startTransition(async () => {
          const result = await joinViaLink({ token });
          if (!result.ok) return void toast.error(message(result.error));
          router.push(result.data.href);
        })
      }
    >
      {role === "editor" ? t("openToEdit") : t("openToComment")}
    </Button>
  );
}
