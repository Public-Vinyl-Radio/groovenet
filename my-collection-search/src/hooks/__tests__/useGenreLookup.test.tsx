// @vitest-environment jsdom
import React from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

const fetchGenreTree = vi.hoisted(() => vi.fn());
vi.mock("@/services/internalApi/genres", () => ({ fetchGenreTree }));

import { useGenreLookup } from "../useGenreTaxonomyQuery";

const tree = [
  {
    id: "c",
    name: "Cumbia",
    slug: "cumbia",
    parent_id: null,
    source: "discogs",
    track_count: 0,
    album_count: 0,
    aliases: ["cumbia colombiana"],
    children: [],
  },
];

describe("useGenreLookup", () => {
  beforeEach(() => {
    fetchGenreTree.mockReset().mockResolvedValue(tree);
  });

  it("is empty until the taxonomy loads, then maps names and aliases to slugs", async () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const wrapper = ({ children }: { children: React.ReactNode }) => (
      <QueryClientProvider client={client}>{children}</QueryClientProvider>
    );
    const { result } = renderHook(() => useGenreLookup(), { wrapper });

    expect(result.current.size).toBe(0);
    await waitFor(() => expect(result.current.get("cumbia colombiana")).toBe("cumbia"));
  });

  it("shares one lookup between every caller of the same tree", async () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const wrapper = ({ children }: { children: React.ReactNode }) => (
      <QueryClientProvider client={client}>{children}</QueryClientProvider>
    );
    const { result } = renderHook(() => [useGenreLookup(), useGenreLookup()], { wrapper });

    await waitFor(() => expect(result.current[0].size).toBeGreaterThan(0));
    expect(result.current[0]).toBe(result.current[1]);
  });
});
