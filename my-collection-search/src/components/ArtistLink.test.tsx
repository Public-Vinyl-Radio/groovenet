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
  it("builds the line from the credits, keeping the credited joiner", () => {
    const a = credit(1, "A", 0, { joiner: "&" });
    const b = credit(2, "B", 1);
    expect(splitArtistCredits("A & B", [b, a])).toEqual([
      { text: "A", credit: a },
      { text: " & " },
      { text: "B", credit: b },
    ]);
  });

  it("links an inverted display string by the credited name", () => {
    const c = credit(66, "The Strokes", 0, { credited_as: "Strokes, The" });
    expect(splitArtistCredits("Strokes, The", [c])).toEqual([{ text: "The Strokes", credit: c }]);
  });

  it("drops a Discogs (n) suffix because the name carries none", () => {
    const c = credit(1, "Charisma", 0, { credited_as: "Charisma (12)" });
    expect(splitArtistCredits("Charisma (12)", [c])).toEqual([{ text: "Charisma", credit: c }]);
  });

  it("writes a comma joiner as ', ' and other words between spaces", () => {
    const segments = splitArtistCredits("A, B Featuring C", [
      credit(1, "A", 0, { joiner: "," }),
      credit(2, "B", 1, { joiner: "Featuring" }),
      credit(3, "C", 2, { role: "featured" }),
    ]);
    expect(segments.map((s) => s.text)).toEqual(["A", ", ", "B", " Featuring ", "C"]);
  });

  it("leaves out remixers and composers, repeats and nameless credits", () => {
    const a = credit(1, "A", 0);
    const segments = splitArtistCredits("A", [
      a,
      credit(1, "A", 1, { role: "featured" }),
      credit(2, "Remixer", 2, { role: "remixer" }),
      credit(4, "Composer", 3, { role: "composer" }),
      credit(3, "", 4, { credited_as: "" }),
    ]);
    expect(segments).toEqual([{ text: "A", credit: a }]);
  });

  it("falls back to the name when there is no credited spelling", () => {
    const c = credit(1, "A", 0, { credited_as: "" });
    expect(splitArtistCredits("a", [c])[0].credit).toBe(c);
  });

  it("uses the credited spelling when the name is empty", () => {
    const c = credit(1, "", 0, { credited_as: "Odd" });
    expect(splitArtistCredits("Odd", [c])).toEqual([{ text: "Odd", credit: c }]);
  });

  it("keeps placeholders plain and merged with neighbouring text", () => {
    const segments = splitArtistCredits("Various", [
      credit(1, "Various", 0, { is_placeholder: true, joiner: "&" }),
      credit(2, "Some", 1, { is_placeholder: true }),
    ]);
    expect(segments).toEqual([{ text: "Various & Some" }]);
  });

  it("finds credits without stored joiners in the display string", () => {
    const a = credit(1, "A", 0);
    const b = credit(2, "B", 1);
    expect(splitArtistCredits("A and B", [a, b])).toEqual([
      { text: "A", credit: a },
      { text: " and " },
      { text: "B", credit: b },
    ]);
  });

  it("keeps text around credits found in a string without stored joiners", () => {
    const b = credit(2, "B", 1);
    const segments = splitArtistCredits("Intro A and B outro", [
      credit(1, "A", 0, { is_placeholder: true }),
      credit(3, "Ghost", 1, { is_placeholder: true }),
      b,
    ]);
    expect(segments).toEqual([
      { text: "Intro A and " },
      { text: "B", credit: b },
      { text: " outro" },
    ]);
  });

  it("joins with commas when joiners are missing and the string does not show the credits", () => {
    const segments = splitArtistCredits("Strokes, The / Other", [
      credit(1, "The Strokes", 0),
      credit(2, "Other", 1),
    ]);
    expect(segments.map((s) => s.text)).toEqual(["The Strokes", ", ", "Other"]);
  });

  it("shows the display string when there are no credits", () => {
    expect(splitArtistCredits("Nobody", [])).toEqual([{ text: "Nobody" }]);
    expect(splitArtistCredits("Remix only", [credit(1, "R", 0, { role: "remixer" })])).toEqual([
      { text: "Remix only" },
    ]);
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
        credits={[
          credit(1, "Mexican Institute of Sound", 0, { joiner: "&" }),
          credit(2, "Meridian Brothers", 1),
        ]}
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
