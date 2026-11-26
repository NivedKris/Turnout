"use client";

import { useEffect, useState } from "react";

/** Dark is the default. Light is a full inversion, stored per browser. */
export function ThemeToggle() {
  const [theme, setTheme] = useState<"dark" | "light">("dark");
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- sync with the pre-hydration attribute
    setTheme(document.documentElement.dataset.theme === "light" ? "light" : "dark");
  }, []);
  const flip = () => {
    const next = theme === "dark" ? "light" : "dark";
    setTheme(next);
    document.documentElement.dataset.theme = next;
    try {
      localStorage.setItem("tn-theme", next);
    } catch {}
  };
  return (
    <button
      type="button"
      onClick={flip}
      className="border border-line px-2 py-1 font-mono text-[10px] uppercase tracking-widest text-fg-2 hover:text-fg"
      aria-label={`Switch to ${theme === "dark" ? "light" : "dark"} mode`}
    >
      {theme === "dark" ? "◑ Light" : "◐ Dark"}
    </button>
  );
}

/** Inline script that applies the stored theme before first paint (no flash). */
export const themeScript = `try{if(localStorage.getItem("tn-theme")==="light")document.documentElement.dataset.theme="light"}catch(e){}`;
