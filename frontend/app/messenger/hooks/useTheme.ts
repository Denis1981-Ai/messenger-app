"use client";

import { useEffect, useState } from "react";

const THEME_KEY = "messenger-theme";

export type Theme = "dark" | "light";

const getStoredTheme = (): Theme => {
  if (typeof window === "undefined") {
    return "dark";
  }

  try {
    const saved = window.localStorage.getItem(THEME_KEY) as Theme | null;
    if (saved === "light" || saved === "dark") {
      return saved;
    }
  } catch {}

  return "dark";
};

export const useTheme = () => {
  const [theme, setTheme] = useState<Theme>(getStoredTheme);

  useEffect(() => {
    try {
      document.documentElement.setAttribute("data-theme", theme);
    } catch {}
  }, [theme]);

  const toggleTheme = () => {
    setTheme((prev) => {
      const next: Theme = prev === "dark" ? "light" : "dark";
      try {
        localStorage.setItem(THEME_KEY, next);
      } catch {}
      return next;
    });
  };

  return { theme, toggleTheme };
};
