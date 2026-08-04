"use client";

import { useState, useEffect, useCallback } from "react";

type Theme = "dark" | "light";
const STORAGE_KEY = "qureocity-theme";
const CHANGE_EVENT = "qureocity-theme-change";

export function useTheme() {
  // Matches the default set by the inline FOUC-prevention script in
  // app/layout.tsx so the first client render never disagrees with what
  // was already painted.
  const [theme, setThemeState] = useState<Theme>("dark");

  useEffect(() => {
    const current = document.documentElement.getAttribute("data-theme");
    if (current === "light" || current === "dark") setThemeState(current);

    // Every call to useTheme() (Sidebar, EmployeePanel, ThemeToggle, …)
    // holds its own local state — this isn't a shared context. Without
    // this listener, toggling from one component's button never reaches
    // any other component's copy of the state, so things like the logo
    // filter go stale until a full reload.
    const onChange = (e: Event) => {
      const next = (e as CustomEvent<Theme>).detail;
      if (next === "light" || next === "dark") setThemeState(next);
    };
    window.addEventListener(CHANGE_EVENT, onChange);
    return () => window.removeEventListener(CHANGE_EVENT, onChange);
  }, []);

  const setTheme = useCallback((next: Theme) => {
    setThemeState(next);
    document.documentElement.setAttribute("data-theme", next);
    try {
      localStorage.setItem(STORAGE_KEY, next);
    } catch {
      // Private browsing / storage disabled — theme just won't persist
      // across visits, which is a fine fallback rather than an error.
    }
    window.dispatchEvent(new CustomEvent(CHANGE_EVENT, { detail: next }));
  }, []);

  const toggleTheme = useCallback(() => {
    setTheme(theme === "dark" ? "light" : "dark");
  }, [theme, setTheme]);

  return { theme, setTheme, toggleTheme };
}
