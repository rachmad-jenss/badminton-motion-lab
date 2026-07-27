"use client";

import Link from "next/link";
import type { CSSProperties, ReactNode } from "react";
import { useEffect, useLayoutEffect, useState } from "react";
import { AppNav } from "@/components/AppNav";
import {
  BACKGROUND_PRESETS,
  DEFAULT_BACKGROUND_ID,
  getBackgroundPreset,
} from "@/lib/backgrounds";

type ShellStyle = CSSProperties & Record<`--${string}`, string>;
type ThemeMode = "system" | "light" | "dark";
type ThemeIcon = "system" | "light" | "dark";

const BACKGROUND_STORAGE_KEY = "bml.backgroundPreset";
const THEME_STORAGE_KEY = "bml.themeMode";
const useIsomorphicLayoutEffect = typeof window === "undefined" ? useEffect : useLayoutEffect;

function ThemeGlyph({ mode }: { mode: ThemeIcon }) {
  if (mode === "light") {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true" className="control-icon">
        <circle cx="12" cy="12" r="4" />
        <path d="M12 2v2M12 20v2M4.93 4.93l1.42 1.42M17.65 17.65l1.42 1.42M2 12h2M20 12h2M4.93 19.07l1.42-1.42M17.65 6.35l1.42-1.42" />
      </svg>
    );
  }

  if (mode === "dark") {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true" className="control-icon">
        <path d="M20.5 15.2A8.5 8.5 0 0 1 8.8 3.5 8.5 8.5 0 1 0 20.5 15.2Z" />
      </svg>
    );
  }

  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className="control-icon">
      <rect x="3" y="4" width="18" height="13" rx="2" />
      <path d="M8 21h8M12 17v4" />
    </svg>
  );
}

function BackgroundGlyph() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className="control-icon">
      <rect x="3" y="4" width="18" height="16" rx="2" />
      <circle cx="8.5" cy="9" r="1.5" />
      <path d="m4 17 5-5 3.5 3.5 2.5-2.5 5 5" />
    </svg>
  );
}

export function VisualShell({ children }: { children: ReactNode }) {
  const [backgroundId, setBackgroundId] = useState(DEFAULT_BACKGROUND_ID);
  const [themeMode, setThemeMode] = useState<ThemeMode>("system");
  const preset = getBackgroundPreset(backgroundId);

  useIsomorphicLayoutEffect(() => {
    const saved = window.localStorage.getItem(BACKGROUND_STORAGE_KEY);
    if (saved) setBackgroundId(getBackgroundPreset(saved).id);

    const savedTheme = window.localStorage.getItem(THEME_STORAGE_KEY);
    if (savedTheme === "system" || savedTheme === "light" || savedTheme === "dark") {
      setThemeMode(savedTheme);
    }
  }, []);

  useEffect(() => {
    const media = window.matchMedia("(prefers-color-scheme: dark)");
    const applyTheme = () => {
      const resolvedTheme = themeMode === "system" ? (media.matches ? "dark" : "light") : themeMode;
      document.documentElement.dataset.theme = `bml-${resolvedTheme}`;
      document.documentElement.style.colorScheme = resolvedTheme;
    };

    applyTheme();
    media.addEventListener("change", applyTheme);
    return () => media.removeEventListener("change", applyTheme);
  }, [themeMode]);

  function changeBackground(nextId: string) {
    setBackgroundId(nextId);
    window.localStorage.setItem(BACKGROUND_STORAGE_KEY, nextId);
  }

  function changeTheme(nextTheme: ThemeMode) {
    setThemeMode(nextTheme);
    window.localStorage.setItem(THEME_STORAGE_KEY, nextTheme);
  }

  const shellStyle = {
    "--shell-image": `url("${preset.image}")`,
    "--shell-overlay": preset.overlay,
    "--shell-overlay-light": preset.overlayLight,
    "--shell-accent": preset.accent,
    "--shell-accent-strong": preset.accentStrong,
    "--shell-surface-dark": preset.surface,
    "--shell-surface-light": preset.surfaceLight,
    "--shell-position": preset.position,
  } as ShellStyle;

  return (
    <div className="visual-shell" data-content-side={preset.contentSide} style={shellStyle}>
      <div key={preset.id} className="shell-backdrop" aria-hidden="true" />
      <div className="shell-overlay" aria-hidden="true" />

      <header className="app-header">
        <div className="app-header-inner">
          <Link className="brand-lockup" href="/" aria-label="Badminton Motion Lab home">
            <span className="brand-logo-frame" aria-hidden="true">
              <img className="brand-logo" src="/logo/image.png" alt="" />
            </span>
          </Link>

          <AppNav />

          <div className="header-controls">
            <details className="icon-menu">
              <summary className="icon-button" aria-label="Color theme" title="Color theme">
                <ThemeGlyph mode={themeMode} />
              </summary>
              <div className="icon-menu-panel" role="menu">
                <p className="menu-heading">Color theme</p>
                {(["system", "light", "dark"] as ThemeMode[]).map((option) => (
                  <button
                    key={option}
                    type="button"
                    role="menuitemradio"
                    aria-checked={themeMode === option}
                    className={`menu-option${themeMode === option ? " selected" : ""}`}
                    onClick={(event) => {
                      changeTheme(option);
                      event.currentTarget.closest("details")?.removeAttribute("open");
                    }}
                  >
                    <ThemeGlyph mode={option} />
                    <span>{option[0].toUpperCase() + option.slice(1)}</span>
                  </button>
                ))}
              </div>
            </details>

            <details className="icon-menu">
              <summary className="icon-button" aria-label="Background theme" title="Background theme">
                <BackgroundGlyph />
              </summary>
              <div className="icon-menu-panel background-menu" role="menu">
                <p className="menu-heading">Background theme</p>
                {BACKGROUND_PRESETS.map((option) => (
                  <button
                    key={option.id}
                    type="button"
                    role="menuitemradio"
                    aria-checked={preset.id === option.id}
                    className={`menu-option${preset.id === option.id ? " selected" : ""}`}
                    onClick={(event) => {
                      changeBackground(option.id);
                      event.currentTarget.closest("details")?.removeAttribute("open");
                    }}
                  >
                    <span className="background-swatch" style={{ backgroundImage: `url("${option.image}")` }} aria-hidden="true" />
                    <span>{option.label}</span>
                  </button>
                ))}
              </div>
            </details>
          </div>
        </div>
      </header>

      <div className="shell-content">{children}</div>
    </div>
  );
}
