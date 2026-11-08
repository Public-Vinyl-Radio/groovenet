"use client";
import React from "react";
import type { AnalyticsEvents } from "@/lib/analytics/events";

type PaletteEvent = AnalyticsEvents["command_palette_used"];
export interface PaletteAction {
  id: PaletteEvent["command"];
  label: string;
  onSelect: () => void;
  disabled?: boolean;
}
export interface PaletteScope {
  id: Exclude<PaletteEvent["scope"], "global" | undefined>;
  label: string;
  onSearch?: (query: string) => void;
  actions?: PaletteAction[];
}
interface CommandPaletteCtx {
  paletteOpen: boolean;
  setPaletteOpen: React.Dispatch<React.SetStateAction<boolean>>;
  scope: PaletteScope | undefined;
}
type RegisterScope = (key: symbol, scope: PaletteScope | null) => void;
const ScopeRegistrationContext = React.createContext<RegisterScope | null>(null);
const CommandPaletteContext = React.createContext<CommandPaletteCtx | null>(null);

export function CommandPaletteProvider({ children }: { children: React.ReactNode }) {
  const [paletteOpen, setPaletteOpen] = React.useState(false);
  const [scopes, setScopes] = React.useState(new Map<symbol, PaletteScope>());
  const register = React.useCallback<RegisterScope>((key, scope) => {
    setScopes((current) => {
      if (!scope && !current.has(key)) return current;
      const next = new Map(current);
      if (scope) next.set(key, scope);
      else next.delete(key);
      return next;
    });
  }, []);
  const scope = Array.from(scopes.values()).at(-1);
  return (
    <ScopeRegistrationContext.Provider value={register}>
      <CommandPaletteContext.Provider value={{ paletteOpen, setPaletteOpen, scope }}>
        {children}
      </CommandPaletteContext.Provider>
    </ScopeRegistrationContext.Provider>
  );
}

/** Updating handlers keeps mount order; unmounting restores the previous scope. */
export function usePaletteScope(scope: PaletteScope | null) {
  const register = React.useContext(ScopeRegistrationContext);
  const [key] = React.useState(() => Symbol("palette scope"));
  // Separate registration context: scope updates must not rerender their owners.
  React.useEffect(() => {
    register?.(key, scope);
  });
  React.useEffect(() => () => register?.(key, null), [register, key]);
}

export function useCommandPalette() {
  const ctx = React.useContext(CommandPaletteContext);
  if (!ctx) throw new Error("useCommandPalette must be used within CommandPaletteProvider");
  return ctx;
}
