// @vitest-environment jsdom
import React from "react";
import { describe, expect, it, vi } from "vitest";
import { screen } from "@testing-library/react";
import { renderWithProviders } from "@/test/renderWithProviders";
import TrackIdentity, { TrackCoverLink, TrackTitleLink, trackHref } from "./TrackIdentity";

const track = {
  track_id: "a/b",
  title: "Cumbia Sonidera",
  artist: "Los Mirlos",
  album: "Sonido Amazonico",
  release_id: "123",
  friend_id: 2,
};

describe("trackHref", () => {
  it("encodes the id and carries the friend", () => {
    expect(trackHref(track)).toBe("/tracks/a%2Fb?friend_id=2");
  });
  it("leaves out a missing friend", () => {
    expect(trackHref({ track_id: "x", friend_id: undefined })).toBe("/tracks/x");
  });
});

describe("TrackIdentity", () => {
  it("links title, artist and album", () => {
    renderWithProviders(<TrackIdentity track={track} />);
    expect(screen.getByRole("link", { name: "Cumbia Sonidera" }).getAttribute("href")).toBe(
      "/tracks/a%2Fb?friend_id=2",
    );
    expect(screen.getByRole("link", { name: "Los Mirlos" }).getAttribute("href")).toBe(
      "/albums?q=Los%20Mirlos&friend_id=2",
    );
    expect(screen.getByRole("link", { name: "Sonido Amazonico" }).getAttribute("href")).toBe(
      "/albums/123?friend_id=2",
    );
  });

  it("keeps the album as text without a release id", () => {
    renderWithProviders(<TrackIdentity track={{ ...track, release_id: undefined }} />);
    expect(screen.queryByRole("link", { name: "Sonido Amazonico" })).toBeNull();
    expect(screen.getByText(/Sonido Amazonico/)).toBeTruthy();
  });

  it("drops the friend from hrefs when there is none", () => {
    renderWithProviders(<TrackIdentity track={{ ...track, friend_id: undefined }} />);
    expect(screen.getByRole("link", { name: "Cumbia Sonidera" }).getAttribute("href")).toBe(
      "/tracks/a%2Fb",
    );
    expect(screen.getByRole("link", { name: "Sonido Amazonico" }).getAttribute("href")).toBe(
      "/albums/123",
    );
  });

  it("links only the title in title mode, and nothing in none mode", () => {
    const { unmount } = renderWithProviders(<TrackIdentity track={track} links="title" />);
    expect(screen.getAllByRole("link")).toHaveLength(1);
    expect(screen.getByText("Los Mirlos · Sonido Amazonico")).toBeTruthy();
    unmount();
    renderWithProviders(<TrackIdentity track={track} links="none" />);
    expect(screen.queryByRole("link")).toBeNull();
  });

  it("hides the album and names long text in a tooltip", () => {
    renderWithProviders(<TrackIdentity track={track} hideAlbum links="none" />);
    expect(screen.getByText("Cumbia Sonidera").getAttribute("title")).toBe("Cumbia Sonidera");
    expect(screen.getByText("Los Mirlos").getAttribute("title")).toBe("Los Mirlos");
  });

  it("stops clicks reaching the row, unless told not to", async () => {
    const onRow = vi.fn();
    const { user, unmount } = renderWithProviders(
      <div onClick={onRow}>
        <TrackIdentity track={track} />
      </div>,
    );
    await user.click(screen.getByRole("link", { name: "Cumbia Sonidera" }));
    await user.click(screen.getByRole("link", { name: "Los Mirlos" }));
    await user.click(screen.getByRole("link", { name: "Sonido Amazonico" }));
    expect(onRow).not.toHaveBeenCalled();
    unmount();
    const open = renderWithProviders(
      <div onClick={onRow}>
        <TrackTitleLink track={track} stopPropagation={false} />
      </div>,
    );
    await open.user.click(screen.getByRole("link"));
    expect(onRow).toHaveBeenCalledTimes(1);
  });
});

describe("TrackCoverLink", () => {
  it("is a hidden, untabbable link to the album", async () => {
    const onRow = vi.fn();
    const { user } = renderWithProviders(
      <div onClick={onRow}>
        <TrackCoverLink track={track}>
          <span>cover</span>
        </TrackCoverLink>
      </div>,
    );
    const link = screen.getByText("cover").closest("a")!;
    expect(link.getAttribute("href")).toBe("/albums/123?friend_id=2");
    expect(link.getAttribute("aria-hidden")).toBe("true");
    expect(link.getAttribute("tabindex")).toBe("-1");
    await user.click(link);
    expect(onRow).not.toHaveBeenCalled();
  });

  it("is just the cover without a release", () => {
    renderWithProviders(
      <TrackCoverLink track={{ ...track, release_id: undefined }}>
        <span>cover</span>
      </TrackCoverLink>,
    );
    expect(screen.getByText("cover").closest("a")).toBeNull();
  });
});
