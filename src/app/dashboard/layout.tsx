import { redirect } from "next/navigation";
import Image from "next/image";
import { auth } from "@/server/auth";
import { Sidebar } from "@/components/dashboard/sidebar";
import { SignOutButton } from "@/components/sign-in-button";

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await auth();
  if (!session?.user) redirect("/login");

  return (
    <div className="flex min-h-dvh">
      {/* Sidebar */}
      <aside className="sticky top-0 hidden h-dvh w-60 shrink-0 flex-col justify-between border-r border-[var(--color-border)] bg-[var(--color-surface)] p-3 md:flex">
        <Sidebar />
        <div className="flex items-center gap-3 rounded-[var(--radius)] border border-[var(--color-border)] p-2">
          {session.user.image && (
            <Image
              src={session.user.image}
              alt=""
              width={32}
              height={32}
              className="rounded-full"
            />
          )}
          <div className="min-w-0 flex-1">
            <p className="truncate text-xs font-medium text-[var(--color-fg)]">
              {session.user.login ?? session.user.name}
            </p>
            <SignOutButton className="h-auto p-0 text-[11px]" />
          </div>
        </div>
      </aside>

      {/* Main */}
      <div className="flex min-w-0 flex-1 flex-col">
        {/* Mobile top bar */}
        <div className="flex items-center justify-between border-b border-[var(--color-border)] bg-[var(--color-surface)] px-4 py-3 md:hidden">
          <span className="text-sm font-semibold">GitFlow Automator</span>
          <SignOutButton />
        </div>
        <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-6 sm:px-6 sm:py-8">
          {children}
        </main>
      </div>
    </div>
  );
}
