// @vitest-environment jsdom
import React from "react";
import { describe, expect, it } from "vitest";
import { screen } from "@testing-library/react";
import type { UseQueryResult } from "@tanstack/react-query";
import { renderWithProviders } from "@/test/renderWithProviders";
import type { ContextEmbeddingPreviewResponse } from "@/services/internalApi/tracks";
import ContextEmbeddingSection from "./ContextEmbeddingSection";

type Query = UseQueryResult<ContextEmbeddingPreviewResponse, Error>;
const query = (state: Partial<Query>) => ({ isLoading: false, error: null, data: undefined, ...state }) as Query;

const data: ContextEmbeddingPreviewResponse = {
  contextText: "chicha, cumbia. latin music from the 1970s.\nTrack: Song — Artist",
  contextData: {
    title: "Song", artist: "Artist", album: "Album", era: "1970s", country: "peru",
    labels: [], composers: [], genres: ["latin"], styles: ["cumbia"], tags: ["chicha"],
  },
};

describe("ContextEmbeddingSection", () => {
  it("shows the exact text natural-language search embeds, with its era", () => {
    renderWithProviders(<ContextEmbeddingSection query={query({ data })} />);
    expect(screen.getByText("Context Embedding Preview")).toBeTruthy();
    expect(screen.getByText("Natural-language search")).toBeTruthy();
    expect(screen.getByText("1970s")).toBeTruthy();
    expect(screen.getByText(/chicha, cumbia\. latin music from the 1970s\./).textContent).toBe(data.contextText);
  });

  it("explains that the preview is built from the track as it is now", () => {
    renderWithProviders(<ContextEmbeddingSection query={query({ data })} />);
    expect(screen.getByText(/matches the stored vector unless the track changed/)).toBeTruthy();
  });

  it("shows an error", () => {
    renderWithProviders(<ContextEmbeddingSection query={query({ error: new Error("Track not found") })} />);
    expect(screen.getByText("Track not found")).toBeTruthy();
  });

  it("falls back to a generic error message", () => {
    renderWithProviders(<ContextEmbeddingSection query={query({ error: new Error("") })} />);
    expect(screen.getByText("Failed to load context embedding preview")).toBeTruthy();
  });

  it("says when there is nothing to show", () => {
    renderWithProviders(<ContextEmbeddingSection query={query({})} />);
    expect(screen.getByText("No context embedding preview available.")).toBeTruthy();
  });

  it("shows placeholders while loading", () => {
    renderWithProviders(<ContextEmbeddingSection query={query({ isLoading: true })} />);
    expect(screen.queryByText("Natural-language search")).toBeNull();
  });
});
