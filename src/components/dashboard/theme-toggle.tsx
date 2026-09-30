"use client";

import * as React from "react";
import { Sun, Moon } from "lucide-react";
import { Button } from "@/components/ui/button";

export function ThemeToggle() {
  const [theme, setTheme] = React.useState<"dark" | "light">("dark");

  React.useEffect(() => {
    try {
      const stored = localStorage.getItem("gfa-theme");
      if (stored === "light" || stored === "dark") {
        setTheme(stored);
        document.documentElement.setAttribute("data-theme", stored);
      }
    } catch {
      /* localStorage may be unavailable */
    }
  }, []);

  function toggle() {
    const next = theme === "dark" ? "light" : "dark";
    setTheme(next);
    document.documentElement.setAttribute("data-theme", next);
    try {
      localStorage.setItem("gfa-theme", next);
    } catch {
      /* ignore */
    }
  }

  return (
    <Button variant="secondary" size="sm" onClick={toggle}>
      {theme === "dark" ? <Moon className="size-4" /> : <Sun className="size-4" />}
      {theme === "dark" ? "Dark" : "Light"}
    </Button>
  );
}
