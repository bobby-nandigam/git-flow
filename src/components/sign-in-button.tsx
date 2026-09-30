"use client";

import { signIn, signOut } from "next-auth/react";
import { Button, type ButtonProps } from "@/components/ui/button";

function GitHubIcon() {
  return (
    <svg viewBox="0 0 24 24" className="size-4" fill="currentColor" aria-hidden>
      <path d="M12 .5A11.5 11.5 0 0 0 .5 12a11.5 11.5 0 0 0 7.86 10.92c.575.106.785-.25.785-.556 0-.274-.01-1-.015-1.965-3.196.695-3.87-1.54-3.87-1.54-.523-1.33-1.278-1.684-1.278-1.684-1.044-.714.08-.7.08-.7 1.154.082 1.762 1.185 1.762 1.185 1.026 1.758 2.693 1.25 3.35.955.104-.744.402-1.25.73-1.538-2.552-.29-5.236-1.276-5.236-5.68 0-1.255.448-2.28 1.183-3.085-.119-.29-.513-1.46.112-3.043 0 0 .965-.31 3.163 1.178a10.98 10.98 0 0 1 2.88-.388c.977.005 1.96.132 2.88.388 2.196-1.488 3.16-1.178 3.16-1.178.626 1.583.232 2.753.114 3.043.737.805 1.18 1.83 1.18 3.085 0 4.415-2.688 5.386-5.25 5.67.413.356.78 1.057.78 2.13 0 1.54-.014 2.78-.014 3.16 0 .308.207.667.79.554A11.5 11.5 0 0 0 23.5 12 11.5 11.5 0 0 0 12 .5Z" />
    </svg>
  );
}

export function SignInButton({
  callbackUrl = "/dashboard",
  ...props
}: { callbackUrl?: string } & ButtonProps) {
  return (
    <Button onClick={() => signIn("github", { callbackUrl })} {...props}>
      <GitHubIcon />
      Sign in with GitHub
    </Button>
  );
}

export function SignOutButton(props: ButtonProps) {
  return (
    <Button variant="ghost" size="sm" onClick={() => signOut({ callbackUrl: "/" })} {...props}>
      Sign out
    </Button>
  );
}
