"use client";

import type { IconButtonProps } from "@chakra-ui/react";
import { IconButton } from "@chakra-ui/react";
import * as React from "react";
import { LuMoon, LuSun } from "react-icons/lu";

export type ColorMode = "light" | "dark";
export type ThemeSetting = ColorMode | "system";

type AttributeMode = "class" | `data-${string}`;

export interface ColorModeProviderProps {
  children?: React.ReactNode;
  forcedTheme?: ColorMode;
  defaultTheme?: ThemeSetting;
  enableSystem?: boolean;
  disableTransitionOnChange?: boolean;
  storageKey?: string;
  attribute?: AttributeMode | AttributeMode[];
}

export interface UseColorModeReturn {
  colorMode: ColorMode;
  /** What the user chose: `system` follows the OS, `colorMode` is what it resolved to. */
  colorModeSetting: ThemeSetting;
  setColorModeSetting: (setting: ThemeSetting) => void;
  setColorMode: (colorMode: ColorMode) => void;
  toggleColorMode: () => void;
}

interface ColorModeContextValue {
  colorMode: ColorMode;
  colorModeSetting: ThemeSetting;
  setColorModeSetting: (setting: ThemeSetting) => void;
  setColorMode: (colorMode: ColorMode) => void;
  toggleColorMode: () => void;
  mounted: boolean;
}

const MEDIA_QUERY = "(prefers-color-scheme: dark)";
const THEME_CLASSES: ColorMode[] = ["light", "dark"];

const ColorModeContext = React.createContext<ColorModeContextValue | null>(null);

function getSystemColorMode() {
  return window.matchMedia(MEDIA_QUERY).matches ? "dark" : "light";
}

function getStoredTheme(storageKey: string, defaultTheme: ThemeSetting) {
  try {
    return (localStorage.getItem(storageKey) as ThemeSetting | null) ?? defaultTheme;
  } catch {
    return defaultTheme;
  }
}

function applyThemeAttribute(attribute: AttributeMode | AttributeMode[], colorMode: ColorMode) {
  const root = document.documentElement;
  const attributes = Array.isArray(attribute) ? attribute : [attribute];

  for (const attr of attributes) {
    if (attr === "class") {
      root.classList.remove(...THEME_CLASSES);
      root.classList.add(colorMode);
      continue;
    }
    root.setAttribute(attr, colorMode);
  }

  root.style.colorScheme = colorMode;
}

function withoutTransitions(disabled: boolean) {
  if (!disabled) return () => {};

  const style = document.createElement("style");
  style.appendChild(document.createTextNode("*,*::before,*::after{transition:none!important}"));
  document.head.appendChild(style);

  return () => {
    window.getComputedStyle(document.body);
    setTimeout(() => {
      document.head.removeChild(style);
    }, 1);
  };
}

export function ColorModeProvider({
  children,
  forcedTheme,
  defaultTheme = "system",
  enableSystem = true,
  disableTransitionOnChange = true,
  storageKey = "theme",
  attribute = "class",
}: ColorModeProviderProps) {
  const [mounted, setMounted] = React.useState(false);
  const [theme, setThemeState] = React.useState<ThemeSetting>(defaultTheme);
  const [systemColorMode, setSystemColorMode] = React.useState<ColorMode>("light");

  React.useEffect(() => {
    const media = window.matchMedia(MEDIA_QUERY);
    const storedTheme = getStoredTheme(storageKey, defaultTheme);

    setMounted(true);
    setThemeState(storedTheme);
    setSystemColorMode(getSystemColorMode());

    const onChange = () => {
      setSystemColorMode(getSystemColorMode());
    };

    media.addEventListener("change", onChange);
    return () => media.removeEventListener("change", onChange);
  }, [defaultTheme, storageKey]);

  const resolvedTheme: ColorMode =
    forcedTheme ??
    (theme === "system" && enableSystem ? systemColorMode : theme === "dark" ? "dark" : "light");

  React.useEffect(() => {
    if (!mounted) return;
    const cleanup = withoutTransitions(disableTransitionOnChange);
    applyThemeAttribute(attribute, resolvedTheme);
    cleanup();
  }, [attribute, disableTransitionOnChange, mounted, resolvedTheme]);

  const setColorModeSetting = React.useCallback(
    (setting: ThemeSetting) => {
      setThemeState(setting);
      try {
        localStorage.setItem(storageKey, setting);
      } catch {
        // Ignore storage failures in private browsing or restricted contexts.
      }
    },
    [storageKey],
  );

  const setColorMode = setColorModeSetting;

  const toggleColorMode = React.useCallback(() => {
    setColorMode(resolvedTheme === "dark" ? "light" : "dark");
  }, [resolvedTheme, setColorMode]);

  const value = React.useMemo<ColorModeContextValue>(
    () => ({
      colorMode: resolvedTheme,
      colorModeSetting: theme,
      setColorModeSetting,
      setColorMode,
      toggleColorMode,
      mounted,
    }),
    [mounted, resolvedTheme, theme, setColorModeSetting, setColorMode, toggleColorMode],
  );

  return <ColorModeContext.Provider value={value}>{children}</ColorModeContext.Provider>;
}

export function useColorMode(): UseColorModeReturn {
  const context = React.useContext(ColorModeContext);
  if (!context) {
    throw new Error("useColorMode must be used within a ColorModeProvider");
  }

  return {
    colorMode: context.colorMode,
    colorModeSetting: context.colorModeSetting,
    setColorModeSetting: context.setColorModeSetting,
    setColorMode: context.setColorMode,
    toggleColorMode: context.toggleColorMode,
  };
}

export function useColorModeValue<T>(light: T, dark: T) {
  const { colorMode } = useColorMode();
  return colorMode === "dark" ? dark : light;
}

export function ColorModeIcon() {
  const { colorMode } = useColorMode();
  return colorMode === "dark" ? <LuMoon /> : <LuSun />;
}

type ColorModeButtonProps = Omit<IconButtonProps, "aria-label">;

export const ColorModeButton = React.forwardRef<HTMLButtonElement, ColorModeButtonProps>(
  function ColorModeButton(props, ref) {
    const { toggleColorMode } = useColorMode();
    return (
      <IconButton
        onClick={toggleColorMode}
        variant="ghost"
        aria-label="Toggle color mode"
        size="sm"
        ref={ref}
        {...props}
        css={{
          _icon: {
            width: "5",
            height: "5",
          },
        }}
      >
        <ColorModeIcon />
      </IconButton>
    );
  },
);

export const LightMode = React.forwardRef<HTMLSpanElement, React.HTMLAttributes<HTMLSpanElement>>(
  function LightMode({ className, ...rest }, ref) {
    return (
      <span
        className={`chakra-theme light${className ? ` ${className}` : ""}`}
        ref={ref}
        {...rest}
      />
    );
  },
);

export const DarkMode = React.forwardRef<HTMLSpanElement, React.HTMLAttributes<HTMLSpanElement>>(
  function DarkMode({ className, ...rest }, ref) {
    return (
      <span
        className={`chakra-theme dark${className ? ` ${className}` : ""}`}
        ref={ref}
        {...rest}
      />
    );
  },
);
