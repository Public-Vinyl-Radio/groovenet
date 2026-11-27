// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  NOTICE_DISMISSAL_KEY,
  OPENAI_EMBEDDING_MODEL,
  embeddingGuidance,
  missingKeys,
  missingSignature,
  readDismissedSignature,
  shouldShowNotice,
  writeDismissedSignature,
  type IntegrationStatus,
} from "../integrationKeys";

const LOCAL = "bge-small-en-v1.5";
const keys = (openai: boolean, youtube: boolean) => ({
  openai: { configured: openai },
  youtube: { configured: youtube },
});
const status = (
  openai: boolean,
  models: { target_model: string; serving_model: string }[],
): IntegrationStatus => ({ keys: keys(openai, false), embedding_models: models });
const pair = (target_model: string, serving_model: string) => ({ target_model, serving_model });

afterEach(() => {
  window.localStorage.clear();
  vi.restoreAllMocks();
});

describe("missingKeys / missingSignature", () => {
  it("lists unconfigured keys in a stable order", () => {
    expect(missingKeys(keys(false, false))).toEqual(["openai", "youtube"]);
    expect(missingKeys(keys(true, false))).toEqual(["youtube"]);
    expect(missingKeys(keys(true, true))).toEqual([]);
  });

  it("gives the same signature however the set is ordered", () => {
    expect(missingSignature(["youtube", "openai"])).toBe(missingSignature(["openai", "youtube"]));
    expect(missingSignature(["openai"])).not.toBe(missingSignature(["openai", "youtube"]));
  });
});

describe("embeddingGuidance", () => {
  it("needs nothing from a local install without a key", () => {
    expect(embeddingGuidance(status(false, [pair(LOCAL, LOCAL), pair(LOCAL, LOCAL)]))).toBe(
      "local",
    );
    expect(embeddingGuidance(status(false, []))).toBe("local");
  });

  it("points a keyed local library at the cutover without switching it", () => {
    expect(embeddingGuidance(status(true, [pair(LOCAL, LOCAL)]))).toBe("upgrade");
  });

  it("recognises a cutover that has started but not finished", () => {
    const models = [pair(OPENAI_EMBEDDING_MODEL, LOCAL), pair(LOCAL, LOCAL)];
    expect(embeddingGuidance(status(true, models))).toBe("cutover");
  });

  it("is done once every kind serves OpenAI", () => {
    const models = [
      pair(OPENAI_EMBEDDING_MODEL, OPENAI_EMBEDDING_MODEL),
      pair(OPENAI_EMBEDDING_MODEL, OPENAI_EMBEDDING_MODEL),
    ];
    expect(embeddingGuidance(status(true, models))).toBe("openai");
  });

  it("warns when OpenAI vectors are in use without a key", () => {
    expect(
      embeddingGuidance(status(false, [pair(OPENAI_EMBEDDING_MODEL, OPENAI_EMBEDDING_MODEL)])),
    ).toBe("openai-key-missing");
    expect(embeddingGuidance(status(false, [pair(OPENAI_EMBEDDING_MODEL, LOCAL)]))).toBe(
      "openai-key-missing",
    );
  });

  it("treats a keyed install with no rows as an upgrade, not done", () => {
    expect(embeddingGuidance(status(true, []))).toBe("upgrade");
  });
});

describe("shouldShowNotice", () => {
  it("never shows when nothing is missing", () => {
    expect(shouldShowNotice([], null)).toBe(false);
  });

  it("shows until that exact set is dismissed", () => {
    expect(shouldShowNotice(["youtube"], null)).toBe(true);
    expect(shouldShowNotice(["youtube"], missingSignature(["youtube"]))).toBe(false);
  });

  it("comes back when the missing set changes", () => {
    const dismissed = missingSignature(["openai", "youtube"]);
    expect(shouldShowNotice(["youtube"], dismissed)).toBe(true);
    expect(shouldShowNotice(["openai", "youtube"], dismissed)).toBe(false);
  });
});

describe("dismissal storage", () => {
  it("round-trips and clears a signature", () => {
    expect(readDismissedSignature()).toBeNull();
    writeDismissedSignature("youtube");
    expect(readDismissedSignature()).toBe("youtube");
    expect(window.localStorage.getItem(NOTICE_DISMISSAL_KEY)).toBe("youtube");
    writeDismissedSignature(null);
    expect(readDismissedSignature()).toBeNull();
  });

  it("survives storage that throws", () => {
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("blocked");
    });
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("blocked");
    });
    vi.spyOn(Storage.prototype, "removeItem").mockImplementation(() => {
      throw new Error("blocked");
    });
    expect(readDismissedSignature()).toBeNull();
    expect(() => writeDismissedSignature("youtube")).not.toThrow();
    expect(() => writeDismissedSignature(null)).not.toThrow();
  });
});
