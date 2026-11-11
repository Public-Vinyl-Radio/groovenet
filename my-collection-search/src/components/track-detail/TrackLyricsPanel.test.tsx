// @vitest-environment jsdom
import React from "react";
import { describe, expect, it, vi } from "vitest";
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderWithProviders } from "@/test/renderWithProviders";
import type { TrackLyricsState } from "@/services/internalApi/trackLyrics";
import TrackLyricsPanel, { type TrackLyricsPanelProps } from "./TrackLyricsPanel";

const fromFile: TrackLyricsState = {
  kind: "lyrics",
  lyrics: { text: "First line\nSecond line", source: "embedded", updated_at: "2026-11-11" },
};
const edited: TrackLyricsState = {
  kind: "lyrics",
  lyrics: { text: "My words", source: "user", updated_at: "2026-11-11" },
};

function renderPanel(props: Partial<TrackLyricsPanelProps> = {}) {
  const onSave = vi.fn().mockResolvedValue(undefined);
  const onClear = vi.fn().mockResolvedValue(undefined);
  const view = renderWithProviders(
    <TrackLyricsPanel state={fromFile} onSave={onSave} onClear={onClear} {...props} />,
  );
  return { ...view, onSave, onClear, user: userEvent.setup() };
}

const button = (name: string) => screen.getByRole("button", { name });

describe("TrackLyricsPanel", () => {
  it("starts collapsed, naming the source, and opens on Show", async () => {
    const { user } = renderPanel();
    expect(screen.getByText("From file")).toBeTruthy();
    expect(screen.queryByTestId("track-lyrics-text")).toBeNull();
    expect(button("Show").getAttribute("aria-expanded")).toBe("false");

    await user.click(button("Show"));
    expect(screen.getByTestId("track-lyrics-text").textContent).toBe("First line\nSecond line");
    expect(button("Hide").getAttribute("aria-expanded")).toBe("true");

    await user.click(button("Hide"));
    expect(screen.queryByTestId("track-lyrics-text")).toBeNull();
  });

  it("labels typed lyrics as edited", () => {
    renderPanel({ state: edited });
    expect(screen.getByText("Edited")).toBeTruthy();
  });

  it("renders nothing on a friend's track", () => {
    const { container } = renderPanel({ state: { kind: "not_owner" } });
    expect(container.querySelector("section")).toBeNull();
  });

  it("shows a skeleton while loading and the error when the read fails", () => {
    const { rerender } = renderPanel({ state: undefined, defaultOpen: true });
    expect(screen.queryByTestId("track-lyrics-text")).toBeNull();
    expect(screen.queryByText("None")).toBeNull();

    rerender(
      <TrackLyricsPanel
        state={undefined}
        error={new Error("Failed to read lyrics")}
        onSave={vi.fn()}
        onClear={vi.fn()}
        defaultOpen
      />,
    );
    expect(screen.getByText("Failed to read lyrics")).toBeTruthy();
  });

  it("has an empty state that adds lyrics", async () => {
    const { user, onSave } = renderPanel({ state: { kind: "none" }, defaultOpen: true });
    expect(screen.getByText("None")).toBeTruthy();
    expect(screen.getByText(/An instrumental, or the file carries none/)).toBeTruthy();

    await user.click(button("Add lyrics"));
    expect(button("Save").hasAttribute("disabled")).toBe(true);
    expect(screen.queryByRole("button", { name: "Clear lyrics" })).toBeNull();
    await user.type(screen.getByRole("textbox", { name: "Lyrics" }), "New words");
    await user.click(button("Save"));
    expect(onSave).toHaveBeenCalledWith("New words");
    await waitFor(() => expect(screen.queryByRole("textbox")).toBeNull());
  });

  it("edits existing lyrics, and Cancel leaves them alone", async () => {
    const { user, onSave } = renderPanel({ defaultOpen: true });
    await user.click(button("Edit"));
    const box = screen.getByRole("textbox", { name: "Lyrics" }) as HTMLTextAreaElement;
    expect(box.value).toBe("First line\nSecond line");
    expect(screen.queryByRole("button", { name: "Edit" })).toBeNull();

    await user.click(button("Cancel"));
    expect(screen.queryByRole("textbox")).toBeNull();
    expect(onSave).not.toHaveBeenCalled();
  });

  it("clears lyrics from the editor", async () => {
    const { user, onClear } = renderPanel({ state: edited, defaultEditing: true });
    expect((screen.getByRole("textbox") as HTMLTextAreaElement).value).toBe("My words");
    expect(screen.getByText(/The next tag read fills them from the file again/)).toBeTruthy();
    await user.click(button("Clear lyrics"));
    expect(onClear).toHaveBeenCalled();
    await waitFor(() => expect(screen.queryByRole("textbox")).toBeNull());
  });

  it("opens an empty editor when started editing with no lyrics", () => {
    renderPanel({ state: { kind: "none" }, defaultEditing: true });
    expect((screen.getByRole("textbox") as HTMLTextAreaElement).value).toBe("");
  });

  it("keeps the editor open and says why when saving fails", async () => {
    const onSave = vi.fn().mockRejectedValue(new Error("Failed to save lyrics"));
    const { user } = renderPanel({ defaultEditing: true, onSave });
    await user.click(button("Save"));
    expect((await screen.findByRole("alert")).textContent).toBe("Failed to save lyrics");
    expect(screen.getByRole("textbox")).toBeTruthy();
  });

  it("reports a thrown non-Error as text", async () => {
    const onClear = vi.fn().mockRejectedValue("nope");
    const { user } = renderPanel({ defaultEditing: true, onClear });
    await user.click(button("Clear lyrics"));
    expect((await screen.findByRole("alert")).textContent).toBe("nope");
  });

  it("locks the other actions while one is in flight", () => {
    const { rerender } = renderPanel({ defaultEditing: true, saving: true });
    expect(button("Cancel").hasAttribute("disabled")).toBe(true);
    expect(button("Clear lyrics").hasAttribute("disabled")).toBe(true);

    rerender(
      <TrackLyricsPanel
        state={fromFile}
        onSave={vi.fn()}
        onClear={vi.fn()}
        defaultEditing
        clearing
      />,
    );
    expect(button("Save").hasAttribute("disabled")).toBe(true);
    expect(button("Cancel").hasAttribute("disabled")).toBe(true);
  });
});
