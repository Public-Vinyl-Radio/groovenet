// @vitest-environment jsdom
import React from "react";
import { describe, expect, it, vi } from "vitest";
import { fireEvent, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderWithProviders } from "@/test/renderWithProviders";
import type { ArtistCreditRef } from "@/api-contract/schemas";
import ArtistLink, { artistHref, artistPageHref, splitArtistCredits } from "./ArtistLink";

const credit = (
  id: number,
  name: string,
  position: number,
  extra: Partial<ArtistCreditRef> = {},
): ArtistCreditRef => ({
  id,
  name,
  slug: name.toLowerCase().replace(/\W+/g, "-"),
  is_placeholder: false,
  role: "primary",
  position,
  credited_as: name,
  ...extra,
});

describe("artistHref", () => {
  it("searches albums for the artist, scoped to a collection when given one", () => {
    expect(artistHref("DJ Shadow", 7)).toBe("/albums?q=DJ%20Shadow&friend_id=7");
    expect(artistHref("Can & Co")).toBe("/albums?q=Can%20%26%20Co");
    expect(artistHref("Can", null)).toBe("/albums?q=Can");
  });
});

describe("artistPageHref", () => {
  it("encodes the slug", () => {
    expect(artistPageHref("a/b")).toBe("/artists/a%2Fb");
  });
});

describe("splitArtistCredits", () => {
  it("keeps the credited joiner between links", () => {
    expect(splitArtistCredits("A & B", [credit(1, "A", 0), credit(2, "B", 1)])).toEqual([
      { text: "A", credit: credit(1, "A", 0) },
      { text: " & " },
      { text: "B", credit: credit(2, "B", 1) },
    ]);
  });

  it("matches case-insensitively, keeping the string's spelling, in position order", () => {
    const segments = splitArtistCredits("meridian brothers, A", [
      credit(2, "A", 1),
      credit(1, "Meridian Brothers", 0),
    ]);
    expect(segments.map((s) => s.text)).toEqual(["meridian brothers", ", ", "A"]);
  });

  it("matches the spelling the release credits, not the canonical name", () => {
    const c = credit(1, "The Strokes", 0, { credited_as: "Strokes, The" });
    expect(splitArtistCredits("Strokes, The", [c])).toEqual([{ text: "Strokes, The", credit: c }]);
  });

  it("falls back to the name when there is no credited spelling", () => {
    const c = credit(1, "A", 0, { credited_as: "" });
    expect(splitArtistCredits("A", [c])[0].credit).toBe(c);
  });

  it("skips credits the string does not show, repeats, and nameless credits", () => {
    const segments = splitArtistCredits("A", [
      credit(1, "A", 0),
      credit(1, "A", 1, { role: "composer" }),
      credit(2, "Remixer", 2, { role: "remixer" }),
      credit(3, "", 3, { credited_as: "" }),
    ]);
    expect(segments).toEqual([{ text: "A", credit: credit(1, "A", 0) }]);
  });

  it("keeps placeholders and surrounding text plain, merged into one segment", () => {
    const segments = splitArtistCredits("Various feat. X", [
      credit(1, "Various", 0, { is_placeholder: true }),
    ]);
    expect(segments).toEqual([{ text: "Various feat. X" }]);
  });

  it("is all text when there are no credits", () => {
    expect(splitArtistCredits("Nobody", [])).toEqual([{ text: "Nobody" }]);
  });
});

describe("ArtistLink", () => {
  it("falls back to the album search when credits were not loaded", () => {
    renderWithProviders(<ArtistLink artist="Los Mirlos" friendId={2} />);
    expect(screen.getByRole("link", { name: "Los Mirlos" }).getAttribute("href")).toBe(
      "/albums?q=Los%20Mirlos&friend_id=2",
    );
  });

  it("renders a function child around the album search text", () => {
    renderWithProviders(
      <ArtistLink artist="Los Mirlos">{(text) => <em data-testid="s">{text}!</em>}</ArtistLink>,
    );
    expect(screen.getByTestId("s").textContent).toBe("Los Mirlos!");
  });

  it("renders node children inside the link", () => {
    renderWithProviders(
      <ArtistLink artist="Los Mirlos">
        <span>custom</span>
      </ArtistLink>,
    );
    expect(screen.getByRole("link", { name: "custom" })).toBeTruthy();
  });

  it("links each credited artist to their page and keeps the joiner", () => {
    const { container } = renderWithProviders(
      <ArtistLink
        artist="Mexican Institute of Sound & Meridian Brothers"
        credits={[credit(1, "Mexican Institute of Sound", 0), credit(2, "Meridian Brothers", 1)]}
      />,
    );
    const links = screen.getAllByRole("link");
    expect(links.map((l) => l.getAttribute("href"))).toEqual([
      "/artists/mexican-institute-of-sound",
      "/artists/meridian-brothers",
    ]);
    expect(container.textContent).toBe("Mexican Institute of Sound & Meridian Brothers");
  });

  it("styles each link through a function child", () => {
    renderWithProviders(
      <ArtistLink artist="A & B" credits={[credit(1, "A", 0), credit(2, "B", 1)]}>
        {(text) => <b>{text}</b>}
      </ArtistLink>,
    );
    expect(screen.getAllByRole("link").map((l) => l.querySelector("b")?.textContent)).toEqual([
      "A",
      "B",
    ]);
  });

  it("leaves placeholders and unreconciled strings as plain text", () => {
    renderWithProviders(
      <>
        <ArtistLink
          artist="Various"
          credits={[credit(1, "Various", 0, { is_placeholder: true })]}
        />
        <ArtistLink artist="Unreconciled" credits={[]} />
      </>,
    );
    expect(screen.queryAllByRole("link")).toHaveLength(0);
    expect(screen.getByText("VariousUnreconciled")).toBeTruthy();
  });

  it("stops the click reaching a clickable row when asked, and only then", () => {
    const row = vi.fn();
    const credits = [credit(1, "A", 0)];
    const { rerender } = renderWithProviders(
      <div onClick={row}>
        <ArtistLink artist="A" credits={credits} stopPropagation />
      </div>,
    );
    fireEvent.click(screen.getByRole("link"));
    expect(row).not.toHaveBeenCalled();

    rerender(
      <div onClick={row}>
        <ArtistLink artist="A" credits={credits} />
      </div>,
    );
    fireEvent.click(screen.getByRole("link"));
    expect(row).toHaveBeenCalledTimes(1);
  });

  it("is reachable by keyboard, one tab stop per credited artist", async () => {
    const user = userEvent.setup();
    renderWithProviders(
      <ArtistLink artist="A & B" credits={[credit(1, "A", 0), credit(2, "B", 1)]} />,
    );
    await user.tab();
    expect(document.activeElement).toBe(screen.getByRole("link", { name: "A" }));
    await user.tab();
    expect(document.activeElement).toBe(screen.getByRole("link", { name: "B" }));
  });
});
