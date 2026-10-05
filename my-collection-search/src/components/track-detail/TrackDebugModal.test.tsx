// @vitest-environment jsdom
import React from "react";
import { describe, expect, it, vi } from "vitest";
import { screen } from "@testing-library/react";
import type { UseMutationResult, UseQueryResult } from "@tanstack/react-query";
import { renderWithProviders } from "@/test/renderWithProviders";

// The sections have their own tests; here only which ones the modal shows matters.
vi.mock("./AudioMetadataSection", () => ({ default: () => <div>audio metadata section</div> }));
vi.mock("./EssentiaSection", () => ({ default: () => <div>essentia section</div> }));
vi.mock("./IdentityEmbeddingSection", () => ({ default: () => <div>identity section</div> }));
vi.mock("./AudioVibeEmbeddingSection", () => ({ default: () => <div>audio vibe section</div> }));

import TrackDebugModal from "./TrackDebugModal";

const query = (data: unknown) => ({ isLoading: false, error: null, data }) as unknown as UseQueryResult<never, Error>;

describe("TrackDebugModal", () => {
  it("shows the context text natural-language search uses, next to identity and audio vibe", () => {
    renderWithProviders(
      <TrackDebugModal
        open
        onOpenChange={() => {}}
        audioMetadataQuery={query(undefined)}
        essentiaQuery={query(undefined)}
        identityEmbeddingPreviewQuery={query(undefined)}
        contextEmbeddingPreviewQuery={query({
          contextText: "dub, reggae. jamaican music from the 1970s.",
          contextData: { title: "", artist: "", album: "", era: "1970s", country: "", labels: [], composers: [], genres: [], styles: [], tags: [] },
        })}
        audioVibeEmbeddingPreviewQuery={query(undefined)}
        extractCoverMutation={{ isPending: false } as unknown as UseMutationResult<string | null, Error, void, unknown>}
        onExtractCover={async () => {}}
      />
    );

    expect(screen.getByText("identity section")).toBeTruthy();
    expect(screen.getByText("Context Embedding Preview")).toBeTruthy();
    expect(screen.getByText("dub, reggae. jamaican music from the 1970s.")).toBeTruthy();
    expect(screen.getByText("audio vibe section")).toBeTruthy();
  });
});
