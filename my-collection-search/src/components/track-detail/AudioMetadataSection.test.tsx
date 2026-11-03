// @vitest-environment jsdom
import React from "react";
import { expect, it, vi } from "vitest";
import { fireEvent, screen } from "@testing-library/react";
import { renderWithProviders } from "@/test/renderWithProviders";
import AudioMetadataSection from "./AudioMetadataSection";
import type { UseQueryResult } from "@tanstack/react-query";
import type { TrackAudioMetadataResponse } from "@/services/internalApi/tracks";

it("shares missing and broken art fallback and prefers the saved cover to metadata art", () => {
  const query = {
    data: {
      has_embedded_cover: true,
      local_audio_url: "/audio/a.mp3",
      audio_file_album_art_url: "/metadata.jpg",
    },
  } as UseQueryResult<TrackAudioMetadataResponse, Error>;
  const props = { query, isExtractingCover: false, onExtractCover: vi.fn() };
  const { container, rerender } = renderWithProviders(
    <AudioMetadataSection {...props} trackAudioCoverUrl="/saved.jpg" />,
  );
  expect(screen.getByRole("img").getAttribute("src")).toBe("/saved.jpg");
  fireEvent.error(screen.getByRole("img"));
  expect(container.querySelector("[data-cover-placeholder]")).toBeTruthy();
  rerender(<AudioMetadataSection {...props} />);
  expect(screen.getByRole("img").getAttribute("src")).toBe("/metadata.jpg");
  rerender(
    <AudioMetadataSection
      {...props}
      query={
        { data: { ...query.data, audio_file_album_art_url: null } } as UseQueryResult<
          TrackAudioMetadataResponse,
          Error
        >
      }
    />,
  );
  expect(screen.queryByRole("img")).toBeNull();
  expect(container.querySelector("[data-cover-placeholder]")).toBeTruthy();
});
