// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { appearanceOverrideKey } from "@/app/appearanceOverride";
import { customFromPreset } from "@/app/palettes/custom";
import {
  getAppearanceOverride,
  getServerAppearanceOverride,
  refreshStoredAppearanceOverride,
  reloadAppearanceOverride,
  resetAppearanceOverride,
  subscribeAppearanceOverride,
  updateAppearanceOverride,
} from "./appearanceOverrideStore";

const raw = () => localStorage.getItem(appearanceOverrideKey);

beforeEach(() => {
  localStorage.clear();
  reloadAppearanceOverride();
});
afterEach(() => vi.restoreAllMocks());

describe("appearance override store", () => {
  it("reads what is stored, validated", () => {
    localStorage.setItem(
      appearanceOverrideKey,
      JSON.stringify({ v: 1, palette: "riso", corners: "bad" }),
    );
    reloadAppearanceOverride();
    expect(getAppearanceOverride()).toEqual({ palette: "riso" });
  });

  it("writes changes, notifies, and keeps the snapshot stable between them", () => {
    const listener = vi.fn();
    const unsubscribe = subscribeAppearanceOverride(listener);
    updateAppearanceOverride({ palette: "mono" });
    expect(listener).toHaveBeenCalledTimes(1);
    expect(JSON.parse(raw() as string)).toMatchObject({ v: 1, palette: "mono" });
    expect(getAppearanceOverride()).toBe(getAppearanceOverride());
    unsubscribe();
    updateAppearanceOverride({ corners: "rounded" });
    expect(listener).toHaveBeenCalledTimes(1);
  });

  it("removes the key when the last field is cleared, and on reset", () => {
    updateAppearanceOverride({ palette: "mono" });
    updateAppearanceOverride({ palette: null });
    expect(raw()).toBeNull();
    updateAppearanceOverride({ corners: "rounded" });
    resetAppearanceOverride();
    expect(raw()).toBeNull();
    expect(getAppearanceOverride()).toEqual({});
  });

  it("follows another tab's write, and its clear()", () => {
    const listener = vi.fn();
    const unsubscribe = subscribeAppearanceOverride(listener);
    localStorage.setItem(appearanceOverrideKey, JSON.stringify({ v: 1, palette: "midnight" }));
    window.dispatchEvent(new StorageEvent("storage", { key: appearanceOverrideKey }));
    expect(getAppearanceOverride()).toEqual({ palette: "midnight" });
    localStorage.clear();
    window.dispatchEvent(new StorageEvent("storage", { key: null }));
    expect(getAppearanceOverride()).toEqual({});
    window.dispatchEvent(new StorageEvent("storage", { key: "theme" }));
    expect(listener).toHaveBeenCalledTimes(2);
    unsubscribe();
  });

  it("refreshes the stored record from its validated form", () => {
    localStorage.setItem(
      appearanceOverrideKey,
      JSON.stringify({ v: 1, palette: "riso", junk: 1, customCss: "stale" }),
    );
    reloadAppearanceOverride();
    updateAppearanceOverride({ customPalette: customFromPreset("sleeve") });
    localStorage.setItem(
      appearanceOverrideKey,
      JSON.stringify({ ...JSON.parse(raw() as string), customCss: "stale" }),
    );
    refreshStoredAppearanceOverride();
    expect(JSON.parse(raw() as string).customCss).toContain(':root[data-palette="custom"]');
    expect(JSON.parse(raw() as string).junk).toBeUndefined();
  });

  it("writes nothing when refreshing an empty override", () => {
    refreshStoredAppearanceOverride();
    expect(raw()).toBeNull();
  });

  it("is empty on the server", () => {
    expect(getServerAppearanceOverride()).toEqual({});
  });

  it("falls back to empty when reading throws", () => {
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("blocked");
    });
    reloadAppearanceOverride();
    expect(getAppearanceOverride()).toEqual({});
  });

  it("keeps a change in memory when writing throws, and never throws itself", () => {
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("quota");
    });
    vi.spyOn(Storage.prototype, "removeItem").mockImplementation(() => {
      throw new Error("blocked");
    });
    expect(() => updateAppearanceOverride({ palette: "riso" })).not.toThrow();
    expect(getAppearanceOverride()).toEqual({ palette: "riso" });
    expect(() => resetAppearanceOverride()).not.toThrow();
    expect(getAppearanceOverride()).toEqual({});
  });
});
