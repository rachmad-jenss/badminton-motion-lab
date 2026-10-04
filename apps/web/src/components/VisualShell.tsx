"use client";

import Link from "next/link";
import type { CSSProperties, KeyboardEvent as ReactKeyboardEvent, ReactNode } from "react";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { AppNav } from "@/components/AppNav";
import {
  BACKGROUND_PRESETS,
  DEFAULT_BACKGROUND_ID,
  getBackgroundPreset,
  type BackgroundPreset,
} from "@/lib/backgrounds";

type ShellStyle = CSSProperties & Record<`--${string}`, string>;
type ThemeMode = "system" | "light" | "dark";
type ThemeIcon = "system" | "light" | "dark";
type MenuId = "color" | "background";

const BACKGROUND_STORAGE_KEY = "bml.backgroundPreset";
const THEME_STORAGE_KEY = "bml.themeMode";
const useIsomorphicLayoutEffect = typeof window === "undefined" ? useEffect : useLayoutEffect;

function suppressTransitions() {
  const root = document.documentElement;
  root.dataset.themeSwitching = "true";
  void root.offsetWidth; // force reflow so the rule is active
  requestAnimationFrame(() => {
    requestAnimationFrame(() => delete root.dataset.themeSwitching);
  });
}

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
  const [preferencesReady, setPreferencesReady] = useState(false);
  const [prevPresetId, setPrevPresetId] = useState<string | null>(null);
  const [openMenu, setOpenMenu] = useState<MenuId | null>(null);
  const [closingMenu, setClosingMenu] = useState<MenuId | null>(null);
  const [menuFocusIndex, setMenuFocusIndex] = useState<Record<MenuId, number>>({ color: 0, background: 0 });
  const preset = getBackgroundPreset(backgroundId);
  const crossfadeTimer = useRef<number | null>(null);
  const menuCloseTimer = useRef<number | null>(null);

  function clearMenuClose() {
    if (menuCloseTimer.current != null) {
      window.clearTimeout(menuCloseTimer.current);
      menuCloseTimer.current = null;
    }
    setClosingMenu(null);
  }

  function closeMenu(menuId: MenuId) {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      clearMenuClose();
      setOpenMenu((current) => (current === menuId ? null : current));
      return;
    }

    if (menuCloseTimer.current != null) window.clearTimeout(menuCloseTimer.current);
    setClosingMenu(menuId);
    menuCloseTimer.current = window.setTimeout(() => {
      setOpenMenu((current) => (current === menuId ? null : current));
      setClosingMenu((current) => (current === menuId ? null : current));
      menuCloseTimer.current = null;
    }, 160);
  }

  function toggleMenu(menuId: MenuId) {
    if (openMenu === menuId && closingMenu == null) {
      closeMenu(menuId);
      return;
    }
    if (menuCloseTimer.current != null) window.clearTimeout(menuCloseTimer.current);
    menuCloseTimer.current = null;
    setClosingMenu(null);
    setOpenMenu(menuId);
    setMenuFocusIndex((current) => ({ ...current, [menuId]: 0 }));
  }

  function handleMenuKeyDown(event: ReactKeyboardEvent<HTMLDivElement>, menuId: MenuId) {
    if (event.key === "Escape") {
      event.preventDefault();
      event.currentTarget.parentElement?.querySelector<HTMLElement>("summary")?.focus();
      closeMenu(menuId);
      return;
    }

    if (event.key !== "ArrowDown" && event.key !== "ArrowUp" && event.key !== "Home" && event.key !== "End") return;
    const options = Array.from(event.currentTarget.querySelectorAll<HTMLButtonElement>("[role='menuitemradio']"));
    if (!options.length) return;
    event.preventDefault();
    const currentIndex = options.findIndex((option) => option === document.activeElement);
    const fallbackIndex = menuFocusIndex[menuId] ?? 0;
    const index = currentIndex >= 0 ? currentIndex : fallbackIndex;
    const nextIndex = event.key === "Home"
      ? 0
      : event.key === "End"
        ? options.length - 1
        : (index + (event.key === "ArrowDown" ? 1 : -1) + options.length) % options.length;
    setMenuFocusIndex((current) => ({ ...current, [menuId]: nextIndex }));
    options[nextIndex]?.focus();
  }

  useEffect(() => {
    function handlePointerDown(event: PointerEvent) {
      const target = event.target as Element | null;
      document.querySelectorAll<HTMLDetailsElement>("details.icon-menu[open]").forEach((menu) => {
        if (target && menu.contains(target)) return;
        const menuId = menu.dataset.menuId;
        if (menuId === "color" || menuId === "background") closeMenu(menuId);
      });
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key !== "Escape") return;
      document.querySelectorAll<HTMLDetailsElement>("details.icon-menu[open]").forEach((menu) => {
        event.preventDefault();
        menu.querySelector<HTMLElement>(".icon-button")?.focus();
        const menuId = menu.dataset.menuId;
        if (menuId === "color" || menuId === "background") closeMenu(menuId);
      });
    }

    document.addEventListener("pointerdown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
      if (menuCloseTimer.current != null) window.clearTimeout(menuCloseTimer.current);
    };
  }, []);

  useIsomorphicLayoutEffect(() => {
    const saved = window.localStorage.getItem(BACKGROUND_STORAGE_KEY);
    if (saved) setBackgroundId(getBackgroundPreset(saved).id);

    const savedTheme = window.localStorage.getItem(THEME_STORAGE_KEY);
    if (savedTheme === "system" || savedTheme === "light" || savedTheme === "dark") {
      setThemeMode(savedTheme);
    }
    setPreferencesReady(true);
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
    suppressTransitions();
    if (nextId !== backgroundId) {
      setPrevPresetId(backgroundId);
    }
    setBackgroundId(nextId);
    window.localStorage.setItem(BACKGROUND_STORAGE_KEY, nextId);
  }

  function changeTheme(nextTheme: ThemeMode) {
    suppressTransitions();
    setThemeMode(nextTheme);
    window.localStorage.setItem(THEME_STORAGE_KEY, nextTheme);
  }

  useEffect(() => {
    if (!prevPresetId) return;
    crossfadeTimer.current = window.setTimeout(() => setPrevPresetId(null), 350);
    return () => {
      if (crossfadeTimer.current != null) window.clearTimeout(crossfadeTimer.current);
    };
  }, [prevPresetId]);

  function shellVars(target: BackgroundPreset) {
    return {
      "--shell-image": `url("${target.image}")`,
      "--shell-overlay": target.overlay,
      "--shell-overlay-light": target.overlayLight,
      "--shell-accent": target.accent,
      "--shell-accent-strong": target.accentStrong,
      "--shell-surface-dark": target.surface,
      "--shell-surface-light": target.surfaceLight,
      "--shell-position": target.position,
    } as ShellStyle;
  }

  const shellStyle = shellVars(preset);

  return (
    <div
      className="visual-shell"
      data-content-side={preset.contentSide}
      data-preferences-ready={preferencesReady ? "true" : "false"}
      style={shellStyle}
    >
      <a className="skip-link" href="#main-content">
        Skip to content
      </a>
      {prevPresetId ? (
        <div
          className="shell-backdrop shell-backdrop-static"
          aria-hidden="true"
          style={shellVars(getBackgroundPreset(prevPresetId))}
        />
      ) : null}
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
            <details
              className="icon-menu"
              data-menu-id="color"
              open={openMenu === "color" || closingMenu === "color"}
            >
              <summary
                className="icon-button"
                aria-label="Color theme"
                aria-haspopup="menu"
                aria-expanded={openMenu === "color" && closingMenu !== "color"}
                aria-controls="color-theme-menu"
                title="Color theme"
                onClick={(event) => {
                  event.preventDefault();
                  toggleMenu("color");
                }}
              >
                <ThemeGlyph mode={themeMode} />
              </summary>
              <div
                className={`icon-menu-panel${closingMenu === "color" ? " closing" : ""}`}
                id="color-theme-menu"
                role="menu"
                aria-labelledby="color-theme-menu-heading"
                onKeyDown={(event) => handleMenuKeyDown(event, "color")}
              >
                <p className="menu-heading" id="color-theme-menu-heading">Color theme</p>
                {(["system", "light", "dark"] as ThemeMode[]).map((option, index) => (
                  <button
                    key={option}
                    type="button"
                    role="menuitemradio"
                    aria-checked={themeMode === option}
                    tabIndex={menuFocusIndex.color === index ? 0 : -1}
                    className={`menu-option${themeMode === option ? " selected" : ""}`}
                    onFocus={() => setMenuFocusIndex((current) => ({ ...current, color: index }))}
                    onClick={() => {
                      changeTheme(option);
                      closeMenu("color");
                    }}
                  >
                    <ThemeGlyph mode={option} />
                    <span>{option[0].toUpperCase() + option.slice(1)}</span>
                  </button>
                ))}
              </div>
            </details>

            <details
              className="icon-menu"
              data-menu-id="background"
              open={openMenu === "background" || closingMenu === "background"}
            >
              <summary
                className="icon-button"
                aria-label="Background theme"
                aria-haspopup="menu"
                aria-expanded={openMenu === "background" && closingMenu !== "background"}
                aria-controls="background-theme-menu"
                title="Background theme"
                onClick={(event) => {
                  event.preventDefault();
                  toggleMenu("background");
                }}
              >
                <BackgroundGlyph />
              </summary>
              <div
                className={`icon-menu-panel background-menu${closingMenu === "background" ? " closing" : ""}`}
                id="background-theme-menu"
                role="menu"
                aria-labelledby="background-theme-menu-heading"
                onKeyDown={(event) => handleMenuKeyDown(event, "background")}
              >
                <p className="menu-heading" id="background-theme-menu-heading">Background theme</p>
                {BACKGROUND_PRESETS.map((option, index) => (
                  <button
                    key={option.id}
                    type="button"
                    role="menuitemradio"
                    aria-checked={preset.id === option.id}
                    tabIndex={menuFocusIndex.background === index ? 0 : -1}
                    className={`menu-option${preset.id === option.id ? " selected" : ""}`}
                    onFocus={() => setMenuFocusIndex((current) => ({ ...current, background: index }))}
                    onClick={() => {
                      changeBackground(option.id);
                      closeMenu("background");
                    }}
                  >
                    <span className="background-swatch" aria-hidden="true">
                      <img src={option.image} alt="" loading="lazy" decoding="async" />
                    </span>
                    <span>{option.label}</span>
                  </button>
                ))}
              </div>
            </details>
          </div>
        </div>
      </header>

      <div className="shell-content" id="main-content" tabIndex={-1}>
        {children}
      </div>
    </div>
  );
}
