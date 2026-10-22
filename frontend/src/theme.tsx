import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import type { ReactNode } from "react";
import { flushSync } from "react-dom";

type Theme = "light" | "dark";
const STORAGE_KEY = "rr-theme";

function initialTheme(): Theme {
  try {
    const saved = window.localStorage.getItem(STORAGE_KEY);
    if (saved === "dark" || saved === "light") return saved;
  } catch {
    /* private mode — fall through to OS preference */
  }
  return "light";
}

const ThemeContext = createContext<{ dark: boolean; toggle: () => void }>({
  dark: false,
  toggle: () => {},
});

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setTheme] = useState<Theme>(initialTheme);
  const transition = useRef<ViewTransition | null>(null);
  useEffect(() => {
    document.documentElement.classList.toggle("dark", theme === "dark");
    try {
      window.localStorage.setItem(STORAGE_KEY, theme);
    } catch {
      /* ignore */
    }
  }, [theme]);
  const toggle = useCallback(() => {
    const change = () => flushSync(() => setTheme(t => t === "dark" ? "light" : "dark"));
    transition.current?.skipTransition();
    if (!document.startViewTransition || matchMedia("(prefers-reduced-motion: reduce)").matches) {
      change(); return;
    }
    const next = document.startViewTransition(change);
    transition.current = next;
    void next.ready.then(() => {
      document.documentElement.animate({ clipPath: [
        "polygon(100% 0,100% 0,100% 100%,100% 100%)",
        "polygon(65% 0,100% 0,100% 100%,45% 100%)",
        "polygon(0 0,100% 0,100% 100%,0 100%)",
      ] }, { duration: 650, easing: "cubic-bezier(.22,1,.36,1)", pseudoElement: "::view-transition-new(root)" });
    }).catch(() => { /* A newer toggle can supersede an unfinished transition. */ });
  }, []);
  useEffect(() => () => transition.current?.skipTransition(), []);
  return <ThemeContext.Provider value={{ dark: theme === "dark", toggle }}>{children}</ThemeContext.Provider>;
}

export function useTheme() {
  return useContext(ThemeContext);
}

/** Sun/moon toggle. Inline SVG icons, no emoji. */
export function ThemeToggle() {
  const { dark, toggle } = useTheme();
  return (
    <button
      type="button"
      onClick={toggle}
      aria-pressed={dark}
      aria-label={dark ? "Switch to light theme" : "Switch to dark theme"}
      title={dark ? "Light theme" : "Dark theme"}
      className={`theme-toggle ${dark ? "is-dark" : ""}`}
    >
      {dark ? (
        <svg width="15" height="15" viewBox="0 0 16 16" fill="none" aria-hidden>
          <circle cx="8" cy="8" r="3.2" stroke="currentColor" strokeWidth="1.3" />
          <path d="M8 1.5v1.6M8 12.9v1.6M1.5 8h1.6M12.9 8h1.6M3.4 3.4l1.1 1.1M11.5 11.5l1.1 1.1M12.6 3.4l-1.1 1.1M4.5 11.5l-1.1 1.1" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
        </svg>
      ) : (
        <svg width="15" height="15" viewBox="0 0 16 16" fill="none" aria-hidden>
          <path d="M13.5 9.5A5.8 5.8 0 0 1 6.5 2.5a5.8 5.8 0 1 0 7 7z" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round" />
        </svg>
      )}
    </button>
  );
}
