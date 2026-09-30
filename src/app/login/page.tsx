import { redirect } from "next/navigation";
import { auth } from "@/server/auth";
import { Logo } from "@/components/brand";
import { SignInButton } from "@/components/sign-in-button";
import { Card, CardContent } from "@/components/ui/card";

export default async function LoginPage() {
  const session = await auth();
  if (session?.user) redirect("/dashboard");

  return (
    <div className="flex min-h-dvh items-center justify-center px-4">
      <Card className="w-full max-w-sm">
        <CardContent className="flex flex-col items-center gap-6 p-8 text-center">
          <Logo />
          <div>
            <h1 className="text-lg font-semibold text-[var(--color-fg)]">
              Welcome back
            </h1>
            <p className="mt-1 text-sm text-[var(--color-fg-muted)]">
              Sign in with GitHub to manage your automations.
            </p>
          </div>
          <SignInButton size="lg" className="w-full" />
          <p className="text-[11px] leading-relaxed text-[var(--color-fg-subtle)]">
            We request the minimum scopes needed to read your profile, manage
            repository webhooks, and label/comment on issues &amp; PRs.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
