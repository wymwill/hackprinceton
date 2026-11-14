/**
 * Light or dark. The choice is kept in this browser; "system" follows the
 * device setting. index.html applies it before the page draws, so there's no
 * flash of the wrong theme; this module changes it afterwards.
 */
import { useEffect, useState } from "react";

export type ThemePref = "system" | "light" | "dark";

const KEY = "alea-theme";
const media = () => window.matchMedia("(prefers-color-scheme: light)");

export function themePref(): ThemePref {
  try {
    const v = localStorage.getItem(KEY);
    return v === "light" || v === "dark" ? v : "system";
  } catch {
    return "system";
  }
}

function apply(pref: ThemePref) {
  const theme = pref === "system" ? (media().matches ? "light" : "dark") : pref;
  document.documentElement.dataset.theme = theme;
  document.querySelector('meta[name="theme-color"]')?.setAttribute("content", theme === "light" ? "#ece4d6" : "#1c1b1f");
  return theme;
}

/** The saved choice, the theme actually showing, and a setter. */
export function useTheme() {
  const [pref, setPref] = useState<ThemePref>(themePref);
  const [theme, setTheme] = useState<"light" | "dark">(() => (document.documentElement.dataset.theme === "light" ? "light" : "dark"));

  useEffect(() => {
    setTheme(apply(pref));
    if (pref !== "system") return;
    const m = media();
    const onChange = () => setTheme(apply("system"));
    m.addEventListener("change", onChange);
    return () => m.removeEventListener("change", onChange);
  }, [pref]);

  const choose = (next: ThemePref) => {
    try {
      if (next === "system") localStorage.removeItem(KEY);
      else localStorage.setItem(KEY, next);
    } catch {
      // Private mode: the choice lasts until the tab closes.
    }
    setPref(next);
    // Other components using this hook (sidebar and profile) pick it up on their next render.
    window.dispatchEvent(new Event("alea-theme"));
  };

  useEffect(() => {
    const sync = () => setPref(themePref());
    window.addEventListener("alea-theme", sync);
    return () => window.removeEventListener("alea-theme", sync);
  }, []);

  return { pref, theme, choose };
}
